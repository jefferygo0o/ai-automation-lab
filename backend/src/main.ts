/**
 * Entry point.
 *
 *   bun run src/main.ts
 *
 * Boots the API server on $PORT (default 8787). Initializes the database,
 * seeds built-in skills, and serves the frontend static build.
 */
import "./db/index.ts"; // initialize DB + run schema
import "./security/auth.ts";
import "./tools/builtin.ts";
import "./tools/skill_tools.ts";
import "./tools/lab_tools.ts";
import "./tools/integration_tools.ts";
import "./tools/webspace_tools.ts";
import { Skills } from "./skills/index.ts";
import api from "./api/server.ts";
import { webhooksPublicApi } from "./webhooks/index.ts";
import { AutomationScheduler } from "./automations/scheduler.ts";
import { serve } from "bun";
import { join } from "path";

Skills.init();
Skills.seedUserSkills();
AutomationScheduler.start();

const port = Number(process.env.PORT ?? 8787);
const frontendDist = join(import.meta.dir, "..", "..", "frontend", "dist");

serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // Public webhook fire endpoint (no auth — secret in URL).
    // Must come before the generic /api/ check below so the auth
    // middleware does not intercept it.
    if (url.pathname.startsWith("/api/hooks")) {
      return webhooksPublicApi.fetch(req);
    }

    // ---- Web Space serving layer (public URLs for hosted routes) ----
    if (url.pathname.startsWith("/ws/")) {
      const { webSpaceServing } = await import("./webspace/serving.ts");
      const stripped = new Request(
        new URL(url.pathname.replace(/^\/ws/, "") + url.search, url.origin),
        req,
      );
      return webSpaceServing.fetch(stripped);
    }

    // API routes go to the Hono app
    if (url.pathname.startsWith("/api/")) {
      return api.fetch(req);
    }

    // Health endpoint is also outside /api for convenience
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Serve static frontend files
    // Map "/" to "/index.html", resolve the file path, serve if exists
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(frontendDist, filePath));
    const exists = await file.exists();
    if (exists) {
      return new Response(file);
    }

    // SPA fallback — serve index.html for all non-API, non-file paths
    const index = Bun.file(join(frontendDist, "index.html"));
    if (await index.exists()) {
      return new Response(index, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Last resort: let the API try (returns its own 404)
    return api.fetch(req);
  },
});

console.log(`[lab] API on :${port}`);
console.log(`[lab] Frontend dist: ${frontendDist}`);
