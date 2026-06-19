/**
 * Workspace file browser — browse, read, write, delete files in /home/workspace.
 */
import { readdirSync, existsSync, lstatSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join, relative, basename } from "path";
import { Hono } from "hono";

const WORKSPACE_ROOT = "/home/workspace/Projects/ai-automation-lab";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

// Directories to exclude from listings
const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".cache", ".next", "dist",
  ".venv", "venv", ".bun", "build", ".sass-cache", ".turbo",
]);

function isTextFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  const textExts = new Set([
    "md", "txt", "json", "yaml", "yml", "toml", "xml", "csv",
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts",
    "css", "scss", "less", "html", "htm", "svg",
    "sh", "bash", "zsh", "fish",
    "py", "rb", "rs", "go", "java", "kt", "swift", "c", "cpp", "h", "hpp",
    "sql", "graphql", "proto",
    "env", "gitignore", "dockerfile", "nginx",
    "conf", "cfg", "ini", "properties",
    "vue", "svelte", "astro", "liquid",
    "tsconfig", "eslintrc", "prettierrc", "babelrc",
    "lock", "mod", "sum",
  ]);
  return textExts.has(ext) || textExts.has(name.toLowerCase());
}

function walkDir(dirPath: string, basePath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  try {
    const names = readdirSync(dirPath);
    for (const name of names) {
      if (name.startsWith(".") && name !== ".gitkeep") continue;
      if (EXCLUDED_DIRS.has(name)) continue;

      const fullPath = join(dirPath, name);
      const relPath = relative(basePath, fullPath);
      try {
        const stat = lstatSync(fullPath);
        entries.push({
          name,
          path: relPath,
          type: stat.isDirectory() ? "dir" : "file",
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {}
    }
  } catch {}
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function resolvePath(rawPath: string): string | null {
  if (rawPath.startsWith(WORKSPACE_ROOT)) {
    return rawPath;
  }
  const resolved = join(WORKSPACE_ROOT, rawPath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null;
  return resolved;
}

function readFile(rawPath: string): { content: string; encoding: string } | null {
  const resolved = resolvePath(rawPath);
  if (!resolved || !existsSync(resolved) || lstatSync(resolved).isDirectory()) return null;

  const name = basename(rawPath);
  if (isTextFile(name)) {
    return { content: readFileSync(resolved, "utf-8"), encoding: "utf-8" };
  }
  // Binary files: return as base64
  const buf = readFileSync(resolved);
  return { content: buf.toString("base64"), encoding: "base64" };
}

function writeFile(rawPath: string, content: string): boolean {
  const absPath = resolvePath(rawPath);
  if (!absPath) return false;
  const dir = join(absPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(absPath, content);
  return true;
}

function deleteFile(rawPath: string): boolean {
  const absPath = resolvePath(rawPath);
  if (!absPath) return false;
  if (!existsSync(absPath)) return false;
  unlinkSync(absPath);
  return true;
}

export const workspaceApi = new Hono();

workspaceApi.get("/tree", (c) => {
  const rawPath = c.req.query("path") || ".";
  const absDir = resolvePath(rawPath);
  if (!absDir) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absDir)) return c.json({ error: "directory not found" }, 404);
  const relPath = absDir === WORKSPACE_ROOT ? "." : relative(WORKSPACE_ROOT, absDir);
  return c.json({
    path: relPath,
    entries: walkDir(absDir, WORKSPACE_ROOT),
  });
});

workspaceApi.get("/read", (c) => {
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path required" }, 400);
  const result = readFile(path);
  if (!result) return c.json({ error: "not found or directory" }, 404);
  return c.json({ path, ...result });
});

workspaceApi.put("/write", async (c) => {
  const { path, content } = (await c.req.json()) as { path: string; content: string };
  if (!path) return c.json({ error: "path required" }, 400);
  return c.json({ ok: writeFile(path, content) });
});

workspaceApi.delete("/delete", (c) => {
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path required" }, 400);
  return c.json({ ok: deleteFile(path) });
});

// Get file metadata
workspaceApi.get("/info", (c) => {
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path required" }, 400);
  const absPath = resolvePath(path);
  if (!absPath) return c.json({ error: "invalid path" }, 400);
  if (!existsSync(absPath)) return c.json({ error: "not found" }, 404);
  const stat = lstatSync(absPath);
  return c.json({
    path,
    type: stat.isDirectory() ? "dir" : "file",
    size: stat.size,
    mtime: stat.mtimeMs,
  });
});
