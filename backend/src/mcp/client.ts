/**
 * MCP (Model Context Protocol) client.
 *
 * Speaks JSON-RPC 2.0 over stdio to MCP servers. Each server runs in its own
 * child process. We do a full `initialize` handshake and a `tools/list` on
 * connect, then dispatch tool calls via `tools/call`.
 *
 * For an agent's enabled MCP servers we boot only those on chat start.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { toolRegistry } from "../tools/registry.ts";
import { readAgentFile } from "../agents/files.ts";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpServerRow {
  id: string;
  name: string;
  command: string;
  args: string;     // JSON
  env: string;      // JSON
  enabled: number;
  created_at: number;
}

function rowToConfig(r: McpServerRow): McpServerConfig & { id: string; enabled: boolean } {
  return {
    id: r.id,
    name: r.name,
    command: r.command,
    args: r.args ? JSON.parse(r.args) : [],
    env: r.env ? JSON.parse(r.env) : {},
    enabled: !!r.enabled,
  };
}

export const McpStore = {
  async list(): Promise<Array<McpServerConfig & { id: string; enabled: boolean; connected: boolean }>> {
    return await (await db.prepare("SELECT * FROM mcp_servers ORDER BY name").all() as McpServerRow[]).map((r) => {
      const cfg = rowToConfig(r);
      return { ...cfg, connected: mcpManager.isConnected(cfg.name) };
    });
  },
  async get(id: string) {
    const r = await db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as McpServerRow | undefined;
    return r ? rowToConfig(r) : null;
  },
  async upsert(input: { name: string; command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }, ownerId: string): Promise<McpServerConfig & { id: string; enabled: boolean }> {
    const existing = await db.prepare("SELECT id FROM mcp_servers WHERE name = ?").get(input.name) as { id: string } | undefined;
    const args = JSON.stringify(input.args ?? []);
    const env = JSON.stringify(input.env ?? {});
    const enabled = input.enabled === false ? 0 : 1;
    if (existing) {
      await db.prepare("UPDATE mcp_servers SET command=?, args=?, env=?, enabled=? WHERE id=?")
        .run(input.command, args, env, enabled, existing.id);
      return this.get(existing.id)!;
    }
    const id = `mcp_${nanoid(10)}`;
    await db.prepare("INSERT INTO mcp_servers (id, owner_id, name, command, args, env, enabled, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, ownerId, input.name, input.command, args, env, enabled, Date.now());
    return { id, name: input.name, command: input.command, args: input.args ?? [], env: input.env ?? {}, enabled: !!enabled };
  },
  async delete(id: string): boolean {
    return await db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id).changes > 0;
  },
  async setEnabled(id: string, enabled: boolean) {
    await db.prepare("UPDATE mcp_servers SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  },
};

// ----- live process management -----

interface LiveServer {
  name: string;
  proc: ChildProcessWithoutNullStreams;
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  status: "starting" | "ready" | "error" | "stopped";
  error?: string;
  nextId: number;
  pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>;
}

class McpManager {
  private servers = new Map<string, LiveServer>();

  async startServer(cfg: McpServerConfig): Promise<LiveServer> {
    if (this.servers.has(cfg.name)) {
      const live = this.servers.get(cfg.name)!;
      if (live.status === "ready" || live.status === "starting") return live;
      // stale — replace
      this.servers.delete(cfg.name);
    }
    const proc = spawn(cfg.command, cfg.args ?? [], {
      env: { ...process.env, ...(cfg.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const live: LiveServer = {
      name: cfg.name,
      proc,
      tools: [],
      status: "starting",
      nextId: 1,
      pending: new Map(),
    };
    this.servers.set(cfg.name, live);

    let buf = "";
    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null && live.pending.has(msg.id)) {
            const { resolve, reject } = live.pending.get(msg.id)!;
            live.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message ?? "mcp error"));
            else resolve(msg.result);
          }
        } catch (e) {
          // ignore malformed lines
        }
      }
    });
    proc.stderr.on("data", () => {
      // MCP servers often log to stderr; keep but don't crash.
    });
    proc.on("exit", () => {
      live.status = "stopped";
      for (const { reject } of live.pending.values()) {
        reject(new Error("mcp server exited"));
      }
      live.pending.clear();
    });

    try {
      await this.rpc(live, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ai-automation-lab", version: "0.1.0" },
      }, 10_000);
      const toolsResult = async (await this.rpc(live, "tools/list", {}, 10_000)) as { tools: any[] };
      live.tools = toolsResult.tools ?? [];
      live.status = "ready";
      try {
        await this.rpc(live, "notifications/initialized", {}, 2000);
      } catch {}
    } catch (e: any) {
      live.status = "error";
      live.error = e?.message ?? String(e);
    }
    return live;
  }

  async stopServer(name: string): Promise<boolean> {
    const s = this.servers.get(name);
    if (!s) return false;
    try { s.proc.kill("SIGTERM"); } catch {}
    this.servers.delete(name);
    return true;
  }

  getServerTools(name: string): Array<{ name: string; description?: string; inputSchema?: unknown }> {
    return this.servers.get(name)?.tools ?? [];
  }

  private rpc(server: LiveServer, method: string, params: unknown, timeoutMs = 30_000): Promise<any> {
    const id = server.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        server.pending.delete(id);
        reject(new Error(`mcp ${server.name}: ${method} timed out`));
      }, timeoutMs);
      server.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      server.proc.stdin.write(payload, (err) => {
        if (err) {
          clearTimeout(t);
          server.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  async callTool(serverName: string, toolName: string, args: unknown): Promise<any> {
    const s = this.servers.get(serverName);
    if (!s) throw new Error(`mcp server not running: ${serverName}`);
    if (s.status !== "ready") throw new Error(`mcp server not ready: ${serverName} (${s.status})`);
    const result = await this.rpc(s, "tools/call", { name: toolName, arguments: args ?? {} });
    if (Array.isArray(result?.content)) {
      return result.content.map((c: any) => c.text ?? JSON.stringify(c)).join("\n");
    }
    return result;
  }

  listServers() {
    return Array.from(this.servers.values()).map((s) => ({
      name: s.name,
      status: s.status,
      tools: s.tools.map((t) => t.name),
      error: s.error,
    }));
  }

  isConnected(name: string): boolean {
    const s = this.servers.get(name);
    return s?.status === "ready";
  }

  getToolsForAgent(agentId: string): Array<{ server: string; name: string; description: string; inputSchema: unknown }> {
    const cfgText = readAgentFile(agentId, "config.json");
    if (!cfgText) return [];
    let cfg: any;
    try { cfg = JSON.parse(cfgText); } catch { return []; }
    const enabled = Array.isArray(cfg.mcpServers) ? cfg.mcpServers as string[] : [];
    const out: Array<{ server: string; name: string; description: string; inputSchema: unknown }> = [];
    for (const serverName of enabled) {
      const live = this.servers.get(serverName);
      if (!live || live.status !== "ready") continue;
      for (const t of live.tools) {
        out.push({ server: serverName, name: t.name, description: t.description ?? "", inputSchema: t.inputSchema });
      }
    }
    return out;
  }

  async ensureAgentServers(agentId: string) {
    const cfgText = readAgentFile(agentId, "config.json");
    if (!cfgText) return;
    let cfg: any;
    try { cfg = JSON.parse(cfgText); } catch { return; }
    const enabled = Array.isArray(cfg.mcpServers) ? cfg.mcpServers as string[] : [];
    for (const serverName of enabled) {
      if (this.servers.has(serverName)) continue;
      const all = await McpStore.list();
      const def = all.find((s) => s.name === serverName && s.enabled);
      if (def) {
        try { await this.startServer({ name: def.name, command: def.command, args: def.args, env: def.env }); }
        catch (e) { console.warn(`[mcp] failed to start ${def.name}:`, e); }
      }
    }
  }

  async startAll() {
    const allServers = await McpStore.list();
    for (const s of allServers.filter((x) => x.enabled)) {
      if (this.servers.has(s.name)) continue;
      try {
        await this.startServer({ name: s.name, command: s.command, args: s.args, env: s.env });
        console.log(`[mcp] started ${s.name}`);
      } catch (e) {
        console.warn(`[mcp] failed to start ${s.name}:`, e);
      }
    }
  }

  async stopAll() {
    for (const s of this.servers.values()) {
      try { s.proc.kill(); } catch {}
    }
    this.servers.clear();
  }
}

export const mcpManager = new McpManager();
