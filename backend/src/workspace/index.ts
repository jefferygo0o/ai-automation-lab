import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { Hono } from "hono";
import type { HonoEnv } from "../types/hono.ts";

const BASE_ROOT = resolve(process.env.LAB_WORKSPACE_ROOT ?? (process.env.LAB_DATA_DIR ? join(process.env.LAB_DATA_DIR, "workspace") : "/home/workspace"));
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
      if (!existsSync(targetEntry)) renameSync(sourceEntry, targetEntry);
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
    }
  }
}

function ensureLayout(): void {
  ensureDirectory(BASE_ROOT);
  for (const path of [
    join(BASE_ROOT, "Documents"),
    join(BASE_ROOT, "Projects"),
    join(BASE_ROOT, "Downloads"),
    join(BASE_ROOT, "Images"),
    join(BASE_ROOT, "Sites"),
    join(BASE_ROOT, "Skills"),
    join(BASE_ROOT, "Trash"),
    join(BASE_ROOT, ".zo", "agents"),
    join(BASE_ROOT, ".zo", "sandboxes"),
    join(BASE_ROOT, ".zo", "snapshots"),
    join(BASE_ROOT, ".zo", "metadata"),
    join(BASE_ROOT, ".zo", "indexes"),
  ]) ensureDirectory(path);

  migrateDirectory(process.env.LAB_AGENTS_DIR, join(BASE_ROOT, ".zo", "agents"));
  migrateDirectory(process.env.LAB_SANDBOX_ROOT, join(BASE_ROOT, ".zo", "sandboxes"));
  migrateDirectory(process.env.LAB_SKILLS_DIR, join(BASE_ROOT, "Skills"));
  migrateDirectory(join(import.meta.dir, "..", "..", "data", "agents"), join(BASE_ROOT, ".zo", "agents"));
  migrateDirectory(join(import.meta.dir, "..", "..", "data", "sandboxes"), join(BASE_ROOT, ".zo", "sandboxes"));
  migrateDirectory(join(import.meta.dir, "..", "..", "data", "skills"), join(BASE_ROOT, "Skills"));
}

ensureLayout();

export const WorkspaceService = {
  root(): string {
    return realpathSync(BASE_ROOT);
  },
  documentsRoot(): string { return join(this.root(), "Documents"); },
  projectsRoot(): string { return join(this.root(), "Projects"); },
  downloadsRoot(): string { return join(this.root(), "Downloads"); },
  imagesRoot(): string { return join(this.root(), "Images"); },
  sitesRoot(): string { return join(this.root(), "Sites"); },
  skillsRoot(): string { return join(this.root(), "Skills"); },
  trashRoot(): string { return join(this.root(), "Trash"); },
  zoRoot(): string { return join(this.root(), ".zo"); },
  agentsRoot(): string { return join(this.zoRoot(), "agents"); },
  agentRoot(agentId: string): string { return join(this.agentsRoot(), safeId(agentId)); },
  agentSkillsRoot(agentId: string): string { return join(this.agentRoot(agentId), "skills"); },
  sandboxesRoot(): string { return join(this.zoRoot(), "sandboxes"); },
  sandboxRoot(agentId: string): string { return join(this.sandboxesRoot(), safeId(agentId)); },
  snapshotsRoot(): string { return join(this.zoRoot(), "snapshots"); },
  metadataRoot(): string { return join(this.zoRoot(), "metadata"); },
  indexesRoot(): string { return join(this.zoRoot(), "indexes"); },
  resolve(rawPath: string): string | null {
    const root = this.root();
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
  },
  relative(absPath: string): string {
    const value = relative(this.root(), absPath);
    return value || ".";
  },
};

export const AGENTS_DIR = WorkspaceService.agentsRoot();
export const SITES_DIR = WorkspaceService.sitesRoot();
export const SKILLS_DIR = WorkspaceService.skillsRoot();
export const SANDBOXES_DIR = WorkspaceService.sandboxesRoot();

