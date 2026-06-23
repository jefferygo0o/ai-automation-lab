/**
 * Webhooks — incoming HTTP triggers that start a chat with a specific agent
 * and a templated instruction.
 *
 * Each webhook has:
 *   - a unique secret token (used in the URL path)
 *   - a target agent
 *   - an instruction template (the request body is available as `payload`)
 *   - a reusability flag (single-use vs. multi-fire)
 *
 * A webhook receives a POST with arbitrary JSON; the platform spins up a
 * fresh chat, runs the agent with the templated instruction, and streams
 * the response back as SSE.
 */
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { AgentStore } from "../agents/registry.ts";
import { ChatStore } from "../chats/index.ts";
import { runAgentTurn, type StreamEvent } from "../agents/runtime.ts";
import { Audit } from "../audit/index.ts";

interface WebhookRow {
  id: string;
  owner_id: string;
  name: string;
  agent_id: string;
  instruction_template: string;
  reusable: number;
  is_enabled: number;
  last_called_at: number | null;
  call_count: number;
  created_at: number;
}

function format(r: WebhookRow) {
  return {
    id: r.id,
    name: r.name,
    agentId: r.agent_id,
    instructionTemplate: r.instruction_template,
    reusable: r.reusable !== 0,
    enabled: r.is_enabled !== 0,
    lastFiredAt: r.last_called_at,
    fireCount: r.call_count,
    createdAt: r.created_at,
  };
}

export const WebhookStore = {
  async list(ownerId: string) {
    return (await db.prepare("SELECT * FROM webhook_endpoints WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId) as WebhookRow[]).map(format);
  },
  async get(id: string, ownerId: string) {
    const r = await db.prepare("SELECT * FROM webhook_endpoints WHERE id = ? AND owner_id = ?").get(id, ownerId) as WebhookRow | undefined;
    return r ? format(r) : null;
  },
  async bySecret(secret: string) {
    const r = await db.prepare("SELECT * FROM webhook_endpoints WHERE id = ? AND is_enabled = 1").get(`wh_${secret}`) as WebhookRow | undefined;
    return r ? format(r) : null;
  },
  async create(input: { name: string; agentId: string; instructionTemplate: string; reusable?: boolean; ownerId: string }) {
    const secret = nanoid(24);
    const id = `wh_${secret}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO webhook_endpoints (id, owner_id, name, agent_id, instruction_template, reusable, is_enabled, call_count, created_at, secret)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
    ).run(id, input.ownerId, input.name, input.agentId, input.instructionTemplate, input.reusable ? 1 : 0, now, secret);
    Audit.record({ ownerId: input.ownerId, actor: "user", action: "webhook.create", targetId: id, targetType: "webhook", metadata: { name: input.name } });
    return { id, secret, name: input.name };
  },
  async update(id: string, ownerId: string, patch: Partial<{ name: string; instructionTemplate: string; reusable: boolean; enabled: boolean }>) {
    const sets: string[] = [];
    const vals: any[] = [];
    if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
    if (patch.instructionTemplate !== undefined) { sets.push("instruction_template = ?"); vals.push(patch.instructionTemplate); }
    if (patch.reusable !== undefined) { sets.push("reusable = ?"); vals.push(patch.reusable ? 1 : 0); }
    if (patch.enabled !== undefined) { sets.push("is_enabled = ?"); vals.push(patch.enabled ? 1 : 0); }
    if (!sets.length) return false;
    vals.push(id, ownerId);
    return await db.prepare(`UPDATE webhook_endpoints SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals).changes > 0;
  },
  async delete(id: string, ownerId: string) {
    const ok = await db.prepare("DELETE FROM webhook_endpoints WHERE id = ? AND owner_id = ?").run(id, ownerId).changes > 0;
    if (ok) Audit.record({ ownerId, actor: "user", action: "webhook.delete", targetId: id, targetType: "webhook" });
    return ok;
  },
  async recordFire(id: string) {
    await db.prepare("UPDATE webhook_endpoints SET last_called_at = ?, call_count = call_count + 1 WHERE id = ?").run(Date.now(), id);
  },
};

/**
 * The webhook router lives at /api/hooks/:secret and /api/webhooks (CRUD).
 * Incoming fires run the agent with the templated instruction and stream
 * the result as SSE.
 */
export const webhooksApi = new Hono();

// CRUD (auth-required)
webhooksApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ webhooks: WebhookStore.list(userId) });
});

webhooksApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { name?: string; agentId?: string; instructionTemplate?: string; reusable?: boolean };
  if (!body.name || !body.agentId || !body.instructionTemplate) return c.json({ error: "name, agentId, instructionTemplate required" }, 400);
  const hook = WebhookStore.create({ name: body.name, agentId: body.agentId, instructionTemplate: body.instructionTemplate, reusable: body.reusable ?? true, ownerId: userId });
  return c.json({ webhook: { ...hook, agentId: body.agentId, instructionTemplate: body.instructionTemplate, reusable: body.reusable ?? true, enabled: true, fireCount: 0, lastFiredAt: null, createdAt: Date.now() } });
});

webhooksApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { name?: string; instructionTemplate?: string; reusable?: boolean; enabled?: boolean };
  const ok = WebhookStore.update(c.req.param("id"), userId, body);
  return c.json({ ok });
});

webhooksApi.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ ok: WebhookStore.delete(c.req.param("id"), userId) });
});

/**
 * Public fire endpoint — no auth header, just the secret in the path.
 * Body is JSON, available to the agent as `payload`.
 * If the webhook is single-use, it is disabled after firing.
 */
export const webhooksPublicApi = new Hono();
webhooksPublicApi.post("/api/hooks/fire/:secret", async (c) => {
  const secret = c.req.param("secret");
  const hook = WebhookStore.bySecret(secret);
  if (!hook) return c.json({ error: "invalid or disabled webhook" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const instruction = hook.instructionTemplate
    .replace(/\{\{payload\}\}/g, JSON.stringify(body, null, 2))
    .replace(/\{\{payload\.[^}]+\}\}/g, (_, path) => {
      const parts = path.replace("payload.", "").split(".");
      let cur: any = body;
      for (const p of parts) cur = cur?.[p];
      return cur == null ? "" : String(cur);
    });

  const owner = await db.prepare("SELECT owner_id FROM webhook_endpoints WHERE id = ?").get(hook.id) as { owner_id: string };
  const agent = AgentStore.get(hook.agentId, owner.owner_id);
  if (!agent) return c.json({ error: "agent no longer exists" }, 410);

  const chat = ChatStore.create(owner.owner_id, hook.agentId, `Webhook: ${hook.name}`);
  WebhookStore.recordFire(hook.id);
  Audit.record({ ownerId: owner.owner_id, actor: "system", action: "webhook.fire", targetId: hook.id, targetType: "webhook", metadata: { agentId: hook.agentId, chatId: chat.id } });

  // Disable single-use webhooks
  if (!hook.reusable) {
    await db.prepare("UPDATE webhook_endpoints SET is_enabled = 0 WHERE id = ?").run(hook.id);
  }

  // Stream the agent run as SSE
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = async (e: StreamEvent) => {
    try { await writer.write(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); } catch {}
  };
  runAgentTurn(owner.owner_id, chat.id, instruction, send)
    .catch((e: any) => send({ type: "error", message: e?.message ?? String(e) }))
    .finally(() => writer.close().catch(() => {}));

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive" },
  });
});
