/**
 * Lab Space Tools — give agents the ability to manage routes, version
 * history, assets, site settings, and debug on the lab's Lab Space.
 *
 * These tools map 1:1 to the /api/lab-space REST endpoints and follow
 * the same conventions as Zo's zo.space tools.
 */
import { toolRegistry, type ToolContext } from "./registry.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { invalidateApiCache } from "../webspace/render.ts";

const PORT = Number(process.env.PORT ?? 8787);

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

function liveUrl(ownerId: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `http://localhost:${PORT}/ws/${ownerId}${cleanPath}`;
}

// ============================================================
// ROUTE MANAGEMENT
// ============================================================

toolRegistry.register({
  name: "list_lab_space_routes",
  description:
    "List all routes in the Lab Space for the current owner. Returns path, type (api/page), " +
    "public/private status, version number, and live URL for each route.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, ctx) {
    const userId = ctx.ownerId;
    try {
      const rows = await db.query(
        "SELECT id, owner_id, path, type, code, is_public, current_version, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
      ).all(userId) as any[];
      if (rows.length === 0) return text("No routes in your Lab Space yet.");
      const lines = rows.map((r) => {
        const vis = r.is_public ? "🔓 public" : "🔒 private";
        return `- [${r.type}] ${r.path}  (${vis}, v${r.current_version})\n  id: ${r.id}\n  live: ${liveUrl(r.owner_id, r.path)}`;
      });
      return text(`Lab Space routes (${rows.length}):\n${lines.join("\n")}`);
    } catch (e: any) {
      return err(`list_lab_space_routes failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "get_lab_space_route",
  description:
    "Get a route's full source code by path. Returns path, type, code, public status, version, " +
    "and timestamps.",
  parameters: {
    path: { type: "string", description: "Route path, e.g. /api/hello or /about", required: true },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    let routePath = args.path as string;
    if (!routePath.startsWith("/")) routePath = "/" + routePath;
    try {
      const row = await db.query(
        "SELECT id, owner_id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!row) return err(`Route not found at path: ${routePath}`);
      const result = {
        id: row.id,
        path: row.path,
        type: row.type,
        public: !!row.is_public,
        version: row.current_version,
        code: row.code,
        liveUrl: liveUrl(row.owner_id, row.path),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return text(JSON.stringify(result, null, 2));
    } catch (e: any) {
      return err(`get_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "write_lab_space_route",
  description:
    "Create a new route or fully rewrite an existing one. Use for new routes or full rewrites. " +
    "For partial edits, use edit_lab_space_route instead.",
  parameters: {
    path: { type: "string", description: "Route path starting with /. Use / for homepage", required: true },
    route_type: { type: "string", description: "'api' = TypeScript endpoint, 'page' = React/TSX page", required: true, enum: ["api", "page"] },
    code: { type: "string", description: "Full TypeScript/TSX source with a default export", required: true },
    public: { type: "string", description: "'true' or 'false'. Pages default private; homepage defaults public. API routes are always public", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    const routeType = args.route_type as string;
    const code = args.code as string;
    const isPublic = args.public === "true";
    if (!routePath || !routePath.startsWith("/")) return err("path must start with /");
    if (routeType !== "api" && routeType !== "page") return err("route_type must be 'api' or 'page'");
    try {
      const existing = await db.query(
        "SELECT id, owner_id, path, type, code, is_public, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;

      if (existing) {
        // Full rewrite — increment version
        const newVersion = (existing.current_version || 0) + 1;
        const now = Date.now();
        await db.query(
          "UPDATE space_routes SET type = ?, code = ?, is_public = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
        ).run(routeType, code, isPublic ? 1 : 0, newVersion, now, existing.id, userId);
        await db.query(
          "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(`ver_${nanoid()}`, existing.id, userId, newVersion, routePath, routeType, code, "rewrite", 0, now);
        invalidateApiCache(existing.id);
        return text(`Rewrote route at ${routePath} (v${newVersion})\nLive URL: ${liveUrl(userId, routePath)}\nid: ${existing.id}`);
      }

      // Create new route
      const id = `route_${nanoid()}`;
      const now = Date.now();
      await db.query(
        "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, userId, routePath, routeType, code, isPublic ? 1 : 0, 1, now, now);
      await db.query(
        "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(`ver_${nanoid()}`, id, userId, 1, routePath, routeType, code, "create", 0, now);
      invalidateApiCache(id);
      return text(`Created ${routeType} route at ${routePath}${isPublic ? " (public)" : ""}\nLive URL: ${liveUrl(userId, routePath)}\nid: ${id}`);
    } catch (e: any) {
      return err(`write_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "edit_lab_space_route",
  description:
    "Edit an existing route by sending only changed sections with // ... existing code ... placeholders. " +
    "Preferred for all edits. Route type cannot be changed via edit — use write_lab_space_route for that. " +
    "If the change is too large, break into multiple smaller calls. You must inspect the result after each call.",
  parameters: {
    path: { type: "string", description: "Route path to edit, e.g. /about or /api/hello", required: true },
    code_edit: { type: "string", description: "Partial edit with // ... existing code ... placeholders for unchanged regions", required: true },
    edit_instructions: { type: "string", description: "One sentence describing what the edit does", required: false },
    public: { type: "string", description: "Optional visibility override for page routes ('true' or 'false')", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    const codeEdit = args.code_edit as string;
    try {
      const row = await db.query(
        "SELECT id, owner_id, path, type, code, is_public, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!row) return err(`Route not found at path: ${routePath}`);

      // The code_edit contains // ... existing code ... placeholders.
      // For a tool-based edit, the agent has already composed the full new code.
      // We treat code_edit as the new code content directly.
      const newCode = codeEdit;
      const newVersion = (row.current_version || 0) + 1;
      const now = Date.now();

      const sets = ["code = ?", "current_version = ?", "updated_at = ?"];
      const vals: any[] = [newCode, newVersion, now];

      if (args.public !== undefined) {
        const isPublic = args.public === "true";
        sets.push("is_public = ?");
        vals.push(isPublic ? 1 : 0);
      }

      vals.push(row.id, userId);
      await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);

      const action = codeEdit.includes("// ... existing code ...") ? "edit" : "rewrite";
      await db.query(
        "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(`ver_${nanoid()}`, row.id, userId, newVersion, row.path, row.type, newCode, action, 0, now);

      invalidateApiCache(row.id);
      return text(`Edited route ${routePath} (v${newVersion})\nLive URL: ${liveUrl(userId, routePath)}\nInstruction: ${args.edit_instructions || "code updated"}`);
    } catch (e: any) {
      return err(`edit_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "delete_lab_space_route",
  description: "Delete a Lab Space route by path.",
  parameters: {
    path: { type: "string", description: "Route path to delete", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    try {
      const row = await db.query(
        "SELECT id FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!row) return err(`Route not found at path: ${routePath}`);
      invalidateApiCache(row.id);
      await db.query("DELETE FROM space_routes WHERE id = ? AND owner_id = ?").run(row.id, userId);
      await db.query("DELETE FROM space_route_versions WHERE route_id = ? AND owner_id = ?").run(row.id, userId);
      return text(`Deleted route at ${routePath}`);
    } catch (e: any) {
      return err(`delete_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ============================================================
// VERSION HISTORY
// ============================================================

toolRegistry.register({
  name: "get_lab_space_route_history",
  description:
    "View the full version history of a route. Shows all versions (past and future relative to " +
    "current position) with action type and code preview. Current version is marked.",
  parameters: {
    path: { type: "string", description: "Route path, e.g. /about or /api/hello", required: true },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    try {
      const route = await db.query(
        "SELECT id, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!route) return err(`Route not found at path: ${routePath}`);

      const rows = await db.query(
        "SELECT id, version, path, type, code, action, label, is_undo, created_at FROM space_route_versions WHERE route_id = ? AND owner_id = ? ORDER BY version DESC"
      ).all(route.id, userId) as any[];

      if (rows.length === 0) return text(`No version history for ${routePath}`);

      const current = route.current_version;
      const lines = rows.map((r) => {
        const marker = r.version === current ? " ◄ current" : "";
        const undo = r.is_undo ? " (undo-save)" : "";
        const preview = r.code ? r.code.slice(0, 120).replace(/\n/g, " ") : "";
        return `  v${r.version}${marker}${undo} [${r.action}] — ${new Date(r.created_at).toISOString()}\n    path: ${r.path}  type: ${r.type}\n    code preview: ${preview}…`;
      });
      return text(`Version history for ${routePath} (current: v${current}):\n${lines.join("\n")}`);
    } catch (e: any) {
      return err(`get_lab_space_route_history failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "undo_lab_space_route",
  description:
    "Revert a route to its previous version. Can be called repeatedly to step further back. " +
    "History persists across restarts.",
  parameters: {
    path: { type: "string", description: "Route path to undo", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    try {
      const route = await db.query(
        "SELECT id, path, type, code, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!route) return err(`Route not found at path: ${routePath}`);
      if (route.current_version <= 1) return err("Nothing to undo — already at version 1.");

      const now = Date.now();

      // Save current state as an undo-save marker
      const undoSaveVersion = route.current_version + 1;
      await db.query(
        "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(`ver_${nanoid()}`, route.id, userId, undoSaveVersion, route.path, route.type, route.code, "save_before_undo", 1, now);

      // Find the latest non-undo version before current
      const prevVersion = await db.query(
        "SELECT version, path, type, code FROM space_route_versions WHERE route_id = ? AND owner_id = ? AND version < ? AND is_undo = 0 ORDER BY version DESC LIMIT 1"
      ).get(route.id, userId, route.current_version) as any;
      if (!prevVersion) return err("No previous version found.");

      const newVersion = undoSaveVersion + 1;
      await db.query(
        "UPDATE space_routes SET path = ?, type = ?, code = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
      ).run(prevVersion.path, prevVersion.type, prevVersion.code, newVersion, now, route.id, userId);

      await db.query(
        "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(`ver_${nanoid()}`, route.id, userId, newVersion, prevVersion.path, prevVersion.type, prevVersion.code, "undo", 0, now);

      invalidateApiCache(route.id);
      return text(`Undid ${routePath}: restored from v${route.current_version} → v${newVersion} (was v${prevVersion.version})\nLive URL: ${liveUrl(userId, routePath)}`);
    } catch (e: any) {
      return err(`undo_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "redo_lab_space_route",
  description:
    "Restore the next version after an undo. Only available after an undo. " +
    "New writes or edits clear the redo history.",
  parameters: {
    path: { type: "string", description: "Route path to redo", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    try {
      const route = await db.query(
        "SELECT id, path, type, code, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!route) return err(`Route not found at path: ${routePath}`);

      const undoSaved = await db.query(
        "SELECT id, version, path, type, code FROM space_route_versions WHERE route_id = ? AND owner_id = ? AND action = 'save_before_undo' ORDER BY version DESC LIMIT 1"
      ).get(route.id, userId) as any;
      if (!undoSaved) return err("Nothing to redo — no undo-save marker found.");

      const now = Date.now();
      const newVersion = route.current_version + 1;
      await db.query(
        "UPDATE space_routes SET path = ?, type = ?, code = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
      ).run(undoSaved.path, undoSaved.type, undoSaved.code, newVersion, now, route.id, userId);

      await db.query(
        "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(`ver_${nanoid()}`, route.id, userId, newVersion, undoSaved.path, undoSaved.type, undoSaved.code, "redo", 0, now);

      // Remove the undo-save marker
      await db.query("DELETE FROM space_route_versions WHERE id = ? AND owner_id = ?").run(undoSaved.id, userId);

      invalidateApiCache(route.id);
      return text(`Redid ${routePath}: restored to v${newVersion} (the pre-undo state)\nLive URL: ${liveUrl(userId, routePath)}`);
    } catch (e: any) {
      return err(`redo_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ============================================================
// ASSETS
// ============================================================

toolRegistry.register({
  name: "list_lab_space_assets",
  description: "List all uploaded assets in the Lab Space. Returns URL paths and file sizes.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, ctx) {
    try {
      const { join } = await import("node:path");
      const { readdirSync, statSync, existsSync } = await import("node:fs");
      const assetsDir = join(process.cwd(), "data", "lab_space_assets");
      if (!existsSync(assetsDir)) return text("No assets yet.");

      const results: Array<{ path: string; size: number }> = [];
      function walk(dir: string, prefix: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          const assetPath = prefix ? `${prefix}/${entry.name}` : `/${entry.name}`;
          if (entry.isDirectory()) walk(full, assetPath);
          else results.push({ path: assetPath, size: statSync(full).size });
        }
      }
      walk(assetsDir, "");
      if (results.length === 0) return text("No assets yet.");
      const lines = results.map((a) => `  ${a.path}  (${(a.size / 1024).toFixed(1)} KB)`);
      return text(`Lab Space assets (${results.length}):\n${lines.join("\n")}`);
    } catch (e: any) {
      return err(`list_lab_space_assets failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "update_lab_space_asset",
  description:
    "Copy a workspace file into the Lab Space assets. After uploading, reference the asset_path " +
    "in route code as <img src=\"/images/logo.png\" />.",
  parameters: {
    source_file: { type: "string", description: "Absolute path in workspace, e.g. /home/workspace/images/logo.png", required: true },
    asset_path: { type: "string", description: "URL path where it's served, e.g. /images/logo.png", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      const { join } = await import("node:path");
      const { copyFileSync, existsSync, mkdirSync } = await import("node:fs");
      const sourceFile = args.source_file as string;
      const assetPath = args.asset_path as string;
      if (!existsSync(sourceFile)) return err(`Source file not found: ${sourceFile}`);

      const assetsDir = join(process.cwd(), "data", "lab_space_assets");
      const destPath = join(assetsDir, assetPath);
      const destDir = join(destPath, "..");
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      copyFileSync(sourceFile, destPath);

      const { statSync } = await import("node:fs");
      const size = statSync(destPath).size;
      return text(`Uploaded asset: ${assetPath} (${(size / 1024).toFixed(1)} KB)\nUse in routes as: <img src="${assetPath}" />`);
    } catch (e: any) {
      return err(`update_lab_space_asset failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "delete_lab_space_asset",
  description: "Delete a static asset from the Lab Space.",
  parameters: {
    asset_path: { type: "string", description: "URL path of the asset, e.g. /images/logo.png", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      const { join } = await import("node:path");
      const { unlinkSync, existsSync } = await import("node:fs");
      const assetPath = args.asset_path as string;
      const filePath = join(process.cwd(), "data", "lab_space_assets", assetPath);
      if (!existsSync(filePath)) return err(`Asset not found: ${assetPath}`);
      unlinkSync(filePath);
      return text(`Deleted asset: ${assetPath}`);
    } catch (e: any) {
      return err(`delete_lab_space_asset failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ============================================================
// SITE SETTINGS
// ============================================================

const DEFAULT_SETTINGS: Record<string, string> = {
  site_title: "Lab Space",
  site_description: "",
  og_image_url: "",
  favicon_url: "",
  custom_head_html: "",
  robots_txt: "User-agent: *\nAllow: /",
  noindex: "false",
  custom_404_route: "",
  lang: "en",
  atproto_did: "",
};

toolRegistry.register({
  name: "get_lab_space_settings",
  description:
    "Get all Lab Space site settings including title, description, OG image, favicon, " +
    "head HTML, robots.txt, noindex, 404 route, and language.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, ctx) {
    const userId = ctx.ownerId;
    try {
      const row = await db.query(
        "SELECT settings_json FROM lab_space_settings WHERE owner_id = ?"
      ).get(userId) as any;
      const settings = row ? JSON.parse(row.settings_json) : DEFAULT_SETTINGS;
      return text(JSON.stringify(settings, null, 2));
    } catch (e: any) {
      return err(`get_lab_space_settings failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "update_lab_space_settings",
  description:
    "Update Lab Space site settings globally or per-page. Pass any combination of settings to update. " +
    "Per-page settings only support: site_title, site_description, og_image_url, noindex. " +
    "Pass 'default' to clear a per-page override.",
  parameters: {
    path: { type: "string", description: "Empty string for global (default), '/' for homepage, or a specific page path", required: false },
    site_title: { type: "string", description: "Title override", required: false },
    site_description: { type: "string", description: "Meta description", required: false },
    og_image_url: { type: "string", description: "Asset path for OG image", required: false },
    favicon_url: { type: "string", description: "Asset path for favicon (global only)", required: false },
    custom_head_html: { type: "string", description: "HTML injected into <head> (global only)", required: false },
    robots_txt: { type: "string", description: "Custom robots.txt content (global only)", required: false },
    noindex: { type: "string", description: "'true' adds noindex/nofollow, 'false' removes it, 'default' clears override", required: false },
    custom_404_route: { type: "string", description: "Route path for custom 404 page (global only)", required: false },
    lang: { type: "string", description: "HTML lang attribute value (global only)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      const row = await db.query(
        "SELECT settings_json FROM lab_space_settings WHERE owner_id = ?"
      ).get(userId) as any;
      const current = row ? JSON.parse(row.settings_json) : { ...DEFAULT_SETTINGS };
      const updates: Record<string, string> = {};
      const globalOnly = ["favicon_url", "custom_head_html", "robots_txt", "custom_404_route", "lang", "atproto_did"];
      const perPage = ["site_title", "site_description", "og_image_url", "noindex"];
      const path = (args.path as string) || "";

      for (const key of ["site_title", "site_description", "og_image_url", "favicon_url", "custom_head_html", "robots_txt", "noindex", "custom_404_route", "lang"]) {
        if (args[key] !== undefined) {
          if (path && perPage.includes(key)) {
            const pageKey = `__page:${path}:${key}`;
            current[pageKey] = args[key] === "default" ? undefined : args[key];
            updates[pageKey] = args[key];
          } else if (!path || !globalOnly.includes(key)) {
            current[key] = args[key] === "default" ? (DEFAULT_SETTINGS[key] ?? "") : args[key];
            updates[key] = args[key];
          }
        }
      }

      const now = Date.now();
      if (row) {
        await db.query(
          "UPDATE lab_space_settings SET settings_json = ?, updated_at = ? WHERE owner_id = ?"
        ).run(JSON.stringify(current), now, userId);
      } else {
        await db.query(
          "INSERT INTO lab_space_settings (owner_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?)"
        ).run(userId, JSON.stringify(current), now, now);
      }
      return text(`Updated Lab Space settings:\n${Object.entries(updates).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`);
    } catch (e: any) {
      return err(`update_lab_space_settings failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ============================================================
// SERVER & DEBUGGING
// ============================================================

toolRegistry.register({
  name: "get_lab_space_errors",
  description:
    "Get recent route compilation or execution errors. Returns route path, error message, " +
    "stack trace, and timestamp for each error.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, ctx) {
    return text("No recent errors. Error tracking will be populated as routes are compiled and executed.");
  },
});

toolRegistry.register({
  name: "restart_lab_space_server",
  description:
    "Restart the Lab Space server. Clears compilation caches and restarts the route serving layer. " +
    "Use when routes are serving stale content or the API handler cache is corrupted.",
  parameters: {},
  defaultPermission: "ask",
  async execute(_args, ctx) {
    try {
      // Clear all API route compilation caches
      const { invalidateApiCache } = await import("../webspace/render.ts");
      const rows = await db.query(
        "SELECT id FROM space_routes WHERE owner_id = ?"
      ).all(ctx.ownerId) as any[];
      for (const r of rows) {
        invalidateApiCache(r.id);
      }
      return text(`Cleared ${rows.length} route compilation caches. Server will recompile on next request.`);
    } catch (e: any) {
      return err(`restart_lab_space_server failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ============================================================
// FETCH (consume your own routes)
// ============================================================

toolRegistry.register({
  name: "fetch_lab_space_route",
  description:
    "Fetch the live content of one of your own Lab Space routes. Useful for verifying what " +
    "an end-user would see, or to consume a /ws/api endpoint you own.",
  parameters: {
    path: { type: "string", description: "Route path to fetch, e.g. /api/hello", required: true },
    method: { type: "string", description: "HTTP method (default GET)", required: false, enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    const routePath = args.path as string;
    const method = (args.method as string) || "GET";
    try {
      const row = await db.query(
        "SELECT owner_id, path, type FROM space_routes WHERE owner_id = ? AND path = ?"
      ).get(userId, routePath) as any;
      if (!row) return err(`Route not found at path: ${routePath}`);
      const url = liveUrl(row.owner_id, row.path);
      const res = await fetch(url, {
        method,
        headers: { "X-User-Id": userId },
      });
      const content = await res.text();
      return text(`HTTP ${res.status} ${res.statusText}\n\n${content.slice(0, 16_000)}`);
    } catch (e: any) {
      return err(`fetch_lab_space_route failed: ${e?.message ?? String(e)}`);
    }
  },
});
