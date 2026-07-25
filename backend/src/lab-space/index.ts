/**
 * Lab Space — route management, version history, assets, settings, debugging.
 *
 * Routes are stored in the lab PostgreSQL DB (space_routes table).
 * Version history in space_route_versions. Assets in workspace.
 * Site settings in lab_space_settings.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { invalidateApiCache } from "../webspace/render.ts";
import { join } from "node:path";
import { readdirSync, statSync, readFileSync, existsSync, mkdirSync } from "node:fs";

export const labSpaceApi = new Hono<HonoEnv>();

// ============================================================
// ROUTE MANAGEMENT
// ============================================================

// GET /routes — list all routes for the owner
labSpaceApi.get("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db.query(
    "SELECT id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
  ).all(userId) as Array<{
    id: string; path: string; type: string; code: string;
    is_public: number; current_version: number;
    created_at: number; updated_at: number;
  }>;
  return c.json({
    routes: rows.map((r) => ({
      id: r.id,
      path: r.path,
      type: r.type,
      code: r.code,
      public: !!r.is_public,
      version: r.current_version,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// GET /routes/:id — get a route by ID
labSpaceApi.get("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query(
    "SELECT id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(c.req.param("id"), userId) as any;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({
    id: row.id, path: row.path, type: row.type,
    code: row.code, public: !!row.is_public,
    version: row.current_version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  });
});

// GET /by-path/* — get a route by path (for path-based tools)
labSpaceApi.get("/by-path/*", async (c) => {
  const userId = c.get("userId") as string;
  let routePath = "/" + (c.req.param("0") || "");
  if (routePath.length > 1 && routePath.endsWith("/")) routePath = routePath.slice(0, -1);
  const row = await db.query(
    "SELECT id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? AND path = ?"
  ).get(userId, routePath) as any;
  if (!row) return c.json({ error: "route not found" }, 404);
  return c.json({
    id: row.id, path: row.path, type: row.type,
    code: row.code, public: !!row.is_public,
    version: row.current_version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  });
});

// POST /routes — create a new route
labSpaceApi.post("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    path?: string; type?: string; code?: string; isPublic?: boolean;
    route_type?: string; public?: string;
  };
  const path = body.path;
  const type = body.type ?? body.route_type;
  const code = body.code ?? "";
  const isPublic = body.isPublic ?? (body.public === "true");
  if (!path) return c.json({ error: "path required" }, 400);
  if (!type) return c.json({ error: "type required (page or api)" }, 400);
  if (type !== "page" && type !== "api") return c.json({ error: "type must be 'page' or 'api'" }, 400);
  const existing = await db.query(
    "SELECT id FROM space_routes WHERE owner_id = ? AND path = ?"
  ).get(userId, path);
  if (existing) return c.json({ error: `route already exists at path: ${path}` }, 400);
  const id = `route_${nanoid()}`;
  const now = Date.now();
  await db.query(
    "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, path, type, code, isPublic ? 1 : 0, 1, now, now);
  // Save initial version
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`ver_${nanoid()}`, id, userId, 1, path, type, code, "create", 0, now);
  invalidateApiCache(id);
  return c.json({
    id, path, type, code, public: !!isPublic,
    version: 1, createdAt: now, updatedAt: now,
  });
});

// PUT /routes/:id — update a route (full or partial)
labSpaceApi.put("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    path?: string; code?: string; type?: string; isPublic?: boolean;
    public?: string; edit_instructions?: string;
  };
  const routeId = c.req.param("id");
  const existing = await db.query(
    "SELECT id, path, type, code, is_public, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(routeId, userId) as any;
  if (!existing) return c.json({ error: "route not found" }, 404);

  const sets: string[] = [];
  const vals: any[] = [];
  if (body.path !== undefined) { sets.push("path = ?"); vals.push(body.path); }
  if (body.code !== undefined) { sets.push("code = ?"); vals.push(body.code); }
  if (body.type !== undefined) {
    if (body.type !== "page" && body.type !== "api") return c.json({ error: "type must be 'page' or 'api'" }, 400);
    sets.push("type = ?"); vals.push(body.type);
  }
  const isPublic = body.isPublic ?? (body.public !== undefined ? body.public === "true" : undefined);
  if (isPublic !== undefined) { sets.push("is_public = ?"); vals.push(isPublic ? 1 : 0); }

  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);

  // Increment version
  const newVersion = (existing.current_version || 0) + 1;
  sets.push("current_version = ?"); vals.push(newVersion);
  sets.push("updated_at = ?"); vals.push(Date.now());
  vals.push(routeId, userId);

  await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);

  // Save version snapshot
  const now = Date.now();
  const newPath = body.path ?? existing.path;
  const newType = body.type ?? existing.type;
  const newCode = body.code ?? existing.code;
  const action = body.code !== undefined && body.path === undefined && body.type === undefined
    ? "edit" : "rewrite";
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`ver_${nanoid()}`, routeId, userId, newVersion, newPath, newType, newCode, action, 0, now);

  invalidateApiCache(routeId);
  return c.json({ ok: true, version: newVersion });
});

// POST /routes/:id/publish — toggle public/private
labSpaceApi.post("/routes/:id/publish", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { isPublic?: boolean; public?: string };
  const isPublic = body.isPublic ?? (body.public === "true");
  const result = await db.query(
    "UPDATE space_routes SET is_public = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(isPublic ? 1 : 0, Date.now(), c.req.param("id"), userId);
  if (!result.changes) return c.json({ error: "not found" }, 404);
  invalidateApiCache(c.req.param("id"));
  return c.json({ ok: true });
});

// DELETE /routes/:id — delete a route
labSpaceApi.delete("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  invalidateApiCache(c.req.param("id"));
  const result = await db.query(
    "DELETE FROM space_routes WHERE id = ? AND owner_id = ?"
  ).run(c.req.param("id"), userId);
  // Clean up versions
  await db.query("DELETE FROM space_route_versions WHERE route_id = ? AND owner_id = ?")
    .run(c.req.param("id"), userId);
  return c.json({ ok: result.changes > 0 });
});

// DELETE /by-path/* — delete a route by path
labSpaceApi.delete("/by-path/*", async (c) => {
  const userId = c.get("userId") as string;
  let routePath = "/" + (c.req.param("0") || "");
  if (routePath.length > 1 && routePath.endsWith("/")) routePath = routePath.slice(0, -1);
  const row = await db.query("SELECT id FROM space_routes WHERE owner_id = ? AND path = ?")
    .get(userId, routePath) as any;
  if (!row) return c.json({ error: "route not found" }, 404);
  invalidateApiCache(row.id);
  await db.query("DELETE FROM space_routes WHERE id = ? AND owner_id = ?").run(row.id, userId);
  await db.query("DELETE FROM space_route_versions WHERE route_id = ? AND owner_id = ?").run(row.id, userId);
  return c.json({ ok: true });
});

// ============================================================
// VERSION HISTORY
// ============================================================

// GET /routes/:id/versions — get version history for a route
labSpaceApi.get("/routes/:id/versions", async (c) => {
  const userId = c.get("userId") as string;
  const routeId = c.req.param("id");
  const rows = await db.query(
    "SELECT id, version, path, type, code, action, label, is_undo, created_at FROM space_route_versions WHERE route_id = ? AND owner_id = ? ORDER BY version DESC"
  ).all(routeId, userId) as Array<{
    id: string; version: number; path: string; type: string; code: string;
    action: string; label: string; is_undo: number; created_at: number;
  }>;
  // Find current version
  const route = await db.query("SELECT current_version FROM space_routes WHERE id = ? AND owner_id = ?")
    .get(routeId, userId) as any;
  return c.json({
    versions: rows.map((r) => ({
      id: r.id,
      version: r.version,
      path: r.path,
      type: r.type,
      code: r.code,
      action: r.action,
      label: r.label,
      isUndo: !!r.is_undo,
      createdAt: r.created_at,
    })),
    currentVersion: route?.current_version ?? 0,
  });
});

// POST /routes/:id/undo — undo the last change
labSpaceApi.post("/routes/:id/undo", async (c) => {
  const userId = c.get("userId") as string;
  const routeId = c.req.param("id");
  const route = await db.query(
    "SELECT id, path, type, code, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(routeId, userId) as any;
  if (!route) return c.json({ error: "route not found" }, 404);
  if (route.current_version <= 1) return c.json({ error: "nothing to undo" }, 400);

  // Save current state as an undo version
  const now = Date.now();
  const undoVersion = route.current_version + 1;
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`ver_${nanoid()}`, routeId, userId, undoVersion, route.path, route.type, route.code, "save_before_undo", 1, now);

  // Find the previous version
  const prevVersion = await db.query(
    "SELECT id, version, path, type, code FROM space_route_versions WHERE route_id = ? AND owner_id = ? AND version < ? AND is_undo = 0 ORDER BY version DESC LIMIT 1"
  ).get(routeId, userId, route.current_version) as any;
  if (!prevVersion) return c.json({ error: "no previous version found" }, 400);

  // Restore the previous version
  const newVersion = undoVersion + 1;
  await db.query(
    "UPDATE space_routes SET path = ?, type = ?, code = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(prevVersion.path, prevVersion.type, prevVersion.code, newVersion, now, routeId, userId);

  // Record the undo action
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`ver_${nanoid()}`, routeId, userId, newVersion, prevVersion.path, prevVersion.type, prevVersion.code, "undo", 0, now);

  invalidateApiCache(routeId);
  return c.json({ ok: true, version: newVersion, restored: prevVersion.version });
});

// POST /routes/:id/redo — redo after an undo
labSpaceApi.post("/routes/:id/redo", async (c) => {
  const userId = c.get("userId") as string;
  const routeId = c.req.param("id");
  const route = await db.query(
    "SELECT id, path, type, code, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(routeId, userId) as any;
  if (!route) return c.json({ error: "route not found" }, 404);

  // Find the most recent undo's saved state
  const undoSaved = await db.query(
    "SELECT id, version, path, type, code FROM space_route_versions WHERE route_id = ? AND owner_id = ? AND action = 'save_before_undo' ORDER BY version DESC LIMIT 1"
  ).get(routeId, userId) as any;
  if (!undoSaved) return c.json({ error: "nothing to redo" }, 400);

  const now = Date.now();
  const newVersion = route.current_version + 1;
  await db.query(
    "UPDATE space_routes SET path = ?, type = ?, code = ?, current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(undoSaved.path, undoSaved.type, undoSaved.code, newVersion, now, routeId, userId);

  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`ver_${nanoid()}`, routeId, userId, newVersion, undoSaved.path, undoSaved.type, undoSaved.code, "redo", 0, now);

  // Remove the undo marker
  await db.query(
    "DELETE FROM space_route_versions WHERE id = ? AND owner_id = ?"
  ).run(undoSaved.id, userId);

  invalidateApiCache(routeId);
  return c.json({ ok: true, version: newVersion });
});

// ============================================================
// ASSETS
// ============================================================

const ASSETS_DIR = join(process.cwd(), "data", "lab_space_assets");

function ensureAssetsDir() {
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
}

function listAssetsRecursive(dir: string, prefix: string): Array<{ path: string; size: number }> {
  const results: Array<{ path: string; size: number }> = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const assetPath = prefix ? `${prefix}/${entry.name}` : `/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...listAssetsRecursive(fullPath, assetPath));
    } else {
      const stat = statSync(fullPath);
      results.push({ path: assetPath, size: stat.size });
    }
  }
  return results;
}

// GET /assets — list all assets
labSpaceApi.get("/assets", async (c) => {
  ensureAssetsDir();
  const assets = listAssetsRecursive(ASSETS_DIR, "");
  return c.json({ assets });
});

// POST /assets — upload an asset (multipart or JSON with base64)
labSpaceApi.post("/assets", async (c) => {
  ensureAssetsDir();
  const contentType = c.req.header("content-type") || "";
  let assetPath: string;
  let data: Buffer;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file") as File;
    assetPath = (form.get("path") as string) || `/${file.name}`;
    data = Buffer.from(await file.arrayBuffer());
  } else {
    const body = await c.req.json() as { path: string; content: string; encoding?: string };
    assetPath = body.path;
    if (!assetPath) return c.json({ error: "path required" }, 400);
    data = body.encoding === "base64"
      ? Buffer.from(body.content, "base64")
      : Buffer.from(body.content, "utf-8");
  }

  if (!assetPath.startsWith("/")) assetPath = "/" + assetPath;
  const filePath = join(ASSETS_DIR, assetPath);
  const dir = join(filePath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(filePath, data);
  return c.json({ ok: true, path: assetPath, size: data.length });
});

// DELETE /assets/* — delete an asset
labSpaceApi.delete("/assets/*", async (c) => {
  ensureAssetsDir();
  const assetPath = "/" + (c.req.param("0") || "");
  const filePath = join(ASSETS_DIR, assetPath);
  if (!existsSync(filePath)) return c.json({ error: "asset not found" }, 404);
  const { unlinkSync } = await import("node:fs");
  unlinkSync(filePath);
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
};

// GET /settings — get site settings
labSpaceApi.get("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query(
    "SELECT settings_json FROM lab_space_settings WHERE owner_id = ?"
  ).get(userId) as any;
  const settings = row ? JSON.parse(row.settings_json) : DEFAULT_SETTINGS;
  return c.json({ settings });
});

// PUT /settings — update site settings
labSpaceApi.put("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as Record<string, string>;
  const now = Date.now();

  // Merge with defaults
  const row = await db.query("SELECT settings_json FROM lab_space_settings WHERE owner_id = ?")
    .get(userId) as any;
  const current = row ? JSON.parse(row.settings_json) : DEFAULT_SETTINGS;
  const updated = { ...current, ...body };

  if (row) {
    await db.query(
      "UPDATE lab_space_settings SET settings_json = ?, updated_at = ? WHERE owner_id = ?"
    ).run(JSON.stringify(updated), now, userId);
  } else {
    await db.query(
      "INSERT INTO lab_space_settings (owner_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).run(userId, JSON.stringify(updated), now, now);
  }
  return c.json({ ok: true, settings: updated });
});

// ============================================================
// SERVER & DEBUGGING
// ============================================================

// GET /errors — get recent route errors (stub: returns empty for now)
labSpaceApi.get("/errors", async (c) => {
  return c.json({ errors: [], message: "Error tracking not yet implemented" });
});

// POST /restart — restart the lab space server (stub)
labSpaceApi.post("/restart", async (c) => {
  return c.json({ ok: true, message: "Server restart not applicable in lab mode" });
});