function entryFor(absPath: string, name: string): FileEntry {
  const stat = statSync(absPath);
  return { name, path: WorkspaceService.relative(absPath), type: stat.isDirectory() ? "dir" : "file", size: stat.isFile() ? stat.size : 0, mtime: stat.mtimeMs };
}

function listDirectory(absDir: string): FileEntry[] {
  return readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => !EXCLUDED_DIRS.has(entry.name))
    .map((entry) => entryFor(join(absDir, entry.name), entry.name))
    .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
}

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : lower;
  return new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".less", ".html", ".htm", ".svg", ".sh", ".bash", ".py", ".rb", ".rs", ".go", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp", ".sql", ".graphql", ".proto", ".env", ".conf", ".cfg", ".ini", ".properties", ".vue", ".svelte", ".astro", ".lock", ".mod", ".sum", "dockerfile", ".gitignore"]).has(ext);
}

function readWorkspaceFile(rawPath: string): { content: string; encoding: "utf-8" | "base64"; size: number } | null {
  const absPath = WorkspaceService.resolve(rawPath);
  if (!absPath || !existsSync(absPath) || lstatSync(absPath).isDirectory()) return null;
  const stat = statSync(absPath);
  if (stat.size > MAX_READ_BYTES) throw new Error(`file exceeds ${MAX_READ_BYTES} byte read limit`);
  const buffer = readFileSync(absPath);
  return { content: isTextFile(basename(absPath)) ? buffer.toString("utf8") : buffer.toString("base64"), encoding: isTextFile(basename(absPath)) ? "utf-8" : "base64", size: stat.size };
}

export const workspaceApi = new Hono<HonoEnv>();

workspaceApi.get("/tree", (c) => {
  const absDir = WorkspaceService.resolve(c.req.query("path") ?? ".");
  if (!absDir) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absDir) || !lstatSync(absDir).isDirectory()) return c.json({ error: "directory not found" }, 404);
  return c.json({ path: WorkspaceService.relative(absDir), entries: listDirectory(absDir) });
});

workspaceApi.get("/read", (c) => {
  const rawPath = c.req.query("path") ?? "";
  if (!rawPath) return c.json({ error: "path required" }, 400);
  try {
    const result = readWorkspaceFile(rawPath);
    if (!result) return c.json({ error: "file not found" }, 404);
    return c.json({ path: WorkspaceService.relative(WorkspaceService.resolve(rawPath)!), ...result });
  } catch (error: any) {
    return c.json({ error: error?.message ?? String(error) }, 413);
  }
});

workspaceApi.put("/write", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { path?: string; content?: string };
  if (!body.path || typeof body.content !== "string") return c.json({ error: "path and string content required" }, 400);
  const absPath = WorkspaceService.resolve(body.path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, body.content, "utf8");
  return c.json({ ok: true, path: WorkspaceService.relative(absPath) });
});

workspaceApi.post("/mkdir", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  if (!body.path) return c.json({ error: "path required" }, 400);
  const absPath = WorkspaceService.resolve(body.path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  mkdirSync(absPath, { recursive: true });
  return c.json({ ok: true, path: WorkspaceService.relative(absPath) });
});

workspaceApi.delete("/delete", async (c) => {
  const queryPath = c.req.query("path");
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  const rawPath = queryPath ?? body.path;
  if (!rawPath) return c.json({ error: "path required" }, 400);
  const absPath = WorkspaceService.resolve(rawPath);
  if (!absPath || absPath === WorkspaceService.root()) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absPath)) return c.json({ error: "not found" }, 404);
  const trashPath = join(WorkspaceService.trashRoot(), `${Date.now()}-${basename(absPath)}`);
  renameSync(absPath, trashPath);
  return c.json({ ok: true, trashPath: WorkspaceService.relative(trashPath) });
});

workspaceApi.get("/info", (c) => {
  const absPath = WorkspaceService.resolve(c.req.query("path") ?? ".");
  if (!absPath || !existsSync(absPath)) return c.json({ error: "not found" }, 404);
  const stat = statSync(absPath);
  return c.json({ path: WorkspaceService.relative(absPath), type: stat.isDirectory() ? "dir" : "file", size: stat.size, mtime: stat.mtimeMs });
});
