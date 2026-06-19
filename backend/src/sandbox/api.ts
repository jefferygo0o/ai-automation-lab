/**
 * Sandbox HTTP API helpers. Wraps the LocalSandbox primitives with
 * synchronous, JSON-safe operations the HTTP layer can call directly.
 *
 * All functions take a SandboxOptions object (resolved by permissions.ts)
 * so the HTTP layer never has to know about absolute workdirs.
 */
import { createSandbox, type CommandResult, type SandboxOptions } from "./index.ts";
import { realpathSync, rmSync } from "node:fs";

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

export interface SandboxTreeResponse {
  path: string;
  entries: DirEntry[];
}

export function sandboxBrowse(opts: SandboxOptions, p: string): SandboxTreeResponse {
  const s = createSandbox(opts);
  const entries = s.listFiles(p || ".") as DirEntry[];
  return { path: p || ".", entries };
}

export function sandboxRead(opts: SandboxOptions, p: string): string {
  const s = createSandbox(opts);
  return s.readFile(p);
}

export function sandboxWrite(opts: SandboxOptions, p: string, content: string): void {
  const s = createSandbox(opts);
  s.writeFile(p, content);
}

export function sandboxDelete(opts: SandboxOptions, p: string): void {
  const s = createSandbox(opts);
  const safe = s.resolveSafe(p);
  rmSync(safe, { recursive: true, force: true });
}

export async function sandboxExec(
  opts: SandboxOptions,
  command: string,
  args: string[],
  timeoutMs?: number,
): Promise<CommandResult> {
  const o = timeoutMs ? { ...opts, timeoutMs } : opts;
  const s = createSandbox(o);
  const r = await s.run(command, args);
  try { s.cleanup(); } catch {}
  return r;
}

void realpathSync;
