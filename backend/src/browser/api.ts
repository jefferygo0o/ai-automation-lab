import { Hono } from "hono";
import type { HonoEnv } from "../types/hono.ts";
import { BrowserSessionStore } from "./store.ts";
import { browserRuntime } from "./runtime.ts";

export const browserApi = new Hono<HonoEnv>();

// List all sessions
browserApi.get("/sessions", async (c) => {
  const sessions = await BrowserSessionStore.list(c.get("userId"));
  return c.json({ sessions });
});

// Create a session
browserApi.post("/sessions", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { agentId?: string; name?: string };
  const session = await BrowserSessionStore.create(c.get("userId"), body);
  return c.json({ session }, 201);
});

// Get a session
browserApi.get("/sessions/:id", async (c) => {
  const session = await BrowserSessionStore.get(c.req.param("id"), c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json({ session });
});

// Start a session (launch Playwright)
browserApi.post("/sessions/:id/start", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  try {
    await browserRuntime.start(id);
    const updated = await BrowserSessionStore.update(id, c.get("userId"), {
      status: "active",
      lastStartedAt: Date.now(),
    });
    return c.json({ session: updated });
  } catch (err: any) {
    return c.json({ error: `Failed to start browser: ${err.message}` }, 500);
  }
});

// Navigate to URL
browserApi.post("/sessions/:id/navigate", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  const body = await c.req.json() as { url: string };
  if (!body.url) return c.json({ error: "url is required" }, 400);
  try {
    const result = await browserRuntime.navigate(id, body.url);
    await BrowserSessionStore.update(id, c.get("userId"), { currentUrl: result.url });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: `Navigation failed: ${err.message}`, url: body.url }, 500);
  }
});

// Proxy content (for iframe display - same origin, no XFO blocking)
browserApi.get("/sessions/:id/content", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.html("<html><body><h1>Session not found</h1></body></html>", 404);
  try {
    const { html, url } = await browserRuntime.proxyContent(id);
    return c.html(html);
  } catch (err: any) {
    return c.html(`<html><body><h1>Content proxy error</h1><p>${err.message}</p></body></html>`, 502);
  }
});

// Take screenshot
browserApi.get("/sessions/:id/screenshot", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  try {
    const buf = await browserRuntime.screenshot(id);
    return c.newResponse(buf as unknown as ReadableStream, 200, {
      "content-type": "image/png",
    });
  } catch (err: any) {
    return c.json({ error: `Screenshot failed: ${err.message}` }, 500);
  }
});

// Get session status (active URL, title, alive)
browserApi.get("/sessions/:id/status", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  const status = await browserRuntime.status(id);
  return c.json({
    ...status,
    dbStatus: session.status,
  });
});

// Evaluate JS in page
browserApi.post("/sessions/:id/eval", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  const body = await c.req.json() as { script: string };
  if (!body.script) return c.json({ error: "script is required" }, 400);
  try {
    const result = await browserRuntime.eval(id, body.script);
    return c.json({ result });
  } catch (err: any) {
    return c.json({ error: `Eval failed: ${err.message}` }, 500);
  }
});

// Close session
browserApi.post("/sessions/:id/close", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  await browserRuntime.close(id);
  await BrowserSessionStore.close(id, c.get("userId"));
  return c.json({ ok: true });
});

// Delete session
browserApi.delete("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const session = await BrowserSessionStore.get(id, c.get("userId"));
  if (!session) return c.json({ error: "not found" }, 404);
  await browserRuntime.close(id).catch(() => {});
  await BrowserSessionStore.close(id, c.get("userId"));
  // Hard-delete from DB
  await db.prepare("DELETE FROM browser_sessions WHERE id = $1 AND owner_id = $2").run(id, c.get("userId"));
  await db.prepare("DELETE FROM browser_downloads WHERE session_id = $1 AND owner_id = $2").run(id, c.get("userId"));
  return c.json({ ok: true });
});
