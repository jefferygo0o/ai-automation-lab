/**
 * Web Space Tools — give any agent the ability to create, update, publish,
 * and host sites on the lab's Web Space (analogous to Zo's zo.space, but
 * 100% self-contained: served by the lab backend itself, no external infra).
 *
 * Pages: store raw HTML (with optional inlined <style>/<script>).
 * APIs: store TypeScript source exporting `default async (c) => Response`.
 *
 * All operations are owner-scoped. The serving layer at /ws/<owner>/<path>
 * is auth-protected by the same bearer token used elsewhere in the lab.
 */
import { toolRegistry, type ToolContext } from "./registry.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { invalidateApiCache } from "../webspace/render.ts";
import { createSession } from "../security/auth.ts";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

const PORT = Number(process.env.PORT ?? 8787);

function liveUrl(ownerId: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  // The owner_id is an internal id, not a username. In this lab the public
  // path includes the owner id directly; the UI builds nicer labels.
  return `http://localhost:${PORT}/ws/${ownerId}${cleanPath}`;
}

function rowToJson(r: any) {
  return {
    id: r.id,
    path: r.path,
    type: r.type,
    public: !!r.is_public,
    code: r.code,
    liveUrl: liveUrl(r.owner_id, r.path),
    updatedAt: r.updated_at,
  };
}

toolRegistry.register({
  name: "manage_webspace",
  description:
    "Create, update, delete, list, read, and publish routes on the lab's Web Space " +
    "(isolated from Zo — served by the lab itself at /ws/<owner>/<path>). " +
    "Page routes store raw HTML; API routes store TypeScript exporting `default async (c) => Response`. " +
    "Use this to host agent-built sites, dashboards, forms, webhooks, or any other web content.",
  parameters: {
    action: {
      type: "string",
      description: "operation to perform",
      required: true,
      enum: ["list", "read", "create", "update", "delete", "publish"],
    },
    id: { type: "string", description: "route id — required for read, update, delete, publish", required: false },
    path: { type: "string", description: "URL path (e.g. '/', '/about', '/api/hello') — required for create", required: false },
    type: { type: "string", description: "'page' (raw HTML) or 'api' (TypeScript handler)", required: false, enum: ["page", "api"] },
    code: { type: "string", description: "HTML for page routes, TypeScript for api routes", required: false },
    isPublic: { type: "boolean", description: "set route publicly accessible — authenticated and anonymous users can view it", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      switch (args.action) {
        case "list": {
          const rows = await db.query(
            "SELECT id, owner_id, path, type, code, is_public, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
          ).all(userId) as any[];
          return text(
            `Your Web Space routes (${rows.length}):\n` +
              rows.map(rowToJson)
                .map((r) => `- [${r.type}] ${r.path}  (id: ${r.id})\n    live: ${r.liveUrl}`)
                .join("\n")
          );
        }
        case "read": {
          if (!args.id) return err("id required for read");
          const row = await db.query(
            "SELECT id, owner_id, path, type, code, is_public, updated_at FROM space_routes WHERE id = ? AND owner_id = ?"
          ).get(args.id, userId) as any;
          if (!row) return err(`route not found: ${args.id}`);
          return text(JSON.stringify(rowToJson(row), null, 2));
        }
        case "create": {
          if (!args.path) return err("path required for create");
          if (!args.type) return err("type required for create (page or api)");
          if (args.code === undefined) return err("code required for create");
          if (args.type !== "page" && args.type !== "api") return err("type must be 'page' or 'api'");
          const existing = await db.query(
            "SELECT id FROM space_routes WHERE owner_id = ? AND path = ?"
          ).get(userId, args.path);
          if (existing) return err(`route already exists at path: ${args.path}`);
          const id = `route_${nanoid()}`;
          const now = Date.now();
          await db.query(
            "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(id, userId, args.path, args.type, args.code, args.isPublic ? 1 : 0, now, now);
          return text(`Created ${args.type} route at ${args.path}${args.isPublic ? ' (public)' : ''}\nLive URL: ${liveUrl(userId, args.path)}\nid: ${id}`);
        }
        case "update": {
          if (!args.id) return err("id required for update");
          const existing = await db.query(
            "SELECT id FROM space_routes WHERE id = ? AND owner_id = ?"
          ).get(args.id, userId);
          if (!existing) return err(`route not found: ${args.id}`);
          const sets: string[] = [];
          const vals: any[] = [];
          if (args.path !== undefined) { sets.push("path = ?"); vals.push(args.path); }
          if (args.code !== undefined) { sets.push("code = ?"); vals.push(args.code); }
          if (args.type !== undefined) {
            if (args.type !== "page" && args.type !== "api") return err("type must be 'page' or 'api'");
            sets.push("type = ?"); vals.push(args.type);
          }
          if (args.isPublic !== undefined) { sets.push("is_public = ?"); vals.push(args.isPublic ? 1 : 0); }
          if (sets.length === 0) return err("nothing to update — provide path, code, type, or isPublic");
          sets.push("updated_at = ?"); vals.push(Date.now());
          vals.push(args.id, userId);
          await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
          invalidateApiCache(args.id);
          const row = await db.query("SELECT owner_id, path FROM space_routes WHERE id = ?").get(args.id) as any;
          return text(`Updated route ${args.id}\nLive URL: ${liveUrl(row.owner_id, row.path)}`);
        }
        case "delete": {
          if (!args.id) return err("id required for delete");
          invalidateApiCache(args.id);
          const result = await db.query(
            "DELETE FROM space_routes WHERE id = ? AND owner_id = ?"
          ).run(args.id, userId);
          if (!result.changes) return err(`route not found: ${args.id}`);
          return text(`Deleted route ${args.id}`);
        }
        case "publish": {
          if (!args.id) return err("id required for publish");
          const row = await db.query(
            "SELECT id, owner_id, path, type, is_public FROM space_routes WHERE id = ? AND owner_id = ?"
          ).get(args.id, userId) as any;
          if (!row) return err(`route not found: ${args.id}`);

          // Set is_public=1 so the route is accessible without auth.
          const now = Date.now();
          await db.query(
            "UPDATE space_routes SET is_public = 1, updated_at = ? WHERE id = ? AND owner_id = ?"
          ).run(now, args.id, userId);

          return text(
            `Published route ${row.id} at:\n${liveUrl(row.owner_id, row.path)}\n` +
            `This route is now publicly accessible (no auth required).`
          );
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_webspace failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "fetch_webspace_route",
  description:
    "Fetch the live content of one of your own Web Space routes. Useful for agents that " +
    "want to verify what an end-user would see, or to consume a /ws/api endpoint they own.",
  parameters: {
    id: { type: "string", description: "route id", required: true },
    method: { type: "string", description: "HTTP method (default GET)", required: false, enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const row = await db.query(
      "SELECT owner_id, path, type FROM space_routes WHERE id = ? AND owner_id = ?"
    ).get(args.id, userId) as any;
    if (!row) return err(`route not found: ${args.id}`);
    const url = liveUrl(row.owner_id, row.path);
    // Mint a fresh session for this one-off internal call.
    const session = createSession(userId);
    try {
      const res = await fetch(url, {
        method: args.method ?? "GET",
        headers: { authorization: `Bearer ${session.token}` },
      });
      const content = await res.text();
      return text(`HTTP ${res.status} ${res.statusText}\n\n${content.slice(0, 16_000)}`);
    } catch (e: any) {
      return err(`fetch failed: ${e?.message ?? String(e)}`);
    }
  },
});
