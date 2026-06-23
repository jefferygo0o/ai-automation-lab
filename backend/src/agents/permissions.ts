import { resolve } from "node:path";

/**
 * Per-agent sandbox option resolution from config.json.
 */

import { readAgentConfig } from "./files.ts";
import type { AgentRecord } from "./registry.ts";
import type { SandboxOptions } from "../sandbox/index.ts";

// Allow operators to relocate the data directory (Render ephemeral disk,
// persistent volume mounts, etc.). Default keeps the historical layout
// under the backend project root.
const DATA_DIR = process.env.LAB_DATA_DIR ?? resolve(import.meta.dir, "..", "..", "data");
const BACKEND_ROOT = DATA_DIR;

export function resolveSandboxOptions(agent: AgentRecord): SandboxOptions {
  const cfg = readAgentConfig(agent.id);
  const sb = cfg.sandbox ?? {};
  const workdir = resolve(DATA_DIR, "sandboxes", agent.id, "workspace");
  return {
    workdir: workdir,
    timeoutMs: sb.timeoutMs ?? 60_000,
    memoryMb: sb.memoryMb ?? 512,
    cpus: sb.cpus ?? 1,
    allowHosts: sb.allowHosts ?? [],
  };
}