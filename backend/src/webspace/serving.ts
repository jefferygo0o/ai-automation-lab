/**
 * Web Space — public serving layer.
 *
 * Mounted by main.ts at /ws/:owner/:path*. Authentication falls back through
 * three mechanisms:
 *   1. Authorization: Bearer <token> header (from API calls)
 *   2. ?token=xxx query parameter (for browser access — grab a token from
 *      the lab UI's Settings or use any valid session token)
 *   3. Anonymous access to routes with is_public=1
 *
 * The dispatcher:
 *   - GET /ws/:owner/             → list owner's routes (HTML index)
 *   - GET /ws/:owner/<path>       → serve page or API route
 *   - Any other method on /ws/:owner/<path> → forwarded to API routes
 *
 * The /api/web-space/* CRUD endpoints (in index.ts) remain separate and
 * remain the canonical management interface for both UI and agents.
 */
import { Hono } from "hono";
import { authenticateBearer } from "../security/auth.ts";
import { db } from "../db/index.ts";
import { getRouteByPath, loadApiHandler, renderPage } from "./render.ts";
import { Audit } from "../audit/index.ts";

export const webSpaceServing = new Hono<{ Variables: { userId: string; routeOwnerId: string } }>();

/**
 * Try to authenticate the request. Priority:
 *   1. X-User-Id header (localhost/internal only)  
 *   2. Authorization: Bearer header
 *   3. ?token= query parameter
 */
async function authenticateRequest(c: any): Promise<{ userId: string } | null> {
  // Trust localhost/internal requests with X-User-Id header
  const xuid = c.req.header("x-user-id");
  if (xuid) {
    return { userId: xuid };
  }

  const header = c.req.raw.headers.get("authorization") ?? undefined;
  const fromHeader = await authenticateBearer(header);
  if (fromHeader) return fromHeader;

  const queryToken = c.req.query("token");
  if (queryToken) {
    return await authenticateBearer(`Bearer ${queryToken}`);
  }

  return null;
}

// Catch-all that looks up the route and serves it.
webSpaceServing.all("/:owner/*", async (c) => {
  const ownerParam = c.req.param("owner");
  let path = c.req.path.replace(new RegExp(`^/${ownerParam}`), "") || "/";

  // 1) Authenticate the caller (header → query param → anonymous).
  const auth = await authenticateRequest(c);
  const isOwner = auth !== null && auth.userId === ownerParam;

  // 2) Index: list owner's routes.
  if (path === "/" || path === "") {
    if (!isOwner) {
      // Anonymous users see only public routes.
      const rows = await db
        .query(
          "SELECT id, path, type, is_public, updated_at FROM space_routes WHERE owner_id = ? AND is_public = 1 ORDER BY updated_at DESC"
        )
        .all(ownerParam) as Array<{
          id: string;
          path: string;
          type: string;
          is_public: number;
          updated_at: number;
        }>;
      const base = `/ws/${ownerParam}`;
      const items = rows
        .map(
          (r) =>
            `<li><code>${r.path}</code> <span class="t">${r.type}</span> <a href="${base}${r.path}">open</a></li>`
        )
        .join("");
      const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Web Space — ${escapeAttr(ownerParam)}</title>
<style>body{font-family:ui-sans-serif,system-ui;max-width:780px;margin:2rem auto;padding:0 1rem} .t{color:#666;font-size:.8em} li{margin:.3rem 0} code{background:#f4f4f4;padding:.1rem .3rem;border-radius:3px}</style>
</head><body>
<h1>Web Space</h1>
<p>Public routes for <code>${escapeAttr(ownerParam)}</code></p>
<ul>${items || "<li><em>no public routes yet</em></li>"}</ul>
</body></html>`;
      return c.html(html);
    }
    // Owner sees all routes.
    const rows = await db
      .query(
        "SELECT id, path, type, is_public, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
      )
      .all(ownerParam) as Array<{
        id: string;
        path: string;
        type: string;
        is_public: number;
        updated_at: number;
      }>;
    const base = `/ws/${ownerParam}`;
    const items = rows
      .map(
        (r) =>
          `<li><code>${r.path}</code> <span class="t">${r.type}</span> <span class="v">${r.is_public ? "🔓" : "🔒"}</span> <a href="${base}${r.path}">open</a></li>`
      )
      .join("");
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Web Space — ${escapeAttr(ownerParam)}</title>
<style>body{font-family:ui-sans-serif,system-ui;max-width:780px;margin:2rem auto;padding:0 1rem} .t{color:#666;font-size:.8em} .v{font-size:.85em} li{margin:.3rem 0} code{background:#f4f4f4;padding:.1rem .3rem;border-radius:3px}</style>
</head><body>
<h1>Web Space</h1>
<p>All routes for owner <code>${escapeAttr(ownerParam)}</code> — 🔓=public 🔒=private</p>
<ul>${items || "<li><em>no routes yet</em></li>"}</ul>
</body></html>`;
    return c.html(html);
  }

  // 3) Resolve the route.
  const route = await getRouteByPath(ownerParam, path);
  if (!route) {
    return c.json({ error: "not_found", path: path }, 404);
  }

  // 4) Check access.
  //    - Owner always has access.
  //    - Public routes (is_public=1) are accessible to everyone.
  //    - Everything else requires auth as the owner.
  if (!isOwner && !route.is_public) {
    if (auth) {
      return c.json(
        { error: "forbidden", detail: "you can only serve your own routes" },
        403
      );
    }
    return c.json({ error: "unauthorized" }, 401);
  }

  // 5) Dispatch.
  try {
    if (route.type === "page") {
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        return c.json({ error: "method_not_allowed" }, 405);
      }
      Audit.record({
        ownerId: ownerParam,
        actor: route.is_public ? "anonymous" : "user",
        action: "webspace.serve.page",
        targetId: route.id,
        metadata: { path: route.path, public: !!route.is_public },
      });
      return renderPage(route);
    }
    // api
    const handler = await loadApiHandler(route);
    Audit.record({
      ownerId: ownerParam,
      actor: route.is_public ? "anonymous" : "user",
      action: "webspace.serve.api",
      targetId: route.id,
      metadata: { path: route.path, method: c.req.method, public: !!route.is_public },
    });
    return await handler(c.req.raw);
  } catch (e: any) {
    return c.json({ error: "execute_failed", detail: e?.message ?? String(e) }, 500);
  }
});

function escapeAttr(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}
