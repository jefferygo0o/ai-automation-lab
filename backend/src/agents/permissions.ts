import { resolve } from "node:path";

/**
 * Sandbox option resolution from config.json.
 *
 * All agents within a single user share ONE workspace directory so every
 * agent can see and modify the same files.  The shared path lives under
 * the lab data root at "workspace/" — isolated per Zo Computer instance
 * (i.e. per user) so no agent from a different user can reach these files.
 */

import { readAgentConfig } from "./files.ts";
import type { AgentRecord } from "./registry.ts";
import type { SandboxOptions } from "../sandbox/index.ts";
import { WorkspaceService } from "../workspace/index.ts";

/** Shared workspace root — every agent for this user shares this directory. */
const SHARED_WORKSPACE = WorkspaceService.root();

export function resolveSandboxOptions(agent: AgentRecord): SandboxOptions {
  const cfg = readAgentConfig(agent.id);
  const sb = cfg.sandbox ?? {};
  const workdir = SHARED_WORKSPACE;
  return {
    workdir: workdir,
    timeoutMs: sb.timeoutMs ?? 60_000,
    memoryMb: sb.memoryMb ?? 512,
    cpus: sb.cpus ?? 1,
    allowHosts: sb.allowHosts ?? [],
  };
}
