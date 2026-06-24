/**
 * Agent filesystem.
 *
 * Each agent is a directory under data/agents/{agentId}/ containing:
 *   system.md      - core system prompt
 *   persona.md     - personality/voice
 *   skills.md      - index of available skills (agent can read them on demand)
 *   tools.md       - index of tools (and their descriptions) the agent can use
 *   memory.md      - curated long-term notes
 *   config.json    - structured config: provider, model, sandbox, MCP servers, permissions
 *
 * The agent's "intelligence" comes from these files. The runtime injects a
 * preamble into the system prompt that TELLS the agent to use its tools to
 * read the files itself, so the LLM is never assumed to know its own
 * configuration. This makes agents fully data-driven and inspectable.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

export const AGENTS_DIR = process.env.LAB_AGENTS_DIR ?? join(import.meta.dir, "..", "..", "data", "agents");

export const AGENT_FILE_NAMES = ["system.md", "persona.md", "user.md", "instructions.md", "skills.md", "tools.md", "memory.md", "config.json"] as const;
export type AgentFileName = typeof AGENT_FILE_NAMES[number];

export interface AgentConfig {
  provider: string;            // openai | groq | anthropic | ollama | custom
  baseUrl: string;
  apiKeySecret: string | null; // reference to a stored secret
  model: string;
  temperature?: number;
  maxTokens?: number;
  sandbox: {
    backend: "local";          // future: "docker"
    workdir: string;           // relative path inside agent dir, default "workdir"
    timeoutMs: number;         // per-execute_command
    memoryMb: number;          // soft cap
    cpus: number;              // soft cap
    network: "none" | "egress" | "full";
    allowHosts: string[];      // hostnames allowed when network="egress"
  };
  permissions: {
    [toolName: string]: "always" | "ask" | "never";
  };
  mcpServers: {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  }[];
}

/**
 * Global default model. Used as the fallback when an agent's config doesn't
 * specify provider fields — or when the stored config has stale defaults.
 * This is the SINGLE SOURCE OF TRUTH for the default LLM provider.
 *
 * The `apiKeySecret` field names a stored secret (Settings → Secrets).
 * The runtime resolves the raw key from the encrypted vault at request time.
 *
 * If the secret isn't set, the runtime shows a clear error in the chat panel.
 */
export const DEFAULT_MODEL = {
  provider: "mock",
  baseUrl: "http://localhost:0",
  apiKeySecret: null,
  model: "mock",
} as const;

export const DEFAULT_CONFIG: AgentConfig = {
  provider: DEFAULT_MODEL.provider,
  baseUrl: DEFAULT_MODEL.baseUrl,
  apiKeySecret: DEFAULT_MODEL.apiKeySecret,
  model: DEFAULT_MODEL.model,
  temperature: 0.7,
  maxTokens: 32768,
  sandbox: {
    backend: "local",
    workdir: "workdir",
    timeoutMs: 30_000,
    memoryMb: 512,
    cpus: 1,
    network: "egress",
    allowHosts: [],
  },
  permissions: {
    read_file: "always",
    list_files: "always",
    write_file: "ask",
    execute_command: "ask",
    http_request: "ask",
    list_mcp_tools: "always",
    call_mcp_tool: "ask",
    update_memory: "always",
  },
  mcpServers: [],
};

