import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { Audit } from "../audit/index.ts";
import { Hono } from "hono";

export type ChannelType = "webhook" | "email" | "telegram" | "discord" | "slack" | "sms";
export interface ChannelAdapter { type: ChannelType; send(channel: ChannelRecord, text: string): Promise<{ ok: boolean; externalId?: string; error?: string }>; }
export interface ChannelRecord { id: string; ownerId: string; type: ChannelType; name: string; config: Record<string, unknown>; enabled: boolean; createdAt: number; }

function row(r: any): ChannelRecord {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(r.config_json || "{}"); } catch {}
  return { id: r.id, ownerId: r.owner_id, type: r.type, name: r.name, config, enabled: r.enabled !== 0, createdAt: r.created_at };
}

export const ChannelStore = {
  async list(ownerId: string) { return (await db.prepare("SELECT * FROM channel_adapters WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId) as any[]).map(row); },
  async get(id: string, ownerId: string) { const r = await db.prepare("SELECT * FROM channel_adapters WHERE id = ? AND owner_id = ?").get(id, ownerId); return r ? row(r) : null; },
  async upsert(ownerId: string, input: { id?: string; type: ChannelType; name: string; config: Record<string, unknown>; enabled?: boolean }) {
    const id = input.id || `chan_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(`INSERT INTO channel_adapters (id, owner_id, type, name, config_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = EXCLUDED.type, name = EXCLUDED.name, config_json = EXCLUDED.config_json, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`).run(id, ownerId, input.type, input.name, JSON.stringify(input.config || {}), input.enabled === false ? 0 : 1, now, now);
    return ChannelStore.get(id, ownerId);
  },
  async delete(id: string, ownerId: string) { return (await db.prepare("DELETE FROM channel_adapters WHERE id = ? AND owner_id = ?").run(id, ownerId)).changes > 0; },
};

export const ChannelAdapters: Record<ChannelType, ChannelAdapter> = {
  webhook: { type: "webhook", async send(channel, text) { const url = String(channel.config.url || ""); if (!url) return { ok: false, error: "webhook url missing" }; const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) }); return { ok: r.ok, error: r.ok ? undefined : await r.text() }; } },
  email: { type: "email", async send() { return { ok: false, error: "email transport requires provider configuration" }; } },
  telegram: { type: "telegram", async send() { return { ok: false, error: "telegram transport requires bot configuration" }; } },
  discord: { type: "discord", async send() { return { ok: false, error: "discord transport requires bot configuration" }; } },
  slack: { type: "slack", async send() { return { ok: false, error: "slack transport requires bot configuration" }; } },
  sms: { type: "sms", async send() { return { ok: false, error: "sms transport requires provider configuration" }; } },
};

export const channelsApi = new Hono<any>();
channelsApi.get("/", async (c: any) => c.json({ channels: await ChannelStore.list(c.get("userId")) }));
channelsApi.post("/", async (c: any) => { const ownerId = c.get("userId"); const body = await c.req.json(); const channel = await ChannelStore.upsert(ownerId, body); await Audit.record({ ownerId, actor: "user", action: "channel.upsert", targetId: channel?.id, targetType: "channel" }); return c.json({ channel }); });
channelsApi.delete("/:id", async (c: any) => { const ownerId = c.get("userId"); const ok = await ChannelStore.delete(c.req.param("id"), ownerId); return c.json({ ok }); });
