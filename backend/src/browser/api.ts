import { Hono } from "hono";
import type { HonoEnv } from "../types/hono.ts";
import { BrowserSessionStore } from "./store.ts";
import { browserRuntime } from "./runtime.ts";
import { getActiveView } from "./active.ts";
import { db } from "../db/pg.ts";

export const browserApi = new Hono<HonoEnv>();
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

// ====================================================================
// Active browser preview (lab tools session, for frontend BrowserPage)
// ====================================================================

// GET /api/browser/active — return current AI browser activity for this user
browserApi.get("/active", async (c) => {
  const userId = c.get("userId");
  const view = getActiveView(userId);
  if (!view) return c.json({ active: false, url: null, title: null }, 200, { "Cache-Control": "no-store" });
  return c.json({
    active: true,
    url: view.url,
    title: view.title,
    agentId: view.agentId,
    timestamp: view.timestamp,
  }, 200, { "Cache-Control": "no-store" });
});

// GET /api/browser/active/content — return cached HTML for iframe proxy
browserApi.get("/active/content", async (c) => {
  const userId = c.get("userId");
  const view = getActiveView(userId);
  if (!view || !view.html) {
    return c.html("<html><body style='font-family:sans-serif;padding:2rem;color:#666'><h2>No browser activity</h2><p>The AI hasn't opened a page yet.</p></body></html>", 200);
  }
  // Rewrite relative URLs to absolute so they work in the iframe proxy
  let html = view.html;
  try {
    const baseUrl = new URL(view.url);
    html = html
      .replace(/(<(?:a|link|area|base)\s[^>]*?\bhref\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
      .replace(/(<(?:img|script|source|video|audio|iframe|embed|object|input|track)\s[^>]*?\bsrc\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
      .replace(/(<(?:form)\s[^>]*?\baction\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
      .replace(/(<(?:img|video|audio|source|track)\s[^>]*?\bposter\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
      .replace(/(<(?:video|audio|source|track)\s[^>]*?\bsrcset\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`);
    html = html.replace(
      /<\/head>/i,
      `<base href="${baseUrl.origin}/">\n</head>`
    );
  } catch {
    // If URL parsing fails, serve raw
  }
  return c.html(html, 200, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;" });
});

// ====================================================================
// URL proxy — fetches any page server-side, returns same-origin HTML.
// Solves X-Frame-Options blocking for the manual browser iframe.
// ====================================================================

browserApi.get("/proxy", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) return c.html("<h1>Missing url param</h1>", 400);

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return c.html("<h1>Invalid URL</h1>", 400);
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    return c.html("<h1>Only http/https URLs allowed</h1>", 400);
  }

  try {
    const res = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return c.html(
        `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;font-family:sans-serif">
          <div style="text-align:center">
            <p>Cannot preview this content type: ${contentType}</p>
            <a href="${target.toString()}" target="_blank" rel="noopener">Open in new tab</a>
          </div>
        </body></html>`,
        200,
        { "Cache-Control": "no-store" },
      );
    }

    let html = await res.text();
    const baseUrl = target.origin + "/";

    // Rewrite relative URLs to absolute
    html = html
      .replace(/(<(?:a|link|area|base)\s[^>]*?\bhref\s*=\s*["'])\/(?!\/)/gi, `$1${target.origin}/`)
      .replace(/(<(?:img|script|source|video|audio|iframe|embed|object|input|track)\s[^>]*?\bsrc\s*=\s*["'])\/(?!\/)/gi, `$1${target.origin}/`)
      .replace(/(<(?:form)\s[^>]*?\baction\s*=\s*["'])\/(?!\/)/gi, `$1${target.origin}/`)
      .replace(/(<(?:img|video|audio|source|track)\s[^>]*?\bposter\s*=\s*["'])\/(?!\/)/gi, `$1${target.origin}/`)
      .replace(/(<(?:video|audio|source|track)\s[^>]*?\bsrcset\s*=\s*["'])\/(?!\/)/gi, `$1${target.origin}/`);

    // Strip X-Frame-Options meta tags and inject base
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?x-frame-options[^>]*>/gi, "");
    html = html.replace(/<\/head>/i, `<base href="${baseUrl}">\n</head>`);

    return c.html(html, 200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; media-src * data: blob:",
    });
  } catch (err: any) {
    return c.html(
      `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;font-family:sans-serif">
        <div style="text-align:center">
          <p>Failed to load: ${err.message ?? "unknown error"}</p>
          <a href="${target.toString()}" target="_blank" rel="noopener">Open in new tab</a>
        </div>
      </body></html>`,
      502,
      { "Cache-Control": "no-store" },
    );
  }
});
