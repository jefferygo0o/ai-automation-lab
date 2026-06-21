/**
 * AI Automation Lab — backend entrypoint.
 *
 * This file is the production entrypoint used when the backend is run
 * outside of `bun --watch` (e.g. in containers, or via `bun run start`).
 *
 * Behavior:
 *   - Boots the Hono HTTP server defined in `src/server.ts`.
 *   - Ensures the SQLite database is migrated before accepting traffic.
 *   - Loads secrets from the vault on startup (best-effort).
 *   - Wires up graceful shutdown on SIGINT / SIGTERM.
 *
 * Dev workflows should still use `bun --watch src/main.ts` directly; this
 * file exists so that `node index.ts` / `bun index.ts` works as a stable
 * production entrypoint regardless of which file under src/ the editor
 * happens to be focused on.
 */

import { start } from "./src/server";
import { runMigrations } from "./src/db";
import { loadAllSecrets } from "./src/secrets/store";

async function main() {
  console.log("[ai-automation-lab] booting backend…");

  // 1. Schema
  try {
    await runMigrations();
    console.log("[ai-automation-lab] db migrations: ok");
  } catch (err) {
    console.error("[ai-automation-lab] db migrations failed:", err);
    process.exit(1);
  }

  // 2. Secrets (best-effort — missing vault is fine in dev)
  try {
    const count = await loadAllSecrets();
    console.log(`[ai-automation-lab] loaded ${count} secrets from vault`);
  } catch (err) {
    console.warn("[ai-automation-lab] vault not available, continuing without:", err);
  }

  // 3. HTTP server
  const port = Number(process.env.PORT ?? 4317);
  const server = await start(port);

  const shutdown = async (signal: string) => {
    console.log(`[ai-automation-lab] received ${signal}, shutting down…`);
    try {
      server.stop();
    } catch (err) {
      console.error("[ai-automation-lab] error during shutdown:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[ai-automation-lab] fatal:", err);
  process.exit(1);
});
