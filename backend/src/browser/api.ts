import { Hono } from "hono";
import type { HonoEnv } from "../types/hono.ts";
import { BrowserSessionStore } from "./store.ts";
import { browserSessions } from "./runtime.ts";

export const browserApi = new Hono<HonoEnv>();

browserApi.get("/sessions", async (c) => {
  return c.json({ sessions: await BrowserSessionStore.list(c.get("userId")) });
});

browserApi.post("/sessions", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { agentId?: string; label?: string };
  const session = await BrowserSessionStore.create(c.get("userId"), body);
  return c.json({ session }, 201);
});

browserApi.get("/sessions/:id", async (c) => {
  const session = await BrowserSessionStore.get(c.req.param("id"), c.get("userId"));
  return session ? c.json({ session }) : c.json({ error: "not found" }, 404);
});

browserApi.post("/sessions/:id/close", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  await browserSessions.close(id);
  await BrowserSessionStore.close(id, c.get("userId"));
  return c.json({ ok: true });
});

browserApi.get("/sessions/:id/downloads", async (c) => {
  const session = await BrowserSessionStore.get(c.req.param("id"), c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json({ sessionId: session.id, downloads: await browserSessions.listDownloads(session.id, c.get("userId")) });
});

browserApi.get("/sessions/:id/accessibility", async (c) => {
  const session = await BrowserSessionStore.get(c.req.param("id"), c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  const snapshot = await browserSessions.accessibility(session.id, c.get("userId"));
  return c.json({ sessionId: session.id, snapshot });
});
