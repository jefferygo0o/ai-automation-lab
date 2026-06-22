import { resolve } from "node:path";

/**
 * Per-agent sandbox option resolution from config.json.
 */

import { readAgentConfig } from "./files.ts";
import type { AgentRecord } from "./registry.ts";
import type { SandboxOptions } from "../sandbox/index.ts";

const BACKEND_ROOT = resolve(import.meta.dir, "..", "..");

export function resolveSandboxOptions(agent: AgentRecord): SandboxOptions {
  const cfg = readAgentConfig(agent.id);
  const sb = cfg.sandbox ?? {};
  const workdir = resolve(import.meta.dir, "..", "..", "data", "sandboxes", agent.id, "workspace");
  if (!workdir.startsWith(BACKEND_ROOT)) {
    throw new Error("Sandbox workdir escapes backend root");
  }
  return {
    workdir: workdir,
    timeoutMs: sb.timeoutMs ?? 60_000,
    memoryMb: sb.memoryMb ?? 512,
    cpus: sb.cpus ?? 1,
    allowHosts: sb.allowHosts ?? [],
  };
}
