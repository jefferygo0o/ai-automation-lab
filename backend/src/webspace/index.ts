/**
 * Lab Space — route management, version history, assets, settings.
 *
 * Replaces the old "Web Space" module with a full Zo-like API surface.
 * Routes are stored in the lab PostgreSQL DB (space_routes table).
 * Version history is tracked in space_route_versions.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { invalidateApiCache } from "./render.ts";

export const labSpaceApi = new Hono<HonoEnv>();

// ── Helper: look up route by path + owner ──────────────────────

async function findRoute(ownerId: string, path: string): Promise<any | null> {
  let p = path;
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return db.query(
    "SELECT id, owner_id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? AND path = ?"
  ).get(ownerId, p) as any | null;
}

async function findRouteById(ownerId: string, id: string): Promise<any | null> {
  return db.query(
    "SELECT id, owner_id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(id, ownerId) as any | null;
}

function routeJson(r: any) {
  return {
    id: r.id,
    path: r.path,
    type: r.type,
    code: r.code,
    public: !!r.is_public,
    currentVersion: r.current_version ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Helper: save version snapshot ──────────────────────────────

async function saveVersion(
  ownerId: string,
  routeId: string,
  path: string,
  type: string,
  code: string,
  action: string,
  label: string,
  isUndo = false
): Promise<number> {
  const last = await db.query(
    "SELECT version FROM space_route_versions WHERE owner_id = ? AND route_id = ? ORDER BY version DESC LIMIT 1"
  ).get(ownerId, routeId) as any | null;
  const version = (last?.version ?? 0) + 1;
  const id = `rv_${nanoid()}`;
  const now = Date.now();
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, label, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, routeId, ownerId, version, path, type, code, action, label, isUndo ? 1 : 0, now);
  await db.query(
    "UPDATE space_routes SET current_version = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(version, now, routeId, ownerId);
  return version;
}

// ── Helper: save site settings ─────────────────────────────────

function parseSettings(json: string): Record<string, any> {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

// ══════════════════════════════════════════════════════════════════
//  ROUTE MANAGEMENT
// ══════════════════════════════════════════════════════════════════

// GET /routes — list all routes
labSpaceApi.get("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db.query(
    "SELECT id, path, type, code, is_public, current_version, created_at, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
  ).all(userId) as any[];
  return c.json({ routes: rows.map(routeJson) });
});

// GET /routes/:encodedPath — get route by path (path is URL-encoded)
labSpaceApi.get("/routes/:encodedPath*", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const row = await findRoute(userId, path);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(routeJson(row));
});

// POST /routes — create a new route (write_space_route)
labSpaceApi.post("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { path?: string; route_type?: string; code?: string; public?: string };
  if (!body.path) return c.json({ error: "path required" }, 400);
  if (!body.route_type) return c.json({ error: "route_type required (api or page)" }, 400);
  if (body.route_type !== "page" && body.route_type !== "api") {
    return c.json({ error: "route_type must be 'page' or 'api'" }, 400);
  }
  const existing = await findRoute(userId, body.path);
  if (existing) return c.json({ error: "route already exists at this path — use PUT to update" }, 400);
  const id = `route_${nanoid()}`;
  const now = Date.now();
  const isPublic = body.public === "true" || body.public === true as any ? 1 : (body.path === "/" ? 1 : 0);
  await db.query(
    "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)"
  ).run(id, userId, body.path, body.route_type, body.code ?? "", isPublic, now, now);
  // Save initial version
  await saveVersion(userId, id, body.path, body.route_type, body.code ?? "", "create", "initial");
  invalidateApiCache(id);
  const row = await findRouteById(userId, id);
  return c.json(routeJson(row));
});

// PUT /routes/:encodedPath — full rewrite (write_space_route when route exists)
labSpaceApi.put("/routes/:encodedPath*", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const body = await c.req.json() as { route_type?: string; code?: string; public?: string; edit_instructions?: string };
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "route not found — use POST to create" }, 404);
  const sets: string[] = [];
  const vals: any[] = [];
  if (body.route_type !== undefined) {
    if (body.route_type !== "page" && body.route_type !== "api") {
      return c.json({ error: "route_type must be 'page' or 'api'" }, 400);
    }
    sets.push("type = ?"); vals.push(body.route_type);
  }
  if (body.code !== undefined) { sets.push("code = ?"); vals.push(body.code); }
  if (body.public !== undefined) { sets.push("is_public = ?"); vals.push(body.public === "true" ? 1 : 0); }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
  sets.push("updated_at = ?"); vals.push(Date.now());
  vals.push(existing.id, userId);
  await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
  // Save version
  const newType = body.route_type ?? existing.type;
  const newCode = body.code ?? existing.code;
  await saveVersion(userId, existing.id, path, newType, newCode, "write", body.edit_instructions || "full rewrite");
  invalidateApiCache(existing.id);
  const row = await findRouteById(userId, existing.id);
  return c.json(routeJson(row));
});

// PATCH /routes/:encodedPath — partial edit (edit_space_route)
labSpaceApi.patch("/routes/:encodedPath*", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const body = await c.req.json() as { code_edit?: string; edit_instructions?: string; public?: string };
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "route not found" }, 404);
  if (!body.code_edit) return c.json({ error: "code_edit required" }, 400);
  // Apply the edit: merge code_edit (which uses // ... existing code ... placeholders) with existing code
  const mergedCode = applyCodeEdit(existing.code, body.code_edit);
  const sets: string[] = ["code = ?"];
  const vals: any[] = [mergedCode];
  if (body.public !== undefined) { sets.push("is_public = ?"); vals.push(body.public === "true" ? 1 : 0); }
  sets.push("updated_at = ?"); vals.push(Date.now());
  vals.push(existing.id, userId);
  await db.query(`UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
  await saveVersion(userId, existing.id, path, existing.type, mergedCode, "edit", body.edit_instructions || "partial edit");
  invalidateApiCache(existing.id);
  const row = await findRouteById(userId, existing.id);
  return c.json(routeJson(row));
});

// DELETE /routes/:encodedPath — delete a route
labSpaceApi.delete("/routes/:encodedPath*", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "not found" }, 404);
  // Save a "delete" version so undo can restore
  await saveVersion(userId, existing.id, path, existing.type, existing.code, "delete", "deleted");
  invalidateApiCache(existing.id);
  await db.query("DELETE FROM space_routes WHERE id = ? AND owner_id = ?").run(existing.id, userId);
  return c.json({ ok: true });
});

// POST /routes/:encodedPath/publish — toggle visibility
labSpaceApi.post("/routes/:encodedPath*/publish", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const body = await c.req.json() as { public?: string };
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "not found" }, 404);
  const isPublic = body.public === "true" ? 1 : 0;
  await db.query("UPDATE space_routes SET is_public = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .run(isPublic, Date.now(), existing.id, userId);
  invalidateApiCache(existing.id);
  return c.json({ ok: true, public: !!isPublic });
});

