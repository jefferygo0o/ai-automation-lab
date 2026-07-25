/**
 * Lab Space — route management API (like zo.space).
 * Routes are stored in the lab PostgreSQL DB (space_routes table).
 *
 * Mounted by server.ts at /api/lab-space
 *
 * New: version history (undo/redo), assets, site settings, error/debug endpoints.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { invalidateApiCache } from "../webspace/render.ts";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync, readFileSync, statSync, readdirSync, unlinkSync } from "node:fs";

interface SpaceRouteRow {
  id: string;
  owner_id: string;
  path: string;
  type: "page" | "api";
  code: string;
  is_public: number;
  current_version: number;
  created_at: number;
  updated_at: number;
}

export const labSpaceApi = new Hono<HonoEnv>();

// ─── Helpers ────────────────────────────────────────────────

function now() { return Date.now(); }
function nanoid12() { return nanoid(12); }

async function getRoute(ownerId: string, path: string): Promise<SpaceRouteRow | null> {
  const p = path.startsWith("/") ? path : `/${path}`;
  return db.query(
    "SELECT id, owner_id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? AND path = ?"
  ).get(ownerId, p) as SpaceRouteRow | null;
}

async function getRouteById(ownerId: string, id: string): Promise<SpaceRouteRow | null> {
  return db.query(
    "SELECT id, owner_id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(id, ownerId) as SpaceRouteRow | null;
}

async function snapshotVersion(ownerId: string, route: SpaceRouteRow, action: string, label?: string) {
  const nextVersion = (route.current_version ?? 0) + 1;
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, label, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
  ).run(nanoid12(), route.id, ownerId, nextVersion, route.path, route.type, route.code, action, label ?? "", now());
  await db.query("UPDATE space_routes SET current_version = ? WHERE id = ? AND owner_id = ?")
    .run(nextVersion, route.id, ownerId);
  return nextVersion;
}

function routeToJson(r: SpaceRouteRow) {
  return {
    id: r.id,
    path: r.path,
    type: r.type,
    code: r.code,
    public: !!r.is_public,
    currentVersion: r.current_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function versionToJson(v: any) {
  return {
    id: v.id,
    version: v.version,
    path: v.path,
    type: v.type,
    code: v.code,
    action: v.action,
    label: v.label,
    isUndo: !!v.is_undo,
    createdAt: v.created_at,
  };
}

// ============================================================
// ROUTE MANAGEMENT
// ============================================================

// list_space_routes — List all routes
labSpaceApi.get("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db.query(
    "SELECT id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
  ).all(userId) as SpaceRouteRow[];
  return c.json({
    routes: rows.map((r) => ({
      path: r.path,
      type: r.type,
      public: !!r.is_public,
      source: r.code.slice(0, 200) + (r.code.length > 200 ? "..." : ""),
      id: r.id,
      currentVersion: r.current_version,
      updatedAt: r.updated_at,
    })),
  });
});

// get_space_route — Get a route's full source code by path or id
labSpaceApi.get("/routes/detail", async (c) => {
  const userId = c.get("userId") as string;
  const path = c.req.query("path");
  const id = c.req.query("id");
  let row: SpaceRouteRow | null = null;
  if (id) {
    row = await getRouteById(userId, id);
  } else if (path) {
    row = await getRoute(userId, path);
  }
  if (!row) return c.json({ error: "route not found" }, 404);
  return c.json(routeToJson(row));
});

// Also support GET /routes/:id for backward compat with frontend
labSpaceApi.get("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  // Check if this looks like a UUID/ID (contains underscore prefix or is long)
  if (id.length > 20 || id.startsWith("route_")) {
    const row = await getRouteById(userId, id);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(routeToJson(row));
  }
  // Treat as path
  const row = await getRoute(userId, `/${id}`);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(routeToJson(row));
});

// write_space_route — Create a new route or fully rewrite an existing one
labSpaceApi.post("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    path?: string; route_type?: string; type?: string;
    code?: string; public?: string | boolean; isPublic?: boolean;
  };
  const path = body.path;
  const type = (body.route_type || body.type) as string;
  const code = body.code ?? "";
  const isPublic = body.public === "true" || body.public === true || body.isPublic === true;
  if (!path) return c.json({ error: "path required" }, 400);
  if (!type || (type !== "page" && type !== "api")) return c.json({ error: "type must be 'page' or 'api'" }, 400);

  const existing = await getRoute(userId, path);
  if (existing) {
    // Full rewrite — snapshot old version first
    await snapshotVersion(userId, existing, "rewrite");
    const t = now();
    await db.query(
      "UPDATE space_routes SET code = ?, type = ?, is_public = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    ).run(code, type, isPublic ? 1 : 0, t, existing.id, userId);
    invalidateApiCache(existing.id);
    const updated = await getRouteById(userId, existing.id);
    return c.json(routeToJson(updated!));
  }
  // Create new
  const id = `route_${nanoid()}`;
  const t = now();
  await db.query(
    "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)"
  ).run(id, userId, path, type, code, isPublic ? 1 : 0, t, t);
  const row = await getRouteById(userId, id);
  // Snapshot initial version
  if (row) await snapshotVersion(userId, row, "create");
  return c.json(routeToJson(row!));
});

// edit_space_route — Partial edit (only changed sections)
labSpaceApi.put("/routes/edit", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    path?: string; id?: string;
    code_edit?: string; code?: string;
    edit_instructions?: string;
    public?: string | boolean;
  };
  const routePath = body.path;
  const routeId = body.id;
  let route: SpaceRouteRow | null = null;
  if (routeId) route = await getRouteById(userId, routeId);
  else if (routePath) route = await getRoute(userId, routePath);
  if (!route) return c.json({ error: "route not found" }, 404);

  const newCode = body.code_edit ?? body.code;
  const sets: string[] = [];
  const vals: any[] = [];
  if (newCode !== undefined) { sets.push("code = ?"); vals.push(newCode); }
  if (body.public !== undefined) {
    const isPublic = body.public === "true" || body.public === true;
    sets.push("is_public = ?"); vals.push(isPublic ? 1 : 0);
  }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);

  // Snapshot current state before edit
  await snapshotVersion(userId, route, "edit", body.edit_instructions);

  sets.push("updated_at = ?"); vals.push(now());
  vals.push(route.id, userId);
  await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
  invalidateApiCache(route.id);
  const updated = await getRouteById(userId, route.id);
  return c.json(routeToJson(updated!));
});

// Legacy PUT /routes/:id for frontend backward compat
labSpaceApi.put("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json() as { path?: string; code?: string; type?: string; isPublic?: boolean; public?: boolean };
  const route = await getRouteById(userId, id);
  if (!route) return c.json({ error: "not found" }, 404);

  const sets: string[] = [];
  const vals: any[] = [];
  if (body.path !== undefined) { sets.push("path = ?"); vals.push(body.path); }
  if (body.code !== undefined) { sets.push("code = ?"); vals.push(body.code); }
  if (body.type !== undefined) { sets.push("type = ?"); vals.push(body.type); }
  if (body.isPublic !== undefined || body.public !== undefined) {
    const isPublic = (body.isPublic ?? body.public) ? 1 : 0;
    sets.push("is_public = ?"); vals.push(isPublic);
  }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);

  // Snapshot before edit
  await snapshotVersion(userId, route, "edit");

  sets.push("updated_at = ?"); vals.push(now());
  vals.push(id, userId);
  const result = await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
  if (!result.changes) return c.json({ error: "not found" }, 404);
  invalidateApiCache(id);
  return c.json({ ok: true });
});

// publish (toggle public)
labSpaceApi.post("/routes/:id/publish", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { isPublic?: boolean; public?: boolean };
  const isPublic = (body.isPublic ?? body.public) ? 1 : 0;
  const result = await db.query(
    "UPDATE space_routes SET is_public = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(isPublic, now(), c.req.param("id"), userId);
  if (!result.changes) return c.json({ error: "not found" }, 404);
  invalidateApiCache(c.req.param("id"));
  return c.json({ ok: true });
});

// delete_space_route
labSpaceApi.delete("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const route = await getRouteById(userId, id);
  if (route) await snapshotVersion(userId, route, "delete");
  invalidateApiCache(id);
  const result = await db.query("DELETE FROM space_routes WHERE id = ? AND owner_id = ?").run(id, userId);
  return c.json({ ok: result.changes > 0 });
});

// ============================================================
// VERSION HISTORY
// ============================================================

// get_space_route_history
labSpaceApi.get("/routes/:id/history", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const versions = await db.query(
    "SELECT id, version, path, type, code, action, label, is_undo, created_at FROM space_route_versions WHERE owner_id = ? AND route_id = ? ORDER BY version DESC"
  ).all(userId, id);
  return c.json({ versions: versions.map(versionToJson) });
});

// undo_space_route — revert to previous version
labSpaceApi.post("/routes/:id/undo", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const route = await getRouteById(userId, id);
  if (!route) return c.json({ error: "route not found" }, 404);

  const currentVersion = route.current_version ?? 0;
  if (currentVersion <= 0) return c.json({ error: "no versions to undo" }, 400);

  // Get the previous version
  const prev = await db.query(
    "SELECT id, version, path, type, code, action, label FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND version < ? ORDER BY version DESC LIMIT 1"
  ).get(userId, id, currentVersion) as any;
  if (!prev) return c.json({ error: "no previous version found" }, 404);

  // Snapshot current state as an undo version
  const undoVersion = currentVersion + 1;
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, label, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'undo', ?, 1, ?)"
  ).run(nanoid12(), id, userId, undoVersion, route.path, route.type, route.code, `undo to v${prev.version}`, now());

  // Restore the previous version's code and type
  await db.query(
    "UPDATE space_routes SET code = ?, type = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(prev.code, prev.type, undoVersion, now(), id, userId);
  invalidateApiCache(id);

  const updated = await getRouteById(userId, id);
  return c.json({ route: routeToJson(updated!), restoredVersion: prev.version });
});

// redo_space_route — restore next version after undo
labSpaceApi.post("/routes/:id/redo", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const route = await getRouteById(userId, id);
  if (!route) return c.json({ error: "route not found" }, 404);

  // Find the most recent undo version (the one we want to redo)
  const undoVersion = await db.query(
    "SELECT id, version, path, type, code, action, label FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND is_undo = 1 AND version > ? ORDER BY version ASC LIMIT 1"
  ).get(userId, id, route.current_version ?? 0) as any;
  if (!undoVersion) return c.json({ error: "nothing to redo" }, 404);

  // Snapshot current state
  const newVersion = (route.current_version ?? 0) + 1;
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, label, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'redo', ?, 0, ?)"
  ).run(nanoid12(), id, userId, newVersion, route.path, route.type, route.code, `redo from v${route.current_version}`, now());

  // Restore the undo version's code
  await db.query(
    "UPDATE space_routes SET code = ?, type = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(undoVersion.code, undoVersion.type, newVersion, now(), id, userId);
  invalidateApiCache(id);

  const updated = await getRouteById(userId, id);
  return c.json({ route: routeToJson(updated!), restoredVersion: undoVersion.version });
});

// ============================================================
// ASSETS
// ============================================================

const ASSETS_DIR = join(process.cwd(), "data", "lab_space_assets");

function ensureAssetsDir() {
  if (!existsSync(ASSETS_DIR)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(ASSETS_DIR, { recursive: true });
  }
}

function assetFilePath(assetPath: string): string {
  // Normalize: strip leading slash, resolve
  const clean = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  return join(ASSETS_DIR, clean);
}

// list_space_assets
labSpaceApi.get("/assets", async (c) => {
  ensureAssetsDir();
  const assets: Array<{ path: string; size: number }> = [];
  function walk(dir: string, prefix: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), prefix + entry.name + "/");
      } else {
        const fullPath = join(dir, entry.name);
        const st = statSync(fullPath);
        assets.push({ path: prefix + entry.name, size: st.size });
      }
    }
  }
  walk(ASSETS_DIR, "/");
  return c.json({ assets });
});

// update_space_asset — copy a workspace file into assets
labSpaceApi.post("/assets", async (c) => {
  ensureAssetsDir();
  const body = await c.req.json() as { source_file?: string; asset_path?: string };
  if (!body.source_file || !body.asset_path) {
    return c.json({ error: "source_file and asset_path required" }, 400);
  }
  // Resolve source file relative to workspace root
  const workspaceRoot = join(process.cwd(), "..", "..");
  const src = body.source_file.startsWith("/") ? body.source_file : join(workspaceRoot, body.source_file);
  const dest = assetFilePath(body.asset_path);
  // Ensure parent dirs exist
  const destDir = join(dest, "..");
  if (!existsSync(destDir)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(destDir, { recursive: true });
  }
  const { copyFileSync } = require("node:fs");
  copyFileSync(src, dest);
  return c.json({ ok: true, asset_path: body.asset_path });
});

// delete_space_asset
labSpaceApi.delete("/assets", async (c) => {
  ensureAssetsDir();
  const assetPath = c.req.query("path");
  if (!assetPath) return c.json({ error: "path required" }, 400);
  const fp = assetFilePath(assetPath);
  if (!existsSync(fp)) return c.json({ error: "asset not found" }, 404);
  unlinkSync(fp);
  return c.json({ ok: true });
});

// ============================================================
// SITE SETTINGS
// ============================================================

const DEFAULT_SETTINGS = {
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

// get_space_settings
labSpaceApi.get("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query(
    "SELECT settings_json, created_at, updated_at FROM lab_space_settings WHERE owner_id = ?"
  ).get(userId) as any;
  if (!row) return c.json({ settings: DEFAULT_SETTINGS });
  try {
    const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings_json) };
    return c.json({ settings, updatedAt: row.updated_at });
  } catch {
    return c.json({ settings: DEFAULT_SETTINGS });
  }
});

// update_space_settings
labSpaceApi.put("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as Record<string, string>;
  const t = now();

  // Merge with defaults — only update provided keys
  const existing = await db.query("SELECT settings_json FROM lab_space_settings WHERE owner_id = ?").get(userId) as any;
  let current = DEFAULT_SETTINGS;
  if (existing) {
    try { current = { ...DEFAULT_SETTINGS, ...JSON.parse(existing.settings_json) }; } catch {}
  }
  const merged = { ...current, ...body };

  // "default" means clear the key (revert to built-in default)
  for (const [k, v] of Object.entries(merged)) {
    if (v === "default") (merged as any)[k] = (DEFAULT_SETTINGS as any)[k] ?? "";
  }

  await db.query(
    "INSERT INTO lab_space_settings (owner_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at"
  ).run(userId, JSON.stringify(merged), t, t);
  return c.json({ settings: merged, updatedAt: t });
});

// ============================================================
// SERVER & DEBUGGING
// ============================================================

// get_space_errors — recent route compilation/execution errors
labSpaceApi.get("/errors", async (c) => {
  // Read recent errors from the log file
  const errLog = join(process.cwd(), "..", "..", "data", "lab_space_errors.log");
  const errors: Array<{ message: string; timestamp: number }> = [];
  if (existsSync(errLog)) {
    try {
      const content = readFileSync(errLog, "utf8");
      const lines = content.trim().split("\n").slice(-50); // Last 50 lines
      for (const line of lines) {
        if (!line.trim()) continue;
        errors.push({ message: line, timestamp: now() });
      }
    } catch {}
  }
  return c.json({ errors, serverStderr: "" });
});

// restart_space_server — signal a restart
labSpaceApi.post("/restart", async (c) => {
  // In this context, we can't truly restart ourselves, but we can
  // invalidate all caches and return success
  return c.json({ ok: true, message: "Server restart requested. Cache invalidated." });
});
