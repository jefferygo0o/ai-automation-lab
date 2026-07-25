/**
 * Per-user workspace service.
 *
 * Every user gets an isolated workspace directory at:
 *   {BASE_ROOT}/{userId}/
 *
 * All agents for a given user share that user's workspace, but no user can
 * see or modify another user's files.  The sandbox workdir is also scoped
 * to the user's workspace.
 */

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { Hono } from "hono";
import type { HonoEnv } from "../types/hono.ts";

export const BASE_ROOT = resolve(process.env.LAB_WORKSPACE_ROOT ?? (process.env.LAB_DATA_DIR ? join(process.env.LAB_DATA_DIR, "workspace") : "/home/workspace"));
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "__pycache__", ".cache", ".next", "dist", ".venv", "venv", ".bun", "build", ".turbo"]);
const MAX_READ_BYTES = 2 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

function safeId(value: string): string {
  if (!SAFE_ID.test(value)) throw new Error("invalid workspace identifier");
  return value;
}

function ensureDirectory(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

function migrateDirectory(source: string | undefined, target: string): void {
  if (!source) return;
  const sourceAbs = resolve(source);
  const targetAbs = resolve(target);
  if (sourceAbs === targetAbs || !existsSync(sourceAbs)) return;
  if (existsSync(targetAbs)) {
    const sourceEntries = readdirSync(sourceAbs);
    for (const entry of sourceEntries) {
      const sourceEntry = join(sourceAbs, entry);
      const targetEntry = join(targetAbs, entry);
      if (!existsSync(targetEntry)) { try { renameSync(sourceEntry, targetEntry); } catch (e2) { cpSync(sourceEntry, targetEntry, { recursive: true }); try { rmSync(sourceEntry, { recursive: true, force: true }); } catch {} } }
    }
    try { rmSync(sourceAbs, { recursive: true, force: true }); } catch {}
    return;
  }
  mkdirSync(targetAbs, { recursive: true });
  for (const entry of readdirSync(sourceAbs)) {
    const from = join(sourceAbs, entry);
    const to = join(targetAbs, entry);
    if (existsSync(to)) continue;
    try {
      renameSync(from, to);
    } catch {
      cpSync(from, to, { recursive: true });
      try { rmSync(from, { recursive: true, force: true }); } catch {}
    }
  }
}

function ensureUserLayout(userRoot: string): void {
  ensureDirectory(userRoot);
  for (const p of [
    join(userRoot, "Documents"),
    join(userRoot, "Projects"),
    join(userRoot, "Downloads"),
    join(userRoot, "Images"),
    join(userRoot, "Sites"),
    join(userRoot, "Skills"),
    join(userRoot, "Trash"),
    join(userRoot, ".zo", "agents"),
    join(userRoot, ".zo", "sandboxes"),
    join(userRoot, ".zo", "snapshots"),
    join(userRoot, ".zo", "metadata"),
    join(userRoot, ".zo", "indexes"),
  ]) ensureDirectory(p);
}

function ensureBaseLayout(): void {
  ensureDirectory(BASE_ROOT);
}

// Run base layout once at module load
ensureBaseLayout();

// ── Per-user workspace factory ──────────────────────────────────────────

export function workspaceFor(userId: string): WorkspaceService {
  const uid = safeId(userId);
  const userRoot = join(BASE_ROOT, uid);
  ensureUserLayout(userRoot);
  return new WorkspaceService(userRoot);
}

class WorkspaceService {
  private readonly _root: string;

  constructor(userRoot: string) {
    this._root = userRoot;
  }

  root(): string {
    return this._root;
  }

  documentsRoot(): string { return join(this._root, "Documents"); }
  projectsRoot(): string { return join(this._root, "Projects"); }
  downloadsRoot(): string { return join(this._root, "Downloads"); }
  imagesRoot(): string { return join(this._root, "Images"); }
  sitesRoot(): string { return join(this._root, "Sites"); }
  skillsRoot(): string { return join(this._root, "Skills"); }
  trashRoot(): string { return join(this._root, "Trash"); }
  zoRoot(): string { return join(this._root, ".zo"); }
  agentsRoot(): string { return join(this.zoRoot(), "agents"); }
  agentRoot(agentId: string): string { return join(this.agentsRoot(), safeId(agentId)); }
  agentSkillsRoot(agentId: string): string { return join(this.agentRoot(agentId), "skills"); }
  sandboxesRoot(): string { return join(this.zoRoot(), "sandboxes"); }
  sandboxRoot(agentId: string): string { return join(this.sandboxesRoot(), safeId(agentId)); }
  snapshotsRoot(): string { return join(this.zoRoot(), "snapshots"); }
  metadataRoot(): string { return join(this.zoRoot(), "metadata"); }
  indexesRoot(): string { return join(this.zoRoot(), "indexes"); }

  resolve(rawPath: string): string | null {
    const root = this._root;
    const candidate = resolve(root, rawPath || ".");
    let resolved = candidate;
    try {
      resolved = realpathSync(candidate);
    } catch {
      try {
        resolved = join(realpathSync(dirname(candidate)), basename(candidate));
      } catch {
        return null;
      }
    }
    if (resolved !== root && !resolved.startsWith(root + sep)) return null;
    return resolved;
  }

  relative(absPath: string): string {
    const value = relative(this._root, absPath);
    return value || ".";
  }

  listTrash() {
    const root = this.trashRoot();
    return readdirSync(root, { withFileTypes: true }).map((entry) => {
      const absPath = join(root, entry.name);
      return entryFor(absPath, entry.name, this);
    }).sort((a, b) => b.mtime - a.mtime);
  }

  restoreTrash(name: string): string {
    const trashPath = this.resolve(join("Trash", name));
    if (!trashPath || !existsSync(trashPath)) throw new Error("trash item not found");
    const originalName = name.replace(/^\d+-/, "");
    const destination = this.resolve(originalName);
    if (!destination) throw new Error("invalid restore destination");
    if (existsSync(destination)) throw new Error("restore destination already exists");
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(trashPath, destination);
    return this.relative(destination);
  }

  createSnapshot(label = "manual") {
    const id = `${Date.now()}-${label.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    const destination = join(this.snapshotsRoot(), id);
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(this._root, { withFileTypes: true })) {
      if (entry.name === "Trash" || entry.name === ".zo" || EXCLUDED_DIRS.has(entry.name)) continue;
      cpSync(join(this._root, entry.name), join(destination, entry.name), { recursive: true });
    }
    writeFileSync(join(destination, "snapshot.json"), JSON.stringify({ id, label, createdAt: Date.now() }, null, 2));
    return { id, label, createdAt: Date.now(), path: this.relative(destination) };
  }

  listSnapshots() {
    const root = this.snapshotsRoot();
    return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
      const metadataPath = join(root, entry.name, "snapshot.json");
      try { return JSON.parse(readFileSync(metadataPath, "utf8")); } catch { return { id: entry.name, label: "unknown" }; }
    }).sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  }

  restoreSnapshot(id: string) {
    const snapshot = this.resolve(join(".zo", "snapshots", id));
    if (!snapshot || !existsSync(snapshot)) throw new Error("snapshot not found");
    for (const entry of readdirSync(snapshot, { withFileTypes: true })) {
      if (entry.name === "snapshot.json") continue;
      const destination = join(this._root, entry.name);
      cpSync(join(snapshot, entry.name), destination, { recursive: true, force: true });
    }
    return { ok: true, id };
  }
}

export { WorkspaceService };

// ── Helpers ──────────────────────────────────────────────────────────────

function entryFor(absPath: string, name: string, ws: WorkspaceService): FileEntry {
  const stat = statSync(absPath);
  return { name, path: ws.relative(absPath), type: stat.isDirectory() ? "dir" : "file", size: stat.isFile() ? stat.size : 0, mtime: stat.mtimeMs };
}

function listDirectory(absDir: string, ws: WorkspaceService): FileEntry[] {
  return readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => !EXCLUDED_DIRS.has(entry.name))
    .map((entry) => entryFor(join(absDir, entry.name), entry.name, ws))
    .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
}

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : lower;
  return new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".less", ".html", ".htm", ".svg", ".sh", ".bash", ".py", ".rb", ".rs", ".go", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp", ".sql", ".graphql", ".proto", ".env", ".conf", ".cfg", ".ini", ".properties", ".vue", ".svelte", ".astro", ".lock", ".mod", ".sum", "dockerfile", ".gitignore"]).has(ext);
}

function readWorkspaceFile(ws: WorkspaceService, rawPath: string): { content: string; encoding: "utf-8" | "base64"; size: number } | null {
  const absPath = ws.resolve(rawPath);
  if (!absPath || !existsSync(absPath) || lstatSync(absPath).isDirectory()) return null;
  const stat = statSync(absPath);
  if (stat.size > MAX_READ_BYTES) throw new Error(`file exceeds ${MAX_READ_BYTES} byte read limit`);
  const buffer = readFileSync(absPath);
  return { content: isTextFile(basename(absPath)) ? buffer.toString("utf8") : buffer.toString("base64"), encoding: isTextFile(basename(absPath)) ? "utf-8" : "base64", size: stat.size };
}

// ── Workspace HTTP API (per-user) ───────────────────────────────────────

export const workspaceApi = new Hono<HonoEnv>();

/** Extract userId from context — must be set by the parent auth middleware. */
function userIdFrom(c: any): string {
  const uid = c.get("userId") as string;
  if (!uid) throw new Error("unauthorized");
  return uid;
}

workspaceApi.get("/tree", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const absDir = ws.resolve(c.req.query("path") ?? ".");
  if (!absDir) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absDir) || !lstatSync(absDir).isDirectory()) return c.json({ error: "directory not found" }, 404);
  return c.json({ path: ws.relative(absDir), entries: listDirectory(absDir, ws) });
});

workspaceApi.get("/read", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const rawPath = c.req.query("path") ?? "";
  if (!rawPath) return c.json({ error: "path required" }, 400);
  try {
    const result = readWorkspaceFile(ws, rawPath);
    if (!result) return c.json({ error: "file not found" }, 404);
    return c.json({ path: ws.relative(ws.resolve(rawPath)!), ...result });
  } catch (error: any) {
    return c.json({ error: error?.message ?? String(error) }, 413);
  }
});

workspaceApi.put("/write", async (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const body = await c.req.json().catch(() => ({})) as { path?: string; content?: string };
  if (!body.path || typeof body.content !== "string") return c.json({ error: "path and string content required" }, 400);
  const absPath = ws.resolve(body.path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, body.content, "utf8");
  return c.json({ ok: true, path: ws.relative(absPath) });
});

workspaceApi.post("/mkdir", async (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  if (!body.path) return c.json({ error: "path required" }, 400);
  const absPath = ws.resolve(body.path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  mkdirSync(absPath, { recursive: true });
  return c.json({ ok: true, path: ws.relative(absPath) });
});

workspaceApi.delete("/delete", async (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const queryPath = c.req.query("path");
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  const rawPath = queryPath ?? body.path;
  if (!rawPath) return c.json({ error: "path required" }, 400);
  const absPath = ws.resolve(rawPath);
  if (!absPath || absPath === ws.root()) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absPath)) return c.json({ error: "not found" }, 404);
  const trashPath = join(ws.trashRoot(), `${Date.now()}-${basename(absPath)}`);
  renameSync(absPath, trashPath);
  return c.json({ ok: true, trashPath: ws.relative(trashPath) });
});

workspaceApi.get("/info", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const absPath = ws.resolve(c.req.query("path") ?? ".");
  if (!absPath || !existsSync(absPath)) return c.json({ error: "not found" }, 404);
  const stat = statSync(absPath);
  return c.json({ path: ws.relative(absPath), type: stat.isDirectory() ? "dir" : "file", size: stat.size, mtime: stat.mtimeMs });
});

workspaceApi.get("/search", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const query = (c.req.query("q") ?? "").trim().toLowerCase();
  if (!query) return c.json({ error: "q required" }, 400);
  const start = ws.resolve(c.req.query("path") ?? ".");
  if (!start || !existsSync(start) || !lstatSync(start).isDirectory()) return c.json({ error: "directory not found" }, 404);
  const results: Array<FileEntry & { matches?: number }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) { walk(absPath); continue; }
      const searchableName = entry.name.toLowerCase();
      let matches = searchableName.includes(query) ? 1 : 0;
      if (matches === 0 && statSync(absPath).size <= 512 * 1024 && isTextFile(entry.name)) {
        try { matches = readFileSync(absPath, "utf8").toLowerCase().split(query).length - 1; } catch {}
      }
      if (matches > 0) results.push({ ...entryFor(absPath, entry.name, ws), matches });
    }
  };
  walk(start);
  return c.json({ query, results: results.slice(0, 500) });
});

workspaceApi.get("/trash", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  return c.json({ items: ws.listTrash() });
});

workspaceApi.post("/trash/:name/restore", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  try { return c.json({ ok: true, path: ws.restoreTrash(c.req.param("name")) }); }
  catch (error: any) { return c.json({ error: error?.message ?? String(error) }, 400); }
});

workspaceApi.get("/snapshots", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  return c.json({ snapshots: ws.listSnapshots() });
});

workspaceApi.post("/snapshots", async (c) => {
  const ws = workspaceFor(userIdFrom(c));
  const body = await c.req.json().catch(() => ({})) as { label?: string };
  return c.json({ snapshot: ws.createSnapshot(body.label ?? "manual") }, 201);
});

workspaceApi.post("/snapshots/:id/restore", (c) => {
  const ws = workspaceFor(userIdFrom(c));
  try { return c.json(ws.restoreSnapshot(c.req.param("id"))); }
  catch (error: any) { return c.json({ error: error?.message ?? String(error) }, 400); }
});