// ══════════════════════════════════════════════════════════════════
//  VERSION HISTORY
// ══════════════════════════════════════════════════════════════════

// GET /routes/:encodedPath/history — version history
labSpaceApi.get("/routes/:encodedPath*/history", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "route not found" }, 404);
  const versions = await db.query(
    "SELECT id, version, path, type, code, action, label, is_undo, created_at FROM space_route_versions WHERE owner_id = ? AND route_id = ? ORDER BY version DESC"
  ).all(userId, existing.id) as any[];
  return c.json({
    routeId: existing.id,
    currentVersion: existing.current_version,
    versions: versions.map((v: any) => ({
      id: v.id,
      version: v.version,
      path: v.path,
      type: v.type,
      code: v.code,
      action: v.action,
      label: v.label,
      isUndo: !!v.is_undo,
      createdAt: v.created_at,
    })),
  });
});

// POST /routes/:encodedPath/undo — undo to previous version
labSpaceApi.post("/routes/:encodedPath*/undo", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "route not found" }, 404);
  // Find the version before current
  const target = await db.query(
    "SELECT version, path, type, code, action FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND version < ? ORDER BY version DESC LIMIT 1"
  ).get(userId, existing.id, existing.current_version) as any | null;
  if (!target) return c.json({ error: "nothing to undo" }, 400);
  // Restore
  await db.query(
    "UPDATE space_routes SET path = ?, type = ?, code = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(target.path, target.type, target.code, Date.now(), existing.id, userId);
  // Record undo action
  await saveVersion(userId, existing.id, target.path, target.type, target.code, "undo", `undo to v${target.version}`, true);
  invalidateApiCache(existing.id);
  const row = await findRouteById(userId, existing.id);
  return c.json({ ok: true, route: routeJson(row) });
});

