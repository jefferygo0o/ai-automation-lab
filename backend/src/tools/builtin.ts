/**
 * Built-in tools.
 *
 * These are the core tools every agent gets. Additional tools come from
 * MCP servers and are merged at chat start.
 */

import { toolRegistry } from "./registry.ts";
import type { ToolContext, Tool } from "./registry.ts";
import { resolveSandboxOptions } from "../agents/permissions.ts";
import { readAgentFile, listAgentFiles, writeAgentFile } from "../agents/files.ts";
import { MemoryStore } from "../memory/index.ts";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

function ensureSandbox(ctx: ToolContext) {
  if (!ctx.sandbox) throw new Error("this tool requires an active sandbox");
  return ctx.sandbox;
}

// read_file
toolRegistry.register({
  name: "read_file",
  description:
    "Read a file from the agent's filesystem or sandbox. For agent config files use the `agent_file` flag. ALWAYS call this before assuming contents.",
  parameters: {
    path: { type: "string", description: "absolute or sandbox-relative path", required: true },
    agent_file: { type: "boolean", description: "true to read from the agent's config directory instead of the sandbox", required: false },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    if (!args.path || typeof args.path !== "string") {
      return err("Missing required 'path' argument. Usage: read_file(path=\"/path/to/file\", agent_file=true)");
    }
    try {
      // If agent_file is explicitly true, read from agent config directory
      if (args.agent_file === true) {
        const content = readAgentFile(ctx.agentId, args.path);
        if (content == null) return err(`agent file not found: ${args.path}`);
        return text(content);
      }
      // Try sandbox first. If the file doesn't exist and the path looks like
      // a config file name (no path separators), fall back to agent directory.
      const sandbox = ensureSandbox(ctx);
      try {
        return text(sandbox.readFile(args.path));
      } catch (sandboxErr: any) {
        // If the path has no directory component and agent_file wasn't set to false,
        // try the agent config directory as a fallback
        if (!args.path.includes("/") && !args.path.includes("\\") && args.agent_file !== false) {
          const content = readAgentFile(ctx.agentId, args.path);
          if (content != null) return text(content);
        }
        // Re-throw the original sandbox error if the fallback didn't find it
        // unless args.agent_file was explicitly false
        if (args.agent_file === false) {
          return err(`file not found in sandbox: ${args.path} — ${sandboxErr?.message ?? String(sandboxErr)}`);
        }
        // Give a helpful message suggesting agent_file=true
        return err(
          `file not found: ${args.path}. ` +
          (args.path.includes("/") || args.path.includes("\\")
            ? `The sandbox workdir may not contain this file.`
            : `Try reading config files with read_file(path="${args.path}", agent_file=true).`)
        );
      }
    } catch (e: any) {
      return err(`read_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

// write_file
toolRegistry.register({
  name: "write_file",
  description: "Write a file in the agent's sandbox. Creates parent directories as needed.",
  parameters: {
    path: { type: "string", description: "absolute or sandbox-relative path", required: true },
    content: { type: "string", description: "full file contents to write", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.path || typeof args.path !== "string") {
      return err("Missing required 'path' argument. Usage: write_file(path=\"/path/to/file\", content=\"...\")");
    }
    if (typeof args.content !== "string") {
      return err("Missing required 'content' argument");
    }
    try {
      ensureSandbox(ctx).writeFile(args.path, args.content);
      return text(`wrote ${args.path}`);
    } catch (e: any) {
      return err(`write_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

// list_files
toolRegistry.register({
  name: "list_files",
  description: "List files in a directory of the agent's sandbox or config directory.",
  parameters: {
    path: { type: "string", description: "absolute or sandbox-relative path; defaults to '.'", required: false },
    source: { type: "string", description: "'sandbox' or 'agent' (default: sandbox)", enum: ["sandbox", "agent"], required: false },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    try {
      if (args.source === "agent") {
        const files = listAgentFiles(ctx.agentId);
        const p = args.path ?? "";
        return text(files.filter((f) => !p || f === p).join("\n"));
      }
      return text(ensureSandbox(ctx).listFiles(args.path ?? ".").map((f: any) => `${f.type === "dir" ? "d " : "f "}${f.name}`).join("\n"));
    } catch (e: any) {
      return err(`list_files failed: ${e?.message ?? String(e)}`);
    }
  },
});

// execute_command
toolRegistry.register({
  name: "execute_command",
  description: "Run a shell command inside the agent's sandbox. Subject to timeout and sandbox isolation.",
  parameters: {
    command: { type: "string", description: "executable to run", required: true },
    args: { type: "array", description: "arguments as an array of strings", items: { type: "string" }, required: false },
    timeoutMs: { type: "number", description: "override default timeout (ms)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      if (!args.command || typeof args.command !== "string") {
        return err("Missing required 'command' argument. Usage: execute_command(command=\"ls\", args=[...])");
      }
      const s = ensureSandbox(ctx);
      const cmdArgs: string[] = Array.isArray(args.args) ? (args.args as string[]) : [];
      const r = await s.run(args.command, cmdArgs);
      const body = `exit=${r.exitCode ?? r.signal} duration=${r.durationMs}ms\n--- stdout ---\n${r.stdout}${r.truncated ? "\n... (truncated)\n" : ""}--- stderr ---\n${r.stderr}`;
      return r.ok ? text(body) : { content: [{ type: "text" as const, text: body }], isError: true };
    } catch (e: any) {
      return err(`execute_command failed: ${e?.message ?? String(e)}`);
    }
  },
});

// http_request
toolRegistry.register({
  name: "http_request",
  description: "Make an HTTP request. Body must be a string. Response is truncated to 32KB.",
  parameters: {
    url: { type: "string", description: "absolute URL", required: true },
    method: { type: "string", description: "HTTP method", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], required: false },
    headers: { type: "object", description: "request headers", properties: {} , required: false },
    body: { type: "string", description: "request body (string)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      if (!args.url || typeof args.url !== "string") {
        return err("Missing required 'url' argument. Usage: http_request(url=\"https://...\")");
      }
      const method = args.method ?? "GET";
      const headers: Record<string, string> = { "user-agent": "ai-automation-lab/0.1" };
      if (args.headers && typeof args.headers === "object") {
        for (const [k, v] of Object.entries(args.headers)) {
          if (typeof v === "string") headers[k] = v;
        }
      }
      if (ctx.abort.aborted) return err("aborted");
      const res = await fetch(args.url, { method, headers, body: args.body, signal: ctx.abort });
      const buf = Buffer.from(await res.arrayBuffer());
      const cap = 32 * 1024;
      const truncated = buf.length > cap;
      const textBody = buf.subarray(0, cap).toString("utf8");
      return text(`HTTP ${res.status} (${truncated ? "truncated " : ""}${buf.length} bytes)\n${textBody}`);
    } catch (e: any) {
      return err(`http_request failed: ${e?.message ?? String(e)}`);
    }
  },
});

// call_mcp_tool
toolRegistry.register({
  name: "call_mcp_tool",
  description:
    "Call a tool exposed by a connected MCP server. Use list_mcp_tools first to discover server:tool names.",
  parameters: {
    server: { type: "string", description: "MCP server name (e.g. 'gmail')", required: true },
    tool: { type: "string", description: "tool name within the server", required: true },
    arguments: { type: "object", description: "arguments object (server-specific)", properties: {}, required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      if (!args.server || typeof args.server !== "string") {
        return err("Missing required 'server' argument. Usage: call_mcp_tool(server=\"gmail\", tool=\"send_email\", ...)");
      }
      if (!args.tool || typeof args.tool !== "string") {
        return err("Missing required 'tool' argument");
      }
      const result = await ctx.mcp.call(args.server, args.tool, args.arguments ?? {});
      return text(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    } catch (e: any) {
      return err(`call_mcp_tool failed: ${e?.message ?? String(e)}`);
    }
  },
});

// list_mcp_tools
toolRegistry.register({
  name: "list_mcp_tools",
  description: "List connected MCP servers and the tools they expose.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, ctx) {
    try {
      const servers = ctx.mcp.listServers();
      if (!servers.length) return text("(no MCP servers connected for this agent)");
      return text(servers.map((s: any) => `${s.name} [${s.status}]: ${s.tools.join(", ") || "(no tools)"}`).join("\n"));
    } catch (e: any) {
      return err(`list_mcp_tools failed: ${e?.message ?? String(e)}`);
    }
  },
});

// update_memory
toolRegistry.register({
  name: "update_memory",
  description:
    "Persist a fact, preference, reference, or task into the agent's long-term memory. Read back with read_memory. Upserts by (kind, key).",
  parameters: {
    kind: { type: "string", description: "one of: 'fact' | 'preference' | 'reference' | 'task'", required: true, enum: ["fact", "preference", "reference", "task"] },
    key: { type: "string", description: "a short stable identifier for this memory entry (e.g. 'user_name', 'company_website')", required: true },
    value: { type: "string", description: "the value to remember", required: true },
    source: { type: "string", description: "where this came from (e.g. 'user', 'agent', 'web')", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      if (!args.kind) return err("Missing required 'kind' argument (fact|preference|reference|task)");
      if (!args.key) return err("Missing required 'key' argument");
      if (!args.value) return err("Missing required 'value' argument");
      const id = MemoryStore.upsert(ctx.agentId, ctx.ownerId, args.kind, args.key, args.value, args.source ?? "agent");
      return text(`remembered ${args.kind}/${args.key} (id=${id})`);
    } catch (e: any) {
      return err(`update_memory failed: ${e?.message ?? String(e)}`);
    }
  },
});

// read_memory
toolRegistry.register({
  name: "read_memory",
  description: "Read the agent's long-term memory store. Returns the most recent N entries by default.",
  parameters: {
    kind: { type: "string", description: "filter by kind", enum: ["fact", "preference", "reference", "task"], required: false },
    limit: { type: "number", description: "max entries (default 50)", required: false },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    try {
      const items = await MemoryStore.list(ctx.agentId, ctx.ownerId, args.kind, args.limit ?? 50);
      if (!items.length) return text("(memory is empty)");
      return text(items.map((m: any) => `[${m.kind}] ${m.key}: ${m.value}`).join("\n"));
    } catch (e: any) {
      return err(`read_memory failed: ${e?.message ?? String(e)}`);
    }
  },
});

// remember_to_update_agent_file - lets the agent propose editing its own config
toolRegistry.register({
  name: "update_agent_file",
  description:
    "Propose an edit to one of the agent's own config files (system.md, persona.md, etc). The user must approve before it is applied.",
  parameters: {
    file: { type: "string", description: "file name (e.g. 'system.md', 'persona.md', 'skills.md', 'tools.md', 'memory.md')", required: true },
    content: { type: "string", description: "new full file content", required: true },
    reason: { type: "string", description: "short justification shown to the user", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      if (!args.file || typeof args.file !== "string") {
        return err("Missing required 'file' argument");
      }
      if (typeof args.content !== "string") {
        return err("Missing required 'content' argument");
      }
      if (!ctx.agentId) return err("agent not found");
      writeAgentFile(ctx.agentId, args.file, args.content);
      return text(`queued update for ${args.file}: ${args.reason || "no reason given"}`);
    } catch (e: any) {
      return err(`update_agent_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

export const builtinTools: Tool[] = [];