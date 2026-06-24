/**
 * Web Space serving helpers.
 *
 * Strategy:
 *   - Page routes store raw HTML (or a JSON-shaped structured doc).
 *     Agents that want dynamic pages can use the API route type instead.
 *   - API routes store TypeScript source exporting a default Hono handler.
 *     We transpile + cache at runtime via Bun.build, then dynamically import.
 *
 * Everything is owner-scoped. The dispatcher in main.ts authenticates the
 * bearer token, then looks up routes by (owner_id, path) from SQLite.
 */
import { db } from "../db/index.ts";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { nanoid } from "nanoid";
import { Hono } from "hono";

export interface SpaceRouteRow {
  id: string;
  owner_id: string;
  path: string;
  type: "page" | "api";
  code: string;
  is_public: number;
  created_at: number;
  updated_at: number;
}

export async function getRouteByPath(ownerId: string, path: string): Promise<SpaceRouteRow | null> {
  // Normalize: ensure leading slash, no trailing slash (except root)
  let p = path;
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  const row = await db
    .query(
      "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at FROM space_routes WHERE owner_id = ? AND path = ?"
    )
    .get(ownerId, p) as SpaceRouteRow | undefined;
  return row ?? null;
}

// ---- API route compilation cache ----

const apiCache = new Map<
  string,
  { mod: any; compiledAt: number; sourceHash: string }
>();

const cacheDir = join(process.cwd(), "data", "webspace_cache");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

export async function loadApiHandler(
  route: SpaceRouteRow
): Promise<(req: Request) => Promise<Response> | Response> {
  const hash = createHash("sha256").update(route.code).digest("hex").slice(0, 16);
  const cached = apiCache.get(route.id);
  if (cached && cached.sourceHash === hash) {
    return wrapHonoDefault(cached.mod.default, route);
  }

  // Compile TS → JS using Bun's bundler, then dynamic import.
  // Bun.build.entrypoints must reference real files, so we write the route
  // source to a .ts file in the cache dir and build it.
  const sourceFile = join(cacheDir, `${route.id}.ts`);
  writeFileSync(sourceFile, route.code);
  const outFile = join(cacheDir, `${route.id}_${hash}.js`);
  const result = await Bun.build({
    entrypoints: [sourceFile],
    target: "bun",
    format: "esm",
    outdir: cacheDir,
    naming: `${route.id}_${hash}.js`,
  });

  if (!result.success) {
    const msgs = result.logs.map((l) => l.message).join("\n");
    throw new Error(`Web Space API compile failed: ${msgs}`);
  }

  // Force the file to exist (Bun.build writes it asynchronously).
  const expected = join(cacheDir, `${route.id}_${hash}.js`);
  // import with cache-busting query param
  const mod = await import(`${expected}?v=${hash}&t=${Date.now()}`);
  apiCache.set(route.id, { mod, compiledAt: Date.now(), sourceHash: hash });
  return wrapHonoDefault(mod.default, route);
}

function wrapHonoDefault(
  handler: any,
  route: SpaceRouteRow
): (req: Request) => Promise<Response> {
  if (typeof handler !== "function") {
    throw new Error(
      `Web Space API route "${route.path}" must export a default function`
    );
  }
  // Build a tiny Hono app that mounts the user's handler at every method,
  // so they get a real Hono Context (c.json / c.text / c.req.json etc.)
  const app = new Hono();
  app.all("*", handler);
  return async (req: Request) => {
    const res = await app.request(req);
    return res;
  };
}

// ---- Page route rendering ----

/**
 * Render a page route to an HTML Response.
 *
 * The `code` field may be:
 *   1. Raw HTML — returned inside a minimal shell
 *   2. JSON-shaped structured doc: `{"title":"x","body":"<h1>hi</h1>","style":"..."}`
 *
 * This is intentionally simple — agents that need dynamic UI should
 * create API routes and build a real frontend, or use raw HTML.
 */
export function renderPage(route: SpaceRouteRow): Response {
  const code = route.code ?? "";
  // Try JSON structured doc first.
  if (code.trim().startsWith("{")) {
    try {
      const doc = JSON.parse(code);
      if (doc && typeof doc === "object" && "body" in doc) {
        return new Response(htmlShell(doc.title ?? route.path, doc.body, doc.style ?? "", doc.script ?? ""), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } catch {
      // fall through to raw HTML
    }
  }
  // Treat as raw HTML body.
  return new Response(
    htmlShell(route.path, code, "", ""),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function htmlShell(title: string, body: string, style: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 2rem auto; max-width: 720px; padding: 0 1rem; line-height: 1.55; color: #1a1a1a; }
  ${style}
</style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Invalidate the in-process cache for a route (called after edits).
export function invalidateApiCache(routeId: string) {
  apiCache.delete(routeId);
}