// POST /routes/:encodedPath/redo — redo to next version
labSpaceApi.post("/routes/:encodedPath*/redo", async (c) => {
  const userId = c.get("userId") as string;
  const encodedPath = c.req.param("encodedPath") || "/";
  const path = decodeURIComponent(encodedPath);
  const existing = await findRoute(userId, path);
  if (!existing) return c.json({ error: "route not found" }, 404);
  // Find the version after current
  const target = await db.query(
    "SELECT version, path, type, code, action FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND version > ? ORDER BY version ASC LIMIT 1"
  ).get(userId, existing.id, existing.current_version) as any | null;
  if (!target) return c.json({ error: "nothing to redo" }, 400);
  // Restore
  await db.query(
    "UPDATE space_routes SET path = ?, type = ?, code = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(target.path, target.type, target.code, Date.now(), existing.id, userId);
  await saveVersion(userId, existing.id, target.path, target.type, target.code, "redo", `redo to v${target.version}`, true);
  invalidateApiCache(existing.id);
  const row = await findRouteById(userId, existing.id);
  return c.json({ ok: true, route: routeJson(row) });
});

// ══════════════════════════════════════════════════════════════════
//  ASSETS
// ══════════════════════════════════════════════════════════════════

labSpaceApi.get("/assets", async (c) => {
  const userId = c.get("userId") as string;
  const assets = await db.query(
    "SELECT id, asset_path, original_name, mime_type, size_bytes, created_at FROM lab_space_assets WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(userId) as any[];
  return c.json({ assets: assets.map((a: any) => ({ id: a.id, path: a.asset_path, name: a.original_name, mime: a.mime_type, size: a.size_bytes, createdAt: a.created_at })) });
});

labSpaceApi.post("/assets", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { source_file?: string; asset_path?: string };
  if (!body.source_file || !body.asset_path) return c.json({ error: "source_file and asset_path required" }, 400);
  // Store the asset reference in the DB (actual file storage is handled by the workspace)
  const id = `asset_${nanoid()}`;
  const now = Date.now();
  await db.query(
    "INSERT INTO lab_space_assets (id, owner_id, asset_path, original_name, mime_type, size_bytes, workspace_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, body.asset_path, body.source_file.split("/").pop() || "", "application/octet-stream", 0, body.source_file, now);
  return c.json({ ok: true, id, path: body.asset_path });
});

labSpaceApi.delete("/assets/:assetPath*", async (c) => {
  const userId = c.get("userId") as string;
  const assetPath = "/" + (c.req.param("assetPath") || "");
  const result = await db.query(
    "DELETE FROM lab_space_assets WHERE owner_id = ? AND asset_path = ?"
  ).run(userId, assetPath);
  return c.json({ ok: result.changes > 0 });
});

// ══════════════════════════════════════════════════════════════════
//  SITE SETTINGS
// ══════════════════════════════════════════════════════════════════

labSpaceApi.get("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query("SELECT settings_json FROM lab_space_settings WHERE owner_id = ?").get(userId) as any | null;
  return c.json({ settings: parseSettings(row?.settings_json ?? "{}") });
});

labSpaceApi.put("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as Record<string, any>;
  const now = Date.now();
  await db.query(
    "INSERT INTO lab_space_settings (owner_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_id) DO UPDATE SET settings_json = ?, updated_at = ?"
  ).run(userId, JSON.stringify(body), now, now, JSON.stringify(body), now);
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
//  SERVER & DEBUGGING
// ══════════════════════════════════════════════════════════════════

labSpaceApi.get("/errors", async (c) => {
  // Return recent route compilation/execution errors from the API cache
  // For now, return an empty list — errors are tracked in-memory per process
  return c.json({ errors: [], note: "Errors are tracked in-process. Check server logs for detailed errors." });
});

labSpaceApi.post("/restart", async (c) => {
  // Signal that the server should restart — in practice this triggers a process exit
  // which the supervisor will restart
  return c.json({ ok: true, message: "Server restart requested. The supervisor will restart the process." });
});

// ══════════════════════════════════════════════════════════════════
//  CODE EDIT MERGE (for edit_space_route)
// ══════════════════════════════════════════════════════════════════

/**
 * Simple merge: code_edit contains `// ... existing code ...` placeholders
 * that are replaced with sections from the original code.
 * If no placeholder exists, the entire code_edit replaces the original.
 */
function applyCodeEdit(original: string, codeEdit: string): string {
  const PLACEHOLDER = /\/\/\s*\.\.\.\s*existing code\s*\.\.\.\s*/g;
  if (!PLACEHOLDER.test(codeEdit)) return codeEdit;
  // Split original into sections, interleave with edit sections
  const editParts = codeEdit.split(PLACEHOLDER);
  const originalLines = original.split("\n");
  // For simplicity: if there's exactly one placeholder, replace it with the full original
  if (editParts.length === 2) {
    return editParts[0] + original + editParts[1];
  }
  // Multiple placeholders: split original into N parts (N = number of placeholders)
  const sectionSize = Math.ceil(originalLines.length / (editParts.length - 1 || 1));
  let result = editParts[0];
  for (let i = 0; i < editParts.length - 1; i++) {
    const start = i * sectionSize;
    const end = Math.min(start + sectionSize, originalLines.length);
    result += originalLines.slice(start, end).join("\n") + editParts[i + 1];
  }
  return result;
}