export const STARTER_FILES: Record<string, string> = {
  "system.md": `# System

You are an AI agent defined by a filesystem, not by hardcoded prompts.
At the start of every session, use your read_file tool to load these files
in this order — do not assume what they contain:

1. system.md   (this file)
2. persona.md  (your voice and persona)
3. skills.md   (the index of skills you can use)
4. tools.md    (the index of tools you can use)
5. memory.md   (your long-term notes from previous sessions)
6. config.json (your sandbox, provider, and permission config)

When the user asks you to do something, first decide whether the answer is
already in your files. If not, choose a tool. Prefer reading skill files
when one matches the task — skills are designed, tested procedures.

Always reason in this loop:

  OBSERVE  →  THINK  →  ACT  →  OBSERVE
`,
  "persona.md": `# Persona

You are helpful, direct, and curious. You explain what you are about to do
before you do it. When a request is ambiguous, you ask one clarifying
question. You never claim a tool succeeded unless you have the result.
`,
  "skills.md": `# Skills

This file lists the skills available to you. To use a skill, read the
corresponding .skill.md file from your skills/ directory with read_file.
Built-in skills are provided by the platform; custom skills can be added
by the operator.
`,
  "tools.md": `# Tools

Tools are exposed to you by the platform. Their full descriptions and input
schemas are provided in the function-calling system prompt; the list below
summarises the categories you have access to.

- read_file / list_files / write_file  — operate on YOUR agent directory
  and the workspace the operator grants. Outside paths are denied.
- execute_command                     — runs a shell command inside your
  isolated sandbox (configurable network, timeouts, resource caps).
- http_request                        — make outbound HTTP calls; subject
  to the same sandbox network policy.
- list_mcp_tools / call_mcp_tool      — invoke tools exposed by MCP
  servers attached to you. See config.json for the server list.
- update_memory                       — append or edit memory.md.
`,
  "memory.md": `# Memory

No long-term notes yet. As you complete tasks, use the update_memory tool
to record: user preferences, recurring workflows, project context, and
anything the user has told you to remember across sessions.
`,
  "config.json": JSON.stringify(DEFAULT_CONFIG, null, 2),
};

function agentDir(agentId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(agentId)) {
    throw new Error(`invalid agentId: ${agentId}`);
  }
  return join(AGENTS_DIR, agentId);
}

export function ensureAgentDir(agentId: string): string {
  const dir = agentDir(agentId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "skills"), { recursive: true });
    mkdirSync(join(dir, "workdir"), { recursive: true });
    mkdirSync(join(dir, "..", "..", "sandboxes", agentId, "workspace"), { recursive: true });
    for (const [name, content] of Object.entries(STARTER_FILES)) {
      writeFileSync(join(dir, name), content);
    }
  }
  return dir;
}

export function readAgentFile(agentId: string, name: string): string {
  if (!AGENT_FILE_NAMES.includes(name as AgentFileName) && !name.startsWith("skills/")) {
    throw new Error(`file not allowed: ${name}`);
  }
  const dir = agentDir(agentId);
  const path = resolve(join(dir, name));
  if (!path.startsWith(resolve(dir))) {
    throw new Error("path traversal");
  }
  try {
    return readFileSync(path, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      // The agent directory or file is missing — this happens when the
      // filesystem path shifts between deploys (e.g. local vs Render) or
      // the ephemeral container disk was wiped while the DB record persists.
      // Recreate the full agent directory, then retry.
      ensureAgentDir(agentId);
      try {
        return readFileSync(path, "utf8");
      } catch {
        // The agent directory now exists but this specific file (e.g. a
        // skill or a user-created file) still doesn't — return empty string
        // so the caller can degrade gracefully.
        return "";
      }
    }
    throw err;
  }
}

export function writeAgentFile(agentId: string, name: string, content: string): void {
  if (!AGENT_FILE_NAMES.includes(name as AgentFileName) && !name.startsWith("skills/")) {
    throw new Error(`file not allowed: ${name}`);
  }
  const dir = agentDir(agentId);
  if (!existsSync(dir)) ensureAgentDir(agentId);
  const path = resolve(join(dir, name));
  if (!path.startsWith(resolve(dir))) {
    throw new Error("path traversal");
  }
  writeFileSync(path, content);
}

