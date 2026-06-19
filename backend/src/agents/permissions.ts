import { resolve } from "node:path";

/**
 * Per-agent sandbox option resolution from config.json.
 */

import { readAgentConfig } from "./files.ts";
import type { AgentRecord } from "./registry.ts";
import type { SandboxOptions } from "../sandbox/index.ts";

export function resolveSandboxOptions(agent: AgentRecord): SandboxOptions {
  const cfg = readAgentConfig(agent.id);
  const sb = cfg.sandbox ?? {};
  return {
    workdir: resolve(import.meta.dir, "..", "..", "data", "sandboxes", agent.id),
    timeoutMs: sb.timeoutMs ?? 60_000,
    memoryMb: sb.memoryMb ?? 512,
    cpus: sb.cpus ?? 1,
    allowHosts: sb.allowHosts ?? [],
  };
}
