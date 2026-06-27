/**
 * REST + SSE API server (Hono).
 *
 * Routes are mounted under /api. Chat streaming uses Server-Sent Events.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createUser, login, authenticateBearer } from "../security/auth.ts";
import { Audit } from "../audit/index.ts";
import { approvalsApi } from "../approvals/api.ts";
import { templatesApi } from "../templates/api.ts";
import { webhooksApi } from "../webhooks/index.ts";
import { integrationsApi } from "../integrations/api.ts";
import { rateLimit, incrementHourly } from "../security/ratelimit.ts";
import { SecretStore } from "../secrets/store.ts";
import { db } from "../db/index.ts";
import { AgentStore, restoreAgentConfigFromDb } from "../agents/registry.ts";
import { HistoryStore } from "../agents/history.ts";
import { ChatStore } from "../chats/index.ts";
import { runAgentTurn, type StreamEvent } from "../agents/runtime.ts";
import { Skills } from "../skills/index.ts";
import { mcpManager, McpStore } from "../mcp/client.ts";
import { startMcpOAuthFlow, verifyMcpOAuth, setMcpEnvAndStart } from "../mcp/connect.ts";
import { MemoryStore } from "../memory/index.ts";
import { readAgentConfig, AGENTS_DIR } from "../agents/files.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { RunStore } from "../runs/index.ts";
import { sandboxBrowse, sandboxRead, sandboxReadBinary, sandboxWrite, sandboxExec, sandboxDelete } from "../sandbox/api.ts";
import { resolveSandboxOptions } from "../agents/permissions.ts";
import { createSandbox } from "../sandbox/index.ts";
import { webSpaceApi } from "../webspace/index.ts";
import { workspaceApi } from "../workspace/index.ts";
import { automationsApi } from "../automations/index.ts";
import { toolRegistry } from "../tools/registry.ts";
import { readdirSync, readFileSync } from "node:fs";
import { register } from "../tools/approval_tools.ts";
import { dashboardApi } from "../dashboard/api.ts";
import { personasApi } from "../personas/api.ts";
import { rulesApi } from "../rules/api.ts";
import { MCP_MARKETPLACE, findMarketplaceEntry } from "../mcp/marketplace.ts";
import { sitesApi } from "../sites/api.ts";
import { servicesApi } from "../services/api.ts";
import { publicProxy } from "../services/proxy.ts";

const api = new Hono<{ Variables: { userId: string } }>();

// ---- CORS (must run before auth so OPTIONS preflight works) ----
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://ai-automation-lab.netlify.app",
];
const originAllowList = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;
api.use(
  "/api/*",
  cors({
    origin: (origin) => (origin && originAllowList.includes(origin) ? origin : originAllowList[0]),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400,
  }),
);

// ---- Auth + rate limit middleware (applies to all /api/* except public) ----
api.route("/_proxy", publicProxy);

api.use("/api/*", async (c, next) => {
  const path = c.req.path;
  const PUBLIC =
    path === "/api/auth/login" ||
    path === "/api/auth/register" ||
    path === "/api/health" ||
    path === "/api/integrations/oauth-webhook" ||
    path.startsWith("/api/services/") && path.includes("/proxy");
  if (!PUBLIC) {
    let auth = await authenticateBearer(c.req.raw.headers.get("authorization") ?? undefined);
    // Fallback: accept token via query param (for browser navigation to proxy URLs)
    if (!auth) {
      const qp = new URL(c.req.url).searchParams.get("token");
      if (qp) auth = await authenticateBearer(`Bearer ${qp}`);
    }
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const rl = rateLimit(`u:${auth.userId}`, { perMinute: 240, perHour: 10_000 });
    if (!rl.allowed) {
      c.header("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
      return c.json({ error: "rate_limited", reason: rl.reason }, 429);
    }
    c.set("userId", auth.userId);
  }
  await next();
});

api.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }));

// ---- Auth ----
api.post("/api/auth/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) return c.json({ error: "email and password required" }, 400);
  const session = await login(body.email, body.password);
  if (!session) return c.json({ error: "invalid credentials" }, 401);
  Audit.record({
    ownerId: session.userId,
    actor: "user",
    action: "auth.login",
    metadata: { email: body.email },
    ip: c.req.raw.headers.get("x-forwarded-for") ?? undefined,
  });
  return c.json({ token: session.token, userId: session.userId, expiresAt: session.expiresAt });
});

api.post("/api/auth/register", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password || body.password.length < 8) {
    return c.json({ error: "email and password (>=8 chars) required" }, 400);
  }
  try {
    const user = await createUser(body.email, body.password);
    if (!user) {
      return c.json({ error: "registration failed - supabase did not create the user" }, 500);
    }
    Audit.record({
      ownerId: user.id,
      actor: "user",
      action: "auth.register",
      metadata: { email: user.email },
      ip: c.req.raw.headers.get("x-forwarded-for") ?? undefined,
    });
    return c.json({ user });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "register failed" }, 400);
  }
});

// ---- Agents ----
api.get("/api/agents", async (c) => {
  const userId = c.get("userId") as string;
  const agents = await AgentStore.list(userId);
  // After a Render redeploy the ephemeral disk is wiped, so any agent
  // whose workdir is missing has no on-disk config.json. The DB row
  // carries the last persisted config_json, so restore it here. Without
  // this, downstream endpoints (chat, automations) read defaults and 500.
  for (const a of agents) {
    if (a.configJson && !existsSync(join(AGENTS_DIR, a.id))) {
      restoreAgentConfigFromDb(a);
    }
  }
  return c.json({ agents });
});

api.post("/api/agents", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; description?: string };
  if (!body.name) return c.json({ error: "name required" }, 400);
  const agent = await AgentStore.create(userId, body.name, body.description ?? "");
  Audit.record({ ownerId: userId, actor: "user", action: "agent.create", targetId: agent.id, targetType: "agent", metadata: { name: agent.name } });
  return c.json({ agent });
});

api.get("/api/agents/:id", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);

  // If filesystem agent dir is missing but DB has the config,
  // restore it first so readAgentConfig gets the saved values.
  // This handles Render deploys where the ephemeral disk is wiped.
  if (agent.configJson && !existsSync(join(AGENTS_DIR, agent.id))) {
    restoreAgentConfigFromDb(agent);
  }

  return c.json({ agent, config: readAgentConfig(agent.id) });
});

api.delete("/api/agents/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const ok = await AgentStore.delete(id, userId);
  if (ok) Audit.record({ ownerId: userId, actor: "user", action: "agent.delete", targetId: id, targetType: "agent" });
  return c.json({ ok });
});

api.post("/api/agents/:id/clone", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  const a = await AgentStore.clone(c.req.param("id"), userId, body.name);
  if (!a) return c.json({ error: "not found" }, 404);
  return c.json({ agent: a });
});

api.put("/api/agents/:id/config", async (c) => {
  const userId = c.get("userId") as string;
  const raw = await c.req.json();
  // Validate critical fields to prevent saving malformed config
  if (typeof raw !== "object" || raw === null) {
    return c.json({ error: "config must be a JSON object" }, 400);
  }
  if (raw.provider !== undefined && typeof raw.provider !== "string") {
    return c.json({ error: "provider must be a string" }, 400);
  }
  if (raw.baseUrl !== undefined && typeof raw.baseUrl !== "string") {
    return c.json({ error: "baseUrl must be a string" }, 400);
  }
  if (raw.model !== undefined && typeof raw.model !== "string") {
    return c.json({ error: "model must be a string" }, 400);
  }
  if (raw.apiKeySecret !== undefined && typeof raw.apiKeySecret !== "string") {
    return c.json({ error: "apiKeySecret must be a string" }, 400);
  }
  if (raw.temperature !== undefined && (typeof raw.temperature !== "number" || raw.temperature < 0 || raw.temperature > 2)) {
    return c.json({ error: "temperature must be a number between 0 and 2" }, 400);
  }
  if (raw.maxTokens !== undefined && (typeof raw.maxTokens !== "number" || raw.maxTokens < 1)) {
    return c.json({ error: "maxTokens must be a positive number" }, 400);
  }

  // Whitelist known config fields so invalid keys (e.g. "stream") are silently
  // stripped instead of being persisted as invalid JSON.
  const knownFields = new Set([
    "provider", "baseUrl", "apiKeySecret", "model",
    "temperature", "maxTokens", "sandbox", "permissions",
    "mcpServers",
  ]);
  const cfg: Record<string, unknown> = {};
  for (const key of knownFields) {
    if (key in raw) cfg[key] = raw[key];
  }

  // Validate nested objects have the right shape
  if (cfg.sandbox !== undefined && (typeof cfg.sandbox !== "object" || cfg.sandbox === null)) {
    return c.json({ error: "sandbox must be an object" }, 400);
  }
  if (cfg.permissions !== undefined && (typeof cfg.permissions !== "object" || cfg.permissions === null)) {
    return c.json({ error: "permissions must be an object" }, 400);
  }
  if (cfg.mcpServers !== undefined && !Array.isArray(cfg.mcpServers)) {
    return c.json({ error: "mcpServers must be an array" }, 400);
  }

  return c.json({ ok: await AgentStore.updateConfig(c.req.param("id"), userId, cfg) });
});

// Agent file CRUD — `?name=...` query param so file
const getFileName = (c: any): string => {
  const raw = c.req.query("name") ?? "";
  console.log("getFileName raw params:", c.req.param());
  return decodeURIComponent(raw).replace(/^\/+/, "");
};

api.get("/api/agents/:id/files", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ files: await AgentStore.listFiles(c.req.param("id"), userId) });
});

api.get("/api/agents/:id/file", async (c) => {
  const userId = c.get("userId") as string;
  const file = await AgentStore.readFile(c.req.param("id"), userId, getFileName(c));
  return c.json({ content: file.content, name: file.name, size: file.size, mtime: file.mtime });
});

api.put("/api/agents/:id/file", async (c) => {
  const userId = c.get("userId") as string;
  const { content } = (await c.req.json()) as { content: string };
  const file = getFileName(c);
  try {
    const result = await AgentStore.writeFile(c.req.param("id"), userId, file, content);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 500);
  }
});

api.get("/api/agents/:id/history", async (c) => {
  const userId = c.get("userId") as string;
  const file = c.req.query("file");
  return c.json({ history: file ? await HistoryStore.list(c.req.param("id"), file) : await HistoryStore.list(c.req.param("id")) });
});

api.post("/api/agents/:id/history/:versionId/revert", async (c) => {
  const version = await HistoryStore.get(c.req.param("versionId"));
  if (!version) return c.json({ ok: false }, 404);
  await AgentStore.writeFile(version.agentId, c.get("userId"), version.filename, version.content);
  return c.json({ ok: true });
});

// ---- Export / Import ----
api.get("/api/agents/:id/export", async (c) => {
  const userId = c.get("userId") as string;
  const pack = await AgentStore.exportPack(c.req.param("id"), userId);
  if (!pack) return c.json({ error: "not found" }, 404);
  const agent = await AgentStore.get(c.req.param("id"), userId);
  c.header("Content-Disposition", `attachment; filename="${agent?.name ?? c.req.param("id")}.json"`);
  return c.json(pack);
});

api.post("/api/agents/import", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json()) as any;
  return c.json({ agent: await AgentStore.importPack(userId, body) });
});

// ---- Snapshots (Supabase Storage) ----
api.get("/api/agents/:id/snapshots", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  if (!(await AgentStore.get(id, userId))) return c.json({ error: "not found" }, 404);
  const limit = Number(c.req.query("limit") ?? 20);
  const { listSnapshots } = await import("../snapshots/index.ts");
  return c.json({ snapshots: await listSnapshots(id, limit) });
});

api.post("/api/agents/:id/snapshot", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  if (!(await AgentStore.get(id, userId))) return c.json({ error: "not found" }, 404);
  const { createSnapshot } = await import("../snapshots/index.ts");
  const snap = await createSnapshot({ agentId: id, trigger: "manual" });
  return c.json({ snapshot: snap });
});

api.post("/api/snapshots/:id/restore", async (c) => {
  const { restoreSnapshot } = await import("../snapshots/index.ts");
  const result = await restoreSnapshot(c.req.param("id"));
  return c.json(result, result.ok ? 200 : 400);
});

api.post("/api/snapshots/restore-all", async (c) => {
  const { hydrateAllAgents } = await import("../snapshots/index.ts");
  const result = await hydrateAllAgents();
  return c.json(result);
});

// ---- Diff (file version comparison) ----
api.get("/api/history/:id", async (c) => {
  const { HistoryStore } = await import("../agents/history.ts");
  const { computeDiff } = await import("../diff/index.ts");
  const h1 = await HistoryStore.get(c.req.param("id"));
  if (!h1) return c.json({ error: "version not found" }, 404);
  return c.json({ a: h1, diff: null });
});

api.get("/api/history/:id1/diff/:id2", async (c) => {
  const { HistoryStore } = await import("../agents/history.ts");
  const { computeDiff } = await import("../diff/index.ts");
  const h1 = await HistoryStore.get(c.req.param("id1"));
  const h2 = await HistoryStore.get(c.req.param("id2"));
  if (!h1 || !h2) return c.json({ error: "version not found" }, 404);
  const diff = computeDiff(h1.content, h2.content);
  return c.json({ a: h1, b: h2, diff });
});

// ---- Timeline (unified view of runs + snapshots + file changes) ----
api.get("/api/timeline", async (c) => {
  const userId = c.get("userId") as string;
  const limit = Number(c.req.query("limit") ?? 50);
  const { HistoryStore } = await import("../agents/history.ts");
  const { RunStore } = await import("../runs/index.ts");
  const { listSnapshots } = await import("../snapshots/index.ts");
  const { AgentStore } = await import("../agents/registry.ts");

  const agents = await AgentStore.list(userId);
  const agentIds = agents.map((a: any) => a.id);

  // File changes across all user agents
  const fileEvents = [];
  for (const id of agentIds) {
    const hist = await HistoryStore.list(id);
    fileEvents.push(...hist.map((h: any) => ({
      type: "file_change" as const,
      agentId: h.agentId,
      filename: h.filename,
      versionId: h.id,
      content: h.content.slice(0, 200),
      createdAt: h.createdAt,
    })));
  }

  // Runs across all user agents
  const runs = await RunStore.listForUser(userId, limit);
  const runEvents = runs.map((r: any) => ({
    type: "run" as const,
    agentId: r.agentId,
    runId: r.id,
    status: r.status,
    chatId: r.chatId,
    totalTokens: r.totalTokens,
    createdAt: r.startedAt,
    finishedAt: r.finishedAt,
  }));

  // Snapshots across all user agents
  const snapEvents: any[] = [];
  for (const id of agentIds) {
    try {
      const snaps = await listSnapshots(id, 5);
      snapEvents.push(...snaps.map((s: any) => ({
        type: "snapshot" as const,
        agentId: s.agentId,
        snapshotId: s.id,
        fileCount: s.fileCount,
        byteSize: s.byteSize,
        trigger: s.trigger,
        createdAt: s.createdAt,
      })));
    } catch {
      // table may not exist — skip snapshots gracefully
    }
  }

  // Merge and sort by createdAt desc
  const all = [...fileEvents, ...runEvents, ...snapEvents]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  return c.json({ timeline: all, total: all.length });
});

// ---- Chats ----
api.get("/api/chats", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ chats: await ChatStore.list(userId) });
});

api.post("/api/chats", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => ({}))) as { agentId: string; title?: string };
  if (!body.agentId) return c.json({ error: "agentId required" }, 400);
  return c.json({ chat: await ChatStore.create(userId, body.agentId, body.title) });
});

api.get("/api/chats/:id", async (c) => {
  const userId = c.get("userId") as string;
  const chat = await ChatStore.get(c.req.param("id"), userId);
  if (!chat) return c.json({ error: "not found" }, 404);
  return c.json({ chat, messages: await ChatStore.listMessages(chat.id, userId) });
});

api.delete("/api/chats/:id", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ ok: await ChatStore.delete(c.req.param("id"), userId) });
});

api.post("/api/chats/:id/rename", async (c) => {
  const userId = c.get("userId") as string;
  const { title } = (await c.req.json()) as { title: string };
  return c.json({ ok: await ChatStore.rename(c.req.param("id"), userId, title) });
});

api.post("/api/chats/:id/active-agent", async (c) => {
  const userId = c.get("userId") as string;
  const { agentId } = (await c.req.json()) as { agentId: string };
  return c.json({ ok: await ChatStore.setActiveAgent(c.req.param("id"), userId, agentId) });
});

// SSE chat streaming -- supports JSON ({ content }) and multipart/form-data (content + files[])
api.post("/api/chats/:id/messages", async (c) => {
  const userId = c.get("userId") as string;
  incrementHourly(userId);
  const chat = await ChatStore.get(c.req.param("id"), userId);
  if (!chat) return c.json({ error: "chat not found" }, 404);
  const agent = await AgentStore.get(chat.activeAgentId ?? chat.agentId, userId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  let content = "";
  let files: Array<{ name: string; data: string; mime: string }> = [];
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    content = (form["content"] as string) ?? "";
    for (const [key, val] of Object.entries(form)) {
      if (key === "content") continue;
      if (val && typeof val === "object" && "name" in val) {
        const file = val as any;
        if (file.size && file.size > 0) {
          const buf = await file.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          files.push({ name: file.name ?? key, data: b64, mime: file.type ?? "application/octet-stream" });
        }
      }
    }
  } else {
    const body = (await c.req.json().catch(() => ({}))) as { content?: string };
    content = body.content ?? "";
  }
  if (!content && files.length === 0) {
    return c.json({ error: "content or files required" }, 400);
  }
  if (files.length > 0) {
    const sandboxOpts = resolveSandboxOptions(agent);
    const sandbox = createSandbox(sandboxOpts);
    const { processAttachments } = await import("../chat/attachments.ts");
    const result = await processAttachments(userId, content, files, sandboxOpts.workdir ?? "");
    content = result.content;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const absPath = sandbox.resolveSafe(safeName);
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, Buffer.from(f.data, "base64"));
    }
  }
  if (!content) content = "(user sent files)";
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let isDone = false;
  const send = async (e: StreamEvent) => {
    try {
      await writer.write(
        encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      );
      if (e.type === "done" || e.type === "error") isDone = true;
    } catch {}
  };
  const heartbeat = setInterval(async () => {
    if (isDone) return;
    try {
      await writer.write(
        encoder.encode(`event: keepalive\ndata: {}\n\n`)
      );
    } catch { clearInterval(heartbeat); }
  }, 10_000);
  const clearHb = async () => { clearInterval(heartbeat); };
  runAgentTurn(userId, c.req.param("id"), content, send)
    .catch((e: any) => send({ type: "error", message: e?.message ?? String(e) }))
    .finally(() => { clearHb(); writer.close().catch(() => {}); });
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
// ---- Chat feedback (thumbs up/down on assistant messages) ----
api.post("/api/chats/:id/feedback", async (c) => {
  const userId = c.get("userId") as string;
  const chat = await ChatStore.get(c.req.param("id"), userId);
  if (!chat) return c.json({ error: "chat not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { messageId?: string; rating?: number; comment?: string };
  if (!body.messageId) return c.json({ error: "messageId required" }, 400);
  if (body.rating !== 1 && body.rating !== -1 && body.rating !== 0) return c.json({ error: "rating must be 1, -1, or 0" }, 400);
  const r = await db.prepare("UPDATE messages SET feedback_rating = ?, feedback_comment = ? WHERE id = ? AND chat_id = ?")
    .run(body.rating, body.comment ?? undefined, body.messageId, c.req.param("id"));
  if (!r.changes) return c.json({ error: "message not found" }, 404);
  Audit.record({ ownerId: userId, actor: "user", action: "chat.feedback", targetId: c.req.param("id"), targetType: "chat", metadata: { messageId: body.messageId, rating: body.rating, hasComment: !!body.comment } });
  return c.json({ ok: true });
});

api.get("/api/chats/:id/feedback", async (c) => {
  const userId = c.get("userId") as string;
  const chat = await ChatStore.get(c.req.param("id"), userId);
  if (!chat) return c.json({ error: "chat not found" }, 404);
  const rows = await db.prepare("SELECT id, role, feedback_rating, feedback_comment FROM messages WHERE chat_id = ? AND feedback_rating IS NOT NULL").all(c.req.param("id"));
  return c.json({ feedback: rows });
});

// ---- Skills ----
api.get("/api/skills", async (c) => {
  const userId = c.get("userId") as string;
  const userSkills = await Skills.listForUser(userId);
  const userSkillIds = new Set(userSkills.map((u) => u.id));
  const allSkills = Skills.list().filter((s) => !userSkillIds.has(s.id));
  const combined = [...allSkills, ...userSkills];
  const seen = new Set<string>();
  const dedu = combined.filter(s => seen.has(s.id) ? false : (seen.add(s.id), true));
  return c.json({ skills: dedu });
});

api.get("/api/skills/:id", async (c) => {
  const userId = c.get("userId") as string;
  const skill = await Skills.readForUser(userId, c.req.param("id"));
  if (!skill) return c.json({ error: "not found" }, 404);
  return c.json({ body: skill.body, name: skill.name, description: skill.description, id: skill.id, inputs: skill.inputs, mcp_required: skill.mcp_required });
});

api.post("/api/skills", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json()) as { id: string; name: string; body: string; description?: string; mcp_required?: string[]; inputs?: any[] };
  if (!body.id || !body.name || !body.body) return c.json({ error: "id, name, body required" }, 400);
  try {
    const skill = await Skills.saveUser(userId, body.id, body.name, body.body, { description: body.description ?? "", mcp_required: body.mcp_required, inputs: body.inputs });
    return c.json({ skill });
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

api.delete("/api/skills/:id", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ ok: await Skills.deleteUser(userId, c.req.param("id")) });
});

// ---- MCP ----
api.get("/api/mcp/servers", async (c) => {
  return c.json({ servers: await McpStore.list() });
});

// ---- MCP Marketplace (curated catalog) ----
api.get("/api/mcp/marketplace", async (c) => {
  const installedNames = new Set((await McpStore.list()).map((s) => s.name));
  const entries = MCP_MARKETPLACE.map((e) => ({
    ...e,
    installed: installedNames.has(e.name),
  }));
  return c.json({ entries, total: entries.length });
});

api.get("/api/mcp/marketplace/:id", async (c) => {
  const entry = findMarketplaceEntry(c.req.param("id"));
  if (!entry) return c.json({ error: "marketplace entry not found" }, 404);
  const installedNames = new Set((await McpStore.list()).map((s) => s.name));
  return c.json({ ...entry, installed: installedNames.has(entry.name) });
});

api.post("/api/mcp/marketplace/:id/install", async (c) => {
  const userId = c.get("userId") as string;
  const entry = findMarketplaceEntry(c.req.param("id"));
  if (!entry) return c.json({ error: "marketplace entry not found" }, 404);
  const server = await McpStore.upsert(
    { name: entry.name, command: entry.command, args: entry.args, enabled: true },
    userId,
  );
  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "mcp.marketplace_install",
    targetId: server.id,
    targetType: "mcp_server",
    metadata: { marketplace_id: entry.id, name: entry.name },
  });
  let connectStatus: "ready" | "error" | "starting" | "stopped" = "starting";
  let connectError: string | undefined;
  try {
    const live = await mcpManager.startServer({
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
    });
    connectStatus = live.status;
    if (live.error) connectError = live.error;
  } catch (e: any) {
    connectStatus = "error";
    connectError = e?.message ?? String(e);
  }
  return c.json({
    server: (await McpStore.list()).find((s) => s.id === server.id),
    status: connectStatus,
    error: connectError,
    needs_env: (entry.envVars ?? []).filter((v) => v.required).map((v) => v.name),
  });
});

api.post("/api/mcp/servers", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json()) as { name: string; command: string; args?: string[]; env?: Record<string, string> };
  const server = await McpStore.upsert(body, userId);
  Audit.record({ ownerId: userId, actor: "user", action: "mcp.create", targetId: server.id, targetType: "mcp_server", metadata: { name: server.name, command: server.command } });
  return c.json({ server });
});

api.post("/api/mcp/servers/:id/connect", async (c) => {
  const userId = c.get("userId") as string;
  const srv = await McpStore.get(c.req.param("id"));
  if (!srv) return c.json({ error: "not found" }, 404);

  // Check if this server needs OAuth via Pipedream Connect
  let oauthResult: McpOAuthStartResult;
  try {
    oauthResult = await startMcpOAuthFlow(c.req.param("id"), userId);
  } catch (e: any) {
    return c.json({ ok: false, error: `OAuth check failed: ${e?.message ?? String(e)}`, needsEnv: [] });
  }

  if (oauthResult.connectLinkUrl || oauthResult.connectionId) {
    // OAuth flow started — return the link for the frontend to open
    return c.json({
      ok: true,
      needs_oauth: true,
      oauth: {
        connectLinkUrl: oauthResult.connectLinkUrl,
        connectionId: oauthResult.connectionId,
        authType: oauthResult.authType,
      },
      needsEnv: oauthResult.needsEnv,
      message: oauthResult.message,
    });
  }

  // No OAuth — if the server needs env vars, tell the frontend
  if (oauthResult.needsEnv && oauthResult.needsEnv.length > 0) {
    return c.json({
      ok: true,
      needsEnv: oauthResult.needsEnv,
      message: oauthResult.message,
    });
  }

  // No OAuth and no env vars needed — try to start the server directly
  try {
    const live = await mcpManager.startServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env });
    if (live.status === "ready") {
      return c.json({ ok: true, connected: true });
    }
    return c.json({ ok: false, error: live.error ?? `Server ${live.status}`, needsEnv: [] });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message ?? String(e), needsEnv: [] });
  }
});

api.post("/api/mcp/servers/:id/verify-oauth", async (c) => {
  const userId = c.get("userId") as string;
  const result = await verifyMcpOAuth(c.req.param("id"), userId);
  return c.json(result);
});

api.put("/api/mcp/servers/:id/env", async (c) => {
  const userId = c.get("userId") as string;
  const { env } = (await c.req.json()) as { env: Record<string, string> };
  const result = await setMcpEnvAndStart(c.req.param("id"), env);
  return c.json(result);
});

api.post("/api/mcp/servers/:id/oauth-callback", async (c) => {
  // This is called by Pipedream's webhook after OAuth completes.
  // The connect.ts module handles verification via verifyMcpOAuth.
  // For now, just log and acknowledge.
  console.log("[mcp] oauth-callback received for server", c.req.param("id"));
  return c.json({ received: true });
});

api.post("/api/mcp/servers/:id/disconnect", async (c) => {
  const srv = await McpStore.get(c.req.param("id"));
  if (!srv) return c.json({ ok: false, error: "not found" }, 404);
  mcpManager.stopServer(srv.name);
  return c.json({ ok: true });
});

api.delete("/api/mcp/servers/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await McpStore.delete(id);
  if (ok) {
    const userId = c.get("userId") as string;
    Audit.record({ ownerId: userId, actor: "user", action: "mcp.delete", targetId: id, targetType: "mcp_server" });
  }
  return c.json({ ok });
});

api.get("/api/mcp/servers/:id/tools", async (c) => {
  const srv = await McpStore.get(c.req.param("id"));
  if (!srv) return c.json({ tools: [] });
  try {
    await mcpManager.startServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env });
  } catch {}
  return c.json({ tools: mcpManager.getServerTools(srv.name) });
});

// ---- Memory (per-(agent, owner) scoped) ----
api.get("/api/agents/:id/memory", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  const kind = c.req.query("kind");
  return c.json({ items: await MemoryStore.list(agent.id, userId, kind) });
});

api.post("/api/agents/:id/memory", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { kind?: string; key?: string; value?: string; source?: string };
  if (!body.kind || !body.key) return c.json({ error: "kind and key required" }, 400);
  const id = await MemoryStore.upsert(agent.id, userId, body.kind as any, body.key, body.value ?? "", body.source ?? "user");
  return c.json({ id });
});

api.put("/api/agents/:id/memory/:memId", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { value?: string; source?: string };
  const ok = await MemoryStore.update(c.req.param("memId"), userId, body.value ?? "", body.source);
  if (!ok) return c.json({ error: "memory item not found" }, 404);
  return c.json({ ok: true });
});

api.delete("/api/agents/:id/memory/:memId", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  const ok = await MemoryStore.remove(c.req.param("memId"), userId);
  if (!ok) return c.json({ error: "memory item not found" }, 404);
  return c.json({ ok: true });
});

api.delete("/api/agents/:id/memory", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  const removed = await MemoryStore.clear(agent.id, userId);
  return c.json({ ok: true, removed });
});

// ---- Secrets ----
api.get("/api/secrets", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ secrets: await SecretStore.list(userId) });
});

api.put("/api/secrets/:name", async (c) => {
  const userId = c.get("userId") as string;
  const name = c.req.param("name");
  const { value } = (await c.req.json()) as { value: string };
  const secret = await SecretStore.set(userId, name, value);
  Audit.record({ ownerId: userId, actor: "user", action: "secret.set", targetId: name, targetType: "secret" });
  return c.json({ secret });
});

api.delete("/api/secrets/:name", async (c) => {
  const userId = c.get("userId") as string;
  const name = c.req.param("name");
  const ok = await SecretStore.delete(userId, name);
  if (ok) Audit.record({ ownerId: userId, actor: "user", action: "secret.delete", targetId: name, targetType: "secret" });
  return c.json({ ok });
});

// ---- Audit log ----
api.get("/api/audit", async (c) => {
  const userId = c.get("userId") as string;
  const action = c.req.query("action");
  const targetType = c.req.query("targetType");
  const limit = Number(c.req.query("limit") ?? 100);
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : undefined;
  return c.json({ events: await Audit.list(userId, { action, targetType, limit, offset: cursor }) });
});

api.get("/api/audit/stats", async (c) => {
  const userId = c.get("userId") as string;
  const since = c.req.query("sinceMs") ? Number(c.req.query("sinceMs")) : Date.now() - 24 * 60 * 60 * 1000;
  return c.json({ counts: await Audit.counts(userId, since), since });
});

api.delete("/api/audit", async (c) => {
  const userId = c.get("userId") as string;
  const beforeMs = c.req.query("beforeMs") ? Number(c.req.query("beforeMs")) : Date.now() - 30 * 24 * 60 * 60 * 1000;
  return c.json({ ok: true, deleted: await Audit.clear(userId, beforeMs) });
});

// ---- Tool registry introspection ----
api.get("/api/tools", async (c) => {
  return c.json({ tools: toolRegistry.all().map((t) => ({ name: t.name, description: t.description })) });
});

// ---- Models (presets + all agent models discovered from disk) ----
api.post("/api/models/fetch", async (c) => {
  const body = (await c.req.json()) as { provider: string; baseUrl: string; apiKey: string };
  let models: Array<{ id: string; name: string }> = [];
  if (body.provider === "mock") {
    models = [
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "o3-mini", name: "o3-mini" },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
      { id: "deepseek-reasoner", name: "DeepSeek R1" },
    ];
  } else if (body.provider === "openai" || body.provider === "groq" || body.provider === "custom") {
    try {
      const url = `${body.baseUrl.replace(/\/+$/, "")}/models`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${body.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as any;
        models = (data.data ?? data.models ?? []).map((m: any) => ({
          id: m.id || m.name,
          name: m.name || m.id,
        }));
      }
    } catch {}
  } else if (body.provider === "anthropic") {
    try {
      const url = `${body.baseUrl.replace(/\/+$/, "")}/v1/models`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${body.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as any;
        models = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name || m.id }));
      }
    } catch {}
  } else if (body.provider === "ollama") {
    try {
      const url = `${body.baseUrl.replace(/\/+$/, "")}/api/tags`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${body.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as any;
        models = (data.models ?? []).map((m: any) => ({ id: m.name, name: m.name }));
      }
    } catch {}
  }
  return c.json({ models });
});api.get("/api/models", (c) => {
  const MODELS: Array<{ id: string; name: string; provider: string; model: string; baseUrl?: string; apiKeySecret?: string }> = [
    { id: "mock", name: "Mock (local test)", provider: "mock", model: "mock" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", model: "gpt-4.1-mini" },
    { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", model: "gpt-4.1" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", model: "gpt-4o-mini" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai", model: "gpt-4o" },
    { id: "o3-mini", name: "o3-mini", provider: "openai", model: "o3-mini" },
    { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic", model: "claude-sonnet-4-20250514" },
    { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic", model: "claude-3-5-haiku-20241022" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "custom", model: "gemini-2.5-flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "custom", model: "gemini-2.5-pro" },
    { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "groq", model: "llama-3.3-70b-versatile" },
    { id: "deepseek-r1", name: "DeepSeek R1", provider: "custom", model: "deepseek-reasoner" },
  ];
  const seen = new Set(MODELS.map((m) => m.id));

  // Scan all agent directories on disk for unique custom model configs.
  // This discovers models configured in any agent, regardless of ownership.
  try {
    const agentsDir = AGENTS_DIR;
    if (existsSync(agentsDir)) {
      for (const entry of readdirSync(agentsDir)) {
        const cfgPath = join(agentsDir, entry, "config.json");
        if (!existsSync(cfgPath)) continue;
        try {
          const raw = readFileSync(cfgPath, "utf8");
          const cfg = JSON.parse(raw);
          const pid = `${cfg.provider}/${cfg.model}`;
          if (
            cfg.provider && cfg.provider !== "mock" &&
            cfg.model && cfg.model !== "mock" &&
            !seen.has(pid)
          ) {
            seen.add(pid);
            MODELS.push({
              id: pid,
              name: `${cfg.provider}: ${cfg.model}`,
              provider: cfg.provider,
              model: cfg.model,
              baseUrl: cfg.baseUrl || undefined,
              apiKeySecret: cfg.apiKeySecret || undefined,
            });
          }
        } catch {
          // skip malformed configs
        }
      }
    }
  } catch {
    // agents dir not available — that's fine, return presets only
  }

  return c.json({ models: MODELS });
});

// ---- Runs (execution history) ----
api.get("/api/runs", async (c) => {
  const userId = c.get("userId") as string;
  const limit = Number(c.req.query("limit") ?? 100);
  return c.json({ runs: await RunStore.listForUser(userId, limit) });
});

api.get("/api/runs/:id", async (c) => {
  const userId = c.get("userId") as string;
  const run = await RunStore.get(c.req.param("id"), userId);
  if (!run) return c.json({ error: "not found" }, 404);
  return c.json({ run, invocations: await RunStore.listForRun(run.id) });
});

api.get("/api/chats/:id/runs", async (c) => {
  const userId = c.get("userId") as string;
  // Confirm ownership of chat
  const chat = await ChatStore.get(c.req.param("id"), userId);
  if (!chat) return c.json({ error: "not found" }, 404);
  return c.json({ runs: await RunStore.listForChat(c.req.param("id"), 50) });
});

// ---- Approvals (human-in-the-loop) ----
api.route("/api/approvals", approvalsApi);
// ---- Templates ----
api.route("/api/templates", templatesApi);
// ---- Webhooks (CRUD is auth-protected; public fire endpoint is mounted) ----
api.route("/api/webhooks", webhooksApi);

// ---- Web Space ----
api.route("/api/web-space", webSpaceApi);

// ---- Workspace ----
api.route("/api/workspace", workspaceApi);

// ---- Automations ----
api.route("/api/automations", automationsApi);
api.route("/api/integrations", integrationsApi);

// ---- Sandbox live interaction (for the editor UI) ----
api.get("/api/agents/:id/sandbox", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const opts = resolveSandboxOptions(agent);
  const path = c.req.query("path") ?? ".";
  try {
    const result = sandboxBrowse(opts, path);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

api.get("/api/agents/:id/sandbox/read", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const opts = resolveSandboxOptions(agent);
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path required" }, 400);
  try {
    const content = sandboxRead(opts, path);
    return c.json({ path, content });
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

const sandboxFileMime = (p: string) => {
  const lower = p.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".flac")) return "audio/flac";
  return "application/octet-stream";
};

api.get("/api/agents/:id/sandbox/file", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const opts = resolveSandboxOptions(agent);
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path required" }, 400);
  try {
    const result = sandboxReadBinary(opts, path);
    if (!result) return c.json({ error: "file not found" }, 404);
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "content-type": sandboxFileMime(path),
        "content-length": String(result.size),
        "cache-control": "private, max-age=60",
      },
    });
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

api.put("/api/agents/:id/sandbox/write", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const opts = resolveSandboxOptions(agent);
  const { path, content } = (await c.req.json()) as { path: string; content: string };
  try {
    sandboxWrite(opts, path, content);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

api.delete("/api/agents/:id/sandbox", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const opts = resolveSandboxOptions(agent);
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path required" }, 400);
  try {
    sandboxDelete(opts, path);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

api.post("/api/agents/:id/sandbox/exec", async (c) => {
  const userId = c.get("userId") as string;
  const agent = await AgentStore.get(c.req.param("id"), userId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const opts = resolveSandboxOptions(agent);
  const { command, args, timeoutMs } = (await c.req.json()) as { command: string; args?: string[]; timeoutMs?: number };
  try {
    const r = await sandboxExec(opts, command, args ?? [], timeoutMs);
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e?.message ?? String(e) }, 400);
  }
});

// ---- Secrets (encrypted at rest) ----
api.get("/api/secrets", async (c) => {
  const userId = c.get("userId") as string;
  const secrets = await SecretStore.list(userId);
  return c.json({ secrets });
});

api.put("/api/secrets/:name", async (c) => {
  const userId = c.get("userId") as string;
  const { value } = (await c.req.json()) as { value: string };
  if (!value) return c.json({ error: "value required" }, 400);
  const secret = await SecretStore.set(userId, c.req.param("name"), value);
  return c.json({ secret });
});

api.delete("/api/secrets/:name", async (c) => {
  const userId = c.get("userId") as string;
  const ok = await SecretStore.delete(userId, c.req.param("name"));
  return c.json({ ok });
});

// ---- Dashboard (observability) ----
api.route("/api/dashboard", dashboardApi);
api.route("/api/personas", personasApi);
api.route("/api/rules", rulesApi);

// ---- Sites & Services ----
api.route("/api/sites", sitesApi);
api.route("/api/services", servicesApi);

export default api;
