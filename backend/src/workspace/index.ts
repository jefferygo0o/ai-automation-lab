import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { Hono } from "hono";
import type { HonoEnv } from "../types/hono.ts";

const WORKSPACE_ROOT = resolve(process.env.LAB_WORKSPACE_ROOT ?? process.env.LAB_PROJECT_ROOT ?? "/home/workspace/Projects/ai-automation-lab");
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "__pycache__", ".cache", ".next", "dist", ".venv", "venv", ".bun", "build", ".turbo"]);
const MAX_READ_BYTES = 2 * 1024 * 1024;

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

function rootRealpath(): string {
  if (!existsSync(WORKSPACE_ROOT)) mkdirSync(WORKSPACE_ROOT, { recursive: true });
  return realpathSync(WORKSPACE_ROOT);
}

function resolveSafe(rawPath: string): string | null {
  const root = rootRealpath();
  const candidate = resolve(root, rawPath || ".");
  let resolved = candidate;
  try {
    resolved = realpathSync(candidate);
  } catch {
    const parent = dirname(candidate);
    try {
      const parentReal = realpathSync(parent);
      resolved = join(parentReal, basename(candidate));
    } catch {
      return null;
    }
  }
  if (resolved !== root && !resolved.startsWith(root + sep)) return null;
  return resolved;
}

function relativePath(absPath: string): string {
  const value = relative(rootRealpath(), absPath);
  return value || ".";
}

function entryFor(absPath: string, name: string): FileEntry {
  const stat = statSync(absPath);
  return {
    name,
    path: relativePath(absPath),
    type: stat.isDirectory() ? "dir" : "file",
    size: stat.isFile() ? stat.size : 0,
    mtime: stat.mtimeMs,
  };
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
  return new Set([
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".less", ".html", ".htm", ".svg", ".sh", ".bash", ".py", ".rb", ".rs", ".go", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp", ".sql", ".graphql", ".proto", ".env", ".conf", ".cfg", ".ini", ".properties", ".vue", ".svelte", ".astro", ".lock", ".mod", ".sum", "dockerfile", ".gitignore",
  ]).has(ext);
}

function readWorkspaceFile(rawPath: string): { content: string; encoding: "utf-8" | "base64"; size: number } | null {
  const absPath = resolveSafe(rawPath);
  if (!absPath || !existsSync(absPath) || lstatSync(absPath).isDirectory()) return null;
  const stat = statSync(absPath);
  if (stat.size > MAX_READ_BYTES) throw new Error(`file exceeds ${MAX_READ_BYTES} byte read limit`);
  const buffer = readFileSync(absPath);
  if (isTextFile(basename(absPath))) return { content: buffer.toString("utf8"), encoding: "utf-8", size: stat.size };
  return { content: buffer.toString("base64"), encoding: "base64", size: stat.size };
}

export const workspaceApi = new Hono<HonoEnv>();

workspaceApi.get("/tree", (c) => {
  const rawPath = c.req.query("path") ?? ".";
  const absDir = resolveSafe(rawPath);
  if (!absDir) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absDir) || !lstatSync(absDir).isDirectory()) return c.json({ error: "directory not found" }, 404);
  return c.json({ path: relativePath(absDir), entries: listDirectory(absDir) });
});

workspaceApi.get("/read", (c) => {
  const rawPath = c.req.query("path") ?? "";
  if (!rawPath) return c.json({ error: "path required" }, 400);
  try {
    const result = readWorkspaceFile(rawPath);
    if (!result) return c.json({ error: "file not found" }, 404);
    return c.json({ path: relativePath(resolveSafe(rawPath)!), ...result });
  } catch (error: any) {
    return c.json({ error: error?.message ?? String(error) }, 413);
  }
});

workspaceApi.put("/write", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { path?: string; content?: string };
  if (!body.path || typeof body.content !== "string") return c.json({ error: "path and string content required" }, 400);
  const absPath = resolveSafe(body.path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, body.content, "utf8");
  return c.json({ ok: true, path: relativePath(absPath) });
});

workspaceApi.post("/mkdir", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  if (!body.path) return c.json({ error: "path required" }, 400);
  const absPath = resolveSafe(body.path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  mkdirSync(absPath, { recursive: true });
  return c.json({ ok: true, path: relativePath(absPath) });
});

workspaceApi.delete("/delete", async (c) => {
  const queryPath = c.req.query("path");
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  const rawPath = queryPath ?? body.path;
  if (!rawPath) return c.json({ error: "path required" }, 400);
  const absPath = resolveSafe(rawPath);
  if (!absPath || absPath === rootRealpath()) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absPath)) return c.json({ error: "not found" }, 404);
  rmSync(absPath, { recursive: true, force: true });
  return c.json({ ok: true });
});

workspaceApi.get("/info", (c) => {
  const rawPath = c.req.query("path") ?? ".";
  const absPath = resolveSafe(rawPath);
  if (!absPath || !existsSync(absPath)) return c.json({ error: "not found" }, 404);
  const stat = statSync(absPath);
  return c.json({ path: relativePath(absPath), type: stat.isDirectory() ? "dir" : "file", size: stat.size, mtime: stat.mtimeMs });
});
