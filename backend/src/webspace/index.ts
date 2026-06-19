/**
 * Web Space — route management (like zo.space).
 * Routes are stored in the lab SQLite DB (space_routes table).
 */
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

interface SpaceRoute {
  id: string;
  owner_id: string;
  path: string;
  type: "page" | "api";
  code: string;
  is_public: number;
  created_at: number;
  updated_at: number;
}

export const webSpaceApi = new Hono();

// ---- Routes are relative to mount point (/api/web-space) ----

webSpaceApi.get("/routes", (c) => {
  const userId = c.get("userId") as string;
  const rows = db.query(
    "SELECT id, path, type, code, is_public, updated_at FROM space_routes WHERE owner_id = ? ORDER BY updated_at DESC"
  ).all(userId) as Array<{ id: string; path: string; type: string; code: string; is_public: number; updated_at: number }>;
  return c.json({
    routes: rows.map((r) => ({
      id: r.id,
      path: r.path,
      type: r.type,
      code: r.code,
      public: !!r.is_public,
      updatedAt: r.updated_at,
    })),
  });
});

webSpaceApi.get("/routes/:id", (c) => {
  const userId = c.get("userId") as string;
  const row = db.query(
    "SELECT id, path, type, code, is_public, updated_at FROM space_routes WHERE id = ? AND owner_id = ?"
  ).get(c.req.param("id"), userId) as any;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({
    id: row.id, path: row.path, type: row.type,
    code: row.code, public: !!row.is_public, updatedAt: row.updated_at,
  });
});

webSpaceApi.post("/routes", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { path?: string; type?: string; code?: string; isPublic?: boolean };
  if (!body.path || !body.type) return c.json({ error: "path and type required" }, 400);
  // Check for duplicate path
  const existing = db.query(
    "SELECT id FROM space_routes WHERE owner_id = ? AND path = ?"
  ).get(userId, body.path);
  if (existing) return c.json({ error: "route already exists at this path" }, 400);
  const id = `route_${nanoid()}`;
  const now = Date.now();
  db.query(
    "INSERT INTO space_routes (id, owner_id, path, type, code, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, body.path, body.type, body.code ?? "", body.isPublic ? 1 : 0, now, now);
  return c.json({ id, path: body.path, type: body.type, code: body.code ?? "", public: !!body.isPublic, updatedAt: now });
});

webSpaceApi.put("/routes/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { path?: string; code?: string; type?: string; isPublic?: boolean };
  const sets: string[] = [];
  const vals: any[] = [];
  if (body.path !== undefined) { sets.push("path = ?"); vals.push(body.path); }
  if (body.code !== undefined) { sets.push("code = ?"); vals.push(body.code); }
  if (body.type !== undefined) { sets.push("type = ?"); vals.push(body.type); }
  if (body.isPublic !== undefined) { sets.push("is_public = ?"); vals.push(body.isPublic ? 1 : 0); }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(c.req.param("id"), userId);
  const result = db.query(
    `UPDATE space_routes SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`
  ).run(...vals);
  if (!result.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

webSpaceApi.post("/routes/:id/publish", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { isPublic?: boolean };
  const result = db.query(
    "UPDATE space_routes SET is_public = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).run(body.isPublic ? 1 : 0, Date.now(), c.req.param("id"), userId);
  if (!result.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

webSpaceApi.delete("/routes/:id", (c) => {
  const userId = c.get("userId") as string;
  const result = db.query(
    "DELETE FROM space_routes WHERE id = ? AND owner_id = ?"
  ).run(c.req.param("id"), userId);
  return c.json({ ok: result.changes > 0 });
});
