/**
 * Lab backend entry — Bun-served Hono app.
 * Boots DB, security, tools, skills, MCP, memory, then serves on PORT.
 */
import "./db/index.ts";
import { initSchema } from "./db/index.ts";
import "./security/auth.ts";
import "./tools/builtin.ts";
import "./tools/skill_tools.ts";
import "./tools/lab_tools.ts";
import "./tools/integration_tools.ts";
import "./tools/lab_tools_extra.ts";
import { Skills } from "./skills/index.ts";
import api from "./api/server.ts";
import { mcpManager } from "./mcp/client.ts";
import { AutomationScheduler } from "./automations/scheduler.ts";

Skills.init();
Skills.seedUserSkills();
await initSchema(); // run PG schema migrations

// Boot any saved MCP servers
mcpManager.startAll().catch((e) => console.warn("[lab] mcp.startAll error:", e));

// Start the automation scheduler (background loop).
AutomationScheduler.start();

// Global crash handler — prevent server death from unhandled promise rejections
// in agent turns, sandbox spawns, etc.
process.on("unhandledRejection", (reason) => {
  console.error("[lab] UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[lab] UNCAUGHT EXCEPTION:", err);
});

const port = Number(process.env.PORT ?? 7777);

// Resolve dist path — env override, then derive from project root
const DIST = process.env.LAB_DIST
  ? process.env.LAB_DIST
  : `${process.env.LAB_PROJECT_ROOT}/frontend/dist`;

// SPA index fallback — read once and keep in memory
let indexHtml = "";
try {
  indexHtml = await Bun.file(`${DIST}/index.html`).text();
} catch {
  console.warn("[lab] no SPA index.html found at", DIST);
}

const mime = (p: string) => {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".ico")) return "image/x-icon";
  if (p.endsWith(".woff2")) return "font/woff2";
  if (p.endsWith(".woff")) return "font/woff";
  if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

// Use Bun.serve with a custom fetch wrapper that returns Response
// objects directly so streaming responses aren't buffered. Hono's
// `app.fetch` returns a Response which we pass through unmodified.
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes first — let Hono handle them
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      return api.fetch(req);
    }

    // Static assets from dist/
    if (url.pathname !== "/" && indexHtml) {
      const filePath = `${DIST}${url.pathname}`;
      const f = Bun.file(filePath);
      if (await f.exists()) {
        return new Response(f, { headers: { "content-type": mime(url.pathname) } });
      }
    }

    // SPA fallback — serve index.html for client-side routing
    if (indexHtml) {
      return new Response(indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Lab API running. Build the frontend (cd frontend && bun run build) and restart.", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
});

console.log(`[lab] API + UI on :${port} (dist=${DIST})`);