export function listAgentFiles(agentId: string): { name: string; size: number; mtime: number }[] {
  const dir = agentDir(agentId);
  if (!existsSync(dir)) return [];
  const out: { name: string; size: number; mtime: number }[] = [];
  const walk = (prefix: string) => {
    for (const entry of readdirSync(join(dir, prefix))) {
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const full = join(dir, rel);
      const s = statSync(full);
      if (s.isDirectory()) {
        if (entry === "workdir") continue; // ignore sandbox workdir in agent file listing
        walk(rel);
      } else {
        out.push({ name: rel, size: s.size, mtime: s.mtimeMs });
      }
    }
  };
  walk("");
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function readAgentConfig(agentId: string): AgentConfig {
  let raw: string;
  try {
    raw = readAgentFile(agentId, "config.json");
  } catch {
    raw = "{}";
  }
  const parsed = safeParse(raw) ?? {};
  
  // Warn if config.json was invalid JSON (silent fallback to mock is confusing)
  if (!parsed || Object.keys(parsed).length === 0) {
    try { JSON.parse(raw); } catch {
      const sample = raw.length > 120 ? raw.slice(0, 120) + "..." : raw;
      console.warn(`[files] agent ${agentId} config.json: invalid JSON, falling back to defaults (first 120 chars: ${sample})`);
    }
  }

  // Explicit per-agent value wins.
  // Empty/missing string inherits DEFAULT_MODEL.
  // This makes DEFAULT_MODEL the single source of truth, even overriding
  // stale DEFAULT_CONFIG defaults stored in legacy agent config.json files.
  const pick = (a: any, d: any) => (typeof a === "string" && a.trim() !== "" ? a : d);
  const pickSecret = (a: any) => (typeof a === "string" && a.trim() !== "" ? a : DEFAULT_MODEL.apiKeySecret);

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    provider:     pick(parsed.provider,     DEFAULT_MODEL.provider),
    baseUrl:      pick(parsed.baseUrl,      DEFAULT_MODEL.baseUrl),
    apiKeySecret: pickSecret(parsed.apiKeySecret),
    model:        pick(parsed.model,        DEFAULT_MODEL.model),
    sandbox:      { ...DEFAULT_CONFIG.sandbox, ...(parsed.sandbox ?? {}) },
    permissions:  { ...DEFAULT_CONFIG.permissions, ...(parsed.permissions ?? {}) },
    mcpServers:   parsed.mcpServers ?? DEFAULT_CONFIG.mcpServers,
  };
}

function safeParse(raw: string): any | null {
  try { return JSON.parse(raw); } catch { return null; }
}

export function writeAgentConfig(agentId: string, cfg: AgentConfig): void {
  writeAgentFile(agentId, "config.json", JSON.stringify(cfg, null, 2));
}

export function deleteAgent(agentId: string): void {
  const dir = agentDir(agentId);
  if (!existsSync(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}

export function cloneAgent(srcId: string, destId: string): void {
  const src = agentDir(srcId);
  const dest = agentDir(destId);
  if (!existsSync(src)) throw new Error(`source agent not found: ${srcId}`);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(destId)) throw new Error(`invalid dest agentId: ${destId}`);
  if (existsSync(dest)) throw new Error(`dest agent exists: ${destId}`);
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "workdir") continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true });
      for (const inner of readdirSync(s)) {
        copyFileSync(join(s, inner), join(d, inner));
      }
    } else {
      copyFileSync(s, d);
    }
  }
}

export function packAgent(agentId: string): { manifest: any; files: Record<string, string> } {
  const files: Record<string, string> = {};
  for (const f of listAgentFiles(agentId)) {
    if (f.name === "config.json") {
      const cfg = readAgentConfig(agentId);
      // strip API key reference from packed config — it's a secret
      files[f.name] = JSON.stringify({ ...cfg, apiKeySecret: null }, null, 2);
    } else {
      files[f.name] = readFileSync(join(agentDir(agentId), f.name), "utf8");
    }
  }
  return {
    manifest: {
      agentId,
      schema: "lab-agent/v1",
      exportedAt: new Date().toISOString(),
      fileCount: Object.keys(files).length,
    },
    files,
  };
}

export function unpackAgent(pack: { manifest: any; files: Record<string, string> }, destId?: string): string {
  if (!pack?.files || !pack.manifest) throw new Error("invalid pack");
  const id = destId ?? pack.manifest.agentId;
  ensureAgentDir(id);
  for (const [name, content] of Object.entries(pack.files)) {
    writeAgentFile(id, name, content);
  }
  return id;
}
