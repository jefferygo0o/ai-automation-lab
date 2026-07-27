import { resolve } from "node:path";

/**
 * Sandbox option resolution from config.json.
 *
 * All agents within a single user share ONE workspace directory so every
 * agent can see and modify the same files.  The shared path lives under
 * the per-user workspace root — isolated per user so no agent from a
 * different user can reach these files.
 */

import { readAgentConfig } from "./files.ts";
import type { AgentRecord } from "./registry.ts";
import type { SandboxOptions } from "../sandbox/index.ts";
import { workspaceFor } from "../workspace/index.ts";

/** Per-user shared workspace root — every agent for THIS user shares one directory. */
export function resolveSandboxOptions(agent: AgentRecord, ownerId: string): SandboxOptions {
  const cfg = readAgentConfig(agent.id);
  const sb = cfg.sandbox ?? {};
  const workdir = workspaceFor(ownerId).root();
  return {
    workdir: workdir,
    timeoutMs: sb.timeoutMs ?? 300_000,
    memoryMb: sb.memoryMb ?? 512,
    cpus: sb.cpus ?? 1,
    allowHosts: sb.allowHosts ?? [],
  };
}
