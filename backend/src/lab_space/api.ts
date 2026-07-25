/**
 * Lab Space — route management API (renamed from Web Space).
 * Mounted at /api/lab-space by the server.
 *
 * Provides CRUD, version history (undo/redo), asset management,
 * site settings, and server debugging endpoints.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { invalidateApiCache } from "./render.ts";
import { join } from "node:path";
import { copyFileSync, unlinkSync, existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

export const labSpaceApi = new Hono<HonoEnv>();

// ---- Helpers ----

function liveUrl(ownerId: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const PORT = Number(process.env.PORT ?? 8787);
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
    createdAt: r.created_at,
    currentVersion: r.current_version ?? 0,
  };
}

async function saveVersion(
  ownerId: string,
  routeId: string,
  path: string,
  type: string,
  code: string,
  action: string,
  label: string,
  version?: number
): Promise<number> {
  // Get next version number
  const last = await db.query(
    "SELECT MAX(version) as max_v FROM space_route_versions WHERE owner_id = ? AND route_id = ?"
  ).get(ownerId, routeId) as any;
  const nextVersion = version ?? ((last?.max_v ?? 0) + 1);

  const id = `ver_${nanoid()}`;
  const now = Date.now();
  await db.query(
    "INSERT INTO space_route_versions (id, route_id, owner_id, version, path, type, code, action, label, is_undo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
  ).run(id, routeId, ownerId, nextVersion, path, type, code, action, label, now);

  // Update current_version on the route
  await db.query(
    "UPDATE space_routes SET current_version = ? WHERE id = ? AND owner_id = ?"
  ).run(nextVersion, routeId, ownerId);

  return nextVersion;
}

// ============================================================
// Route Management
// ============================================================

// LIST routes
labSpaceApi.get("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
  ).all(userId) as any[];
  return c.json({
    routes: rows.map((r) => ({
      id: r.id,
      path: r.path,
      type: r.type,
      public: !!r.is_public,
      code: r.code,
      liveUrl: liveUrl(r.owner_id, r.path),
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      currentVersion: r.current_version ?? 0,
    })),
  });
});

// GET route by path or id
labSpaceApi.get("/routes/:pathOrId", async (c) => {
  const userId = c.get("userId") as string;
  const param = c.req.param("pathOrId");
  let row: any;

  // Try by id first, then by path
  row = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(param, userId);

  if (!row) {
    const path = param.startsWith("/") ? param : `/${param}`;
    row = await db.query(
      "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
    ).get(userId, path);
  }

  if (!row) return c.json({ error: "route not found" }, 404);
  return c.json(rowToJson(row));
});

// CREATE route (write_space_route)
labSpaceApi.post("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    path?: string;
    route_type?: string;
    type?: string;
    code?: string;
    public?: string | boolean;
  };
  if (!body.path) return c.json({ error: "path required" }, 400);
  const routeType = body.route_type ?? body.type;
  if (!routeType || (routeType !== "page" && routeType !== "api")) {
    return c.json({ error: "route_type must be 'page' or 'api'" }, 400);
  }

  // Check for existing route at this path
  const existing = await db.query(
    "SELECT id FROM space_routes WHERE owner_id = ? AND path = ?"
  ).get(userId, body.path);
  if (existing) return c.json({ error: `route already exists at path: ${body.path}` }, 400);

  const id = `route_${nanoid()}`;
  const now = Date.now();
  const isPublic = body.public === true || body.public === "true" ? 1 : 0;

  await db.query(
    "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, created_at, updated_at, current_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
  ).run(id, userId, body.path, routeType, body.code ?? "", isPublic, now, now);

  // Save initial version
  await saveVersion(userId, id, body.path, routeType, body.code ?? "", "create", "initial");

  invalidateApiCache(id);
  const row = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE id = ?"
  ).get(id) as any;
  return c.json(rowToJson(row));
});

// EDIT route (edit_space_route — partial update with version snapshot)
labSpaceApi.put("/routes/:pathOrId", async (c) => {
  const userId = c.get("userId") as string;
  const param = c.req.param("pathOrId");
  const body = await c.req.json() as {
    code_edit?: string;
    edit_instructions?: string;
    code?: string;
    path?: string;
    type?: string;
    public?: string | boolean;
    isPublic?: boolean;
  };

  // Find the route
  let route = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(param, userId) as any;

  if (!route) {
    const p = param.startsWith("/") ? param : `/${param}`;
    route = await db.query(
      "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
    ).get(userId, p) as any;
  }

  if (!route) return c.json({ error: "route not found" }, 404);

  // Apply code_edit if provided (partial update with placeholders)
  let newCode = body.code ?? route.code;
  if (body.code_edit) {
    newCode = body.code_edit; // For now, use code_edit directly (agent applies placeholders)
  }

  const sets: string[] = [];
  const vals: any[] = [];

  if (newCode !== route.code) {
    // Save version before updating
    await saveVersion(
      userId, route.id, route.path, route.type, route.code,
      "edit", body.edit_instructions ?? "edit"
    );
    sets.push("code = ?");
    vals.push(newCode);
  }

  if (body.path !== undefined && body.path !== route.path) {
    sets.push("path = ?");
    vals.push(body.path);
  }
  if (body.type !== undefined && body.type !== route.type) {
    if (body.type !== "page" && body.type !== "api") {
      return c.json({ error: "type must be 'page' or 'api'" }, 400);
    }
    sets.push("type = ?");
    vals.push(body.type);
  }
  if (body.public !== undefined) {
    const isPub = body.public === true || body.public === "true" ? 1 : 0;
    sets.push("is_public = ?");
    vals.push(isPub);
  } else if (body.isPublic !== undefined) {
    sets.push("is_public = ?");
    vals.push(body.isPublic ? 1 : 0);
  }

  if (sets.length === 0) return c.json({ ok: true, message: "nothing to update" });

  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(route.id, userId);

  await db.query(
    `UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`
  ).run(...vals);

  invalidateApiCache(route.id);
  return c.json({ ok: true });
});

// DELETE route
labSpaceApi.delete("/routes/:pathOrId", async (c) => {
  const userId = c.get("userId") as string;
  const param = c.req.param("pathOrId");

  let route = await db.query(
    "SELECT id, owner_id, path FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(param, userId) as any;

  if (!route) {
    const p = param.startsWith("/") ? param : `/${param}`;
    route = await db.query(
      "SELECT id, owner_id, path FROM space_routes WHERE owner_id = ? AND path = ?"
    ).get(userId, p) as any;
  }

  if (!route) return c.json({ error: "route not found" }, 404);

  // Save a version snapshot before deletion
  const fullRoute = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE id = ?"
  ).get(route.id) as any;
  if (fullRoute) {
    await saveVersion(userId, route.id, fullRoute.path, fullRoute.type, fullRoute.code, "delete", "deleted");
  }

  invalidateApiCache(route.id);
  await db.query(
    "DELETE FROM space_routes WHERE id = ? AND owner_id = ?"
  ).run(route.id, userId);

  // Also clean up versions
  await db.query(
    "DELETE FROM space_route_versions WHERE route_id = ? AND owner_id = ?"
  ).run(route.id, userId);

  return c.json({ ok: true });
});

// ============================================================
// Version History
// ============================================================

// GET route version history
labSpaceApi.get("/routes/:pathOrId/versions", async (c) => {
  const userId = c.get("userId") as string;
  const param = c.req.param("pathOrId");

  // Find route
  let route = await db.query(
    "SELECT id FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(param, userId) as any;

  if (!route) {
    const p = param.startsWith("/") ? param : `/${param}`;
    route = await db.query(
      "SELECT id FROM space_routes WHERE owner_id = ? AND path = ?"
    ).get(userId, p) as any;
  }

  if (!route) return c.json({ error: "route not found" }, 404);

  const versions = await db.query(
    "SELECT id, version, path, type, code, action, label, created_at FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND is_undo = 0 ORDER BY version DESC"
  ).all(userId, route.id) as any[];

  const routeRow = await db.query(
    "SELECT current_version FROM space_routes WHERE id = ?"
  ).get(route.id) as any;

  return c.json({
    versions: versions.map((v: any) => ({
      id: v.id,
      version: v.version,
      path: v.path,
      type: v.type,
      code: v.code,
      action: v.action,
      label: v.label,
      createdAt: v.created_at,
    })),
    currentVersion: routeRow?.current_version ?? 0,
  });
});

// UNDO route
labSpaceApi.post("/routes/:pathOrId/undo", async (c) => {
  const userId = c.get("userId") as string;
  const param = c.req.param("pathOrId");

  let route = await db.query(
    "SELECT id, owner_id, path, type, code, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(param, userId) as any;

  if (!route) {
    const p = param.startsWith("/") ? param : `/${param}`;
    route = await db.query(
      "SELECT id, owner_id, path, type, code, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
    ).get(userId, p) as any;
  }

  if (!route) return c.json({ error: "route not found" }, 404);

  // Get the version before current
  const prevVersion = await db.query(
    "SELECT id, version, path, type, code, action FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND is_undo = 0 AND version < ? ORDER BY version DESC LIMIT 1"
  ).get(userId, route.id, route.current_version) as any;

  if (!prevVersion) return c.json({ error: "no earlier version to undo to" }, 404);

  // Save current state as a version before undoing
  await saveVersion(
    userId, route.id, route.path, route.type, route.code,
    "undo", `undone from v${route.current_version}`, prevVersion.version + 1
  );

  // Restore the previous version
  await db.query(
    "UPDATE space_routes SET code = ?, path = ?, type = ?, updated_at = ?, current_version = ? WHERE id = ? AND owner_id = ?"
  ).run(prevVersion.code, prevVersion.path, prevVersion.type, Date.now(), prevVersion.version, route.id, userId);

  invalidateApiCache(route.id);

  const updated = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE id = ?"
  ).get(route.id) as any;

  return c.json({ ok: true, route: rowToJson(updated) });
});

// REDO route
labSpaceApi.post("/routes/:pathOrId/redo", async (c) => {
  const userId = c.get("userId") as string;
  const param = c.req.param("pathOrId");

  let route = await db.query(
    "SELECT id, owner_id, path, type, code, current_version FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(param, userId) as any;

  if (!route) {
    const p = param.startsWith("/") ? param : `/${param}`;
    route = await db.query(
      "SELECT id, owner_id, path, type, code, current_version FROM space_routes WHERE owner_id = ? AND path = ?"
    ).get(userId, p) as any;
  }

  if (!route) return c.json({ error: "route not found" }, 404);

  // Get the version after current
  const nextVersion = await db.query(
    "SELECT id, version, path, type, code, action FROM space_route_versions WHERE owner_id = ? AND route_id = ? AND is_undo = 0 AND version > ? ORDER BY version ASC LIMIT 1"
  ).get(userId, route.id, route.current_version) as any;

  if (!nextVersion) return c.json({ error: "no later version to redo to" }, 404);

  // Save current state as undo version
  await saveVersion(
    userId, route.id, route.path, route.type, route.code,
    "redo", `redone from v${route.current_version}`, nextVersion.version
  );

  // Restore the next version
  await db.query(
    "UPDATE space_routes SET code = ?, path = ?, type = ?, updated_at = ?, current_version = ? WHERE id = ? AND owner_id = ?"
  ).run(nextVersion.code, nextVersion.path, nextVersion.type, Date.now(), nextVersion.version, route.id, userId);

  invalidateApiCache(route.id);

  const updated = await db.query(
    "SELECT id, owner_id, path, type, code, is_public, created_at, updated_at, current_version FROM space_routes WHERE id = ?"
  ).get(route.id) as any;

  return c.json({ ok: true, route: rowToJson(updated) });
});

// ============================================================
// Assets
// ============================================================

const assetsDir = join(process.cwd(), "data", "lab_space_assets");
if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

// LIST assets
labSpaceApi.get("/assets", async (c) => {
  try {
    if (!existsSync(assetsDir)) return c.json({ assets: [] });
    const files = readdirSync(assetsDir, { recursive: true }) as string[];
    const assets = files
      .filter((f) => !f.includes("/"))
      .map((f) => {
        const stat = statSync(join(assetsDir, f));
        return { path: `/${f}`, size: stat.size, mtime: stat.mtimeMs };
      });
    return c.json({ assets });
  } catch {
    return c.json({ assets: [] });
  }
});

// UPLOAD/UPDATE asset
labSpaceApi.post("/assets", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { source_file?: string; asset_path?: string };
  if (!body.source_file || !body.asset_path) {
    return c.json({ error: "source_file and asset_path required" }, 400);
  }

  try {
    const destName = body.asset_path.startsWith("/") ? body.asset_path.slice(1) : body.asset_path;
    // Prevent path traversal
    if (destName.includes("..") || destName.includes("/")) {
      return c.json({ error: "invalid asset_path" }, 400);
    }
    copyFileSync(body.source_file, join(assetsDir, destName));
    const stat = statSync(join(assetsDir, destName));
    return c.json({ ok: true, path: body.asset_path, size: stat.size });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "copy failed" }, 500);
  }
});

// DELETE asset
labSpaceApi.delete("/assets/:assetPath(*)", async (c) => {
  const assetPath = c.req.param("assetPath");
  const fileName = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  if (fileName.includes("..") || fileName.includes("/")) {
    return c.json({ error: "invalid asset_path" }, 400);
  }

  try {
    const filePath = join(assetsDir, fileName);
    if (!existsSync(filePath)) return c.json({ error: "asset not found" }, 404);
    unlinkSync(filePath);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "delete failed" }, 500);
  }
});

// ============================================================
// Server & Debugging
// ============================================================

// GET errors
labSpaceApi.get("/errors", async (c) => {
  // Read recent errors from /dev/shm/ lab server logs
  const errors: any[] = [];
  try {
    const logFiles = ["/dev/shm/lab-server.log", "/dev/shm/lab-err.log"];
    for (const logFile of logFiles) {
      if (!existsSync(logFile)) continue;
      const content = readFileSync(logFile, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      // Get last 20 lines with "error" or "Error"
      const errorLines = lines
        .filter((l) => /error|Error|ERR|exception/i.test(l))
        .slice(-20);
      for (const line of errorLines) {
        errors.push({ source: logFile, message: line });
      }
    }
  } catch {}
  return c.json({ errors });
});

// RESTART server
labSpaceApi.post("/restart", async (c) => {
  // Signal to restart by touching a marker file
  try {
    const markerPath = join(process.cwd(), "data", ".restart_requested");
    writeFileSync(markerPath, String(Date.now()));
    return c.json({ ok: true, message: "restart requested" });
  } catch (e: any) {
    return c.json({ error: e?.message ?? "restart failed" }, 500);
  }
});

// ============================================================
// Site Settings
// ============================================================

const defaultSettings = {
  siteTitle: "Lab Space",
  siteDescription: "",
  ogImageUrl: "",
  faviconUrl: "",
  customHeadHtml: "",
  robotsTxt: "User-agent: *\nDisallow:",
  noindex: "false",
  custom404Route: "",
  lang: "en",
};

labSpaceApi.get("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query(
    "SELECT settings_json FROM lab_space_settings WHERE owner_id = ?"
  ).get(userId) as any;

  let settings = { ...defaultSettings };
  if (row?.settings_json) {
    try {
      settings = { ...defaultSettings, ...JSON.parse(row.settings_json) };
    } catch {}
  }
  return c.json(settings);
});

labSpaceApi.put("/settings", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as Record<string, any>;
  const now = Date.now();

  // Get current settings
  const row = await db.query(
    "SELECT settings_json FROM lab_space_settings WHERE owner_id = ?"
  ).get(userId) as any;

  let current = { ...defaultSettings };
  if (row?.settings_json) {
    try { current = { ...defaultSettings, ...JSON.parse(row.settings_json) }; } catch {}
  }

  // Merge provided fields
  const merged = { ...current };
  for (const [k, v] of Object.entries(body)) {
    if (v === "default" || v === "" || v === null || v === undefined) {
      // Reset to default
      const key = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (key in defaultSettings) {
        (merged as any)[key] = (defaultSettings as any)[key];
      }
    } else {
      // Apply camelCase version of the snake_case key
      const key = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      (merged as any)[key] = v;
    }
  }

  await db.query(
    "INSERT INTO lab_space_settings (owner_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_id) DO UPDATE SET settings_json = ?, updated_at = ?"
  ).run(userId, JSON.stringify(merged), now, now, JSON.stringify(merged), now);

  return c.json({ ok: true, settings: merged });
});
