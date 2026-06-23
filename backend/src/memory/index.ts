/**
 * Long-term structured memory store: per-(agent, kind, key) rows the agent
 * can read (read_memory) and write (update_memory) at runtime.
 *
 * Scoped per owner (user) so memory is isolated across users sharing an agent.
 */
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export type MemoryKind = "fact" | "preference" | "reference" | "task";

export interface MemoryItem {
  id: string;
  agentId: string;
  ownerUserId: string;
  kind: MemoryKind;
  key: string;
  value: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  agent_id: string;
  owner_user_id: string | null;
  kind: string;
  key: string;
  value: string | null;
  source: string | null;
  created_at: number;
  updated_at: number;
}

function rowToItem(r: Row): MemoryItem {
  return {
    id: r.id,
    agentId: r.agent_id,
    ownerUserId: r.owner_user_id ?? "",
    kind: r.kind as MemoryKind,
    key: r.key,
    value: r.value ?? "",
    source: r.source ?? "agent",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const MemoryStore = {
  /** Upsert by (agent, kind, key). Returns the (existing or new) id. */
  async upsert(agentId: string, ownerUserId: string, kind: MemoryKind, key: string, value: string, source = "agent"): string {
    const now = Date.now();
    const existing = await db.prepare(
      `SELECT id, created_at FROM memory_items WHERE agent_id = ? AND kind = ? AND key = ?`
    ).get(agentId, kind, key) as { id: string; created_at: number } | undefined;
    if (existing) {
      await db.prepare(
        `UPDATE memory_items SET value = ?, source = ?, owner_user_id = ?, updated_at = ? WHERE id = ?`
      ).run(value, source, ownerUserId, now, existing.id);
      return existing.id;
    }
    const id = `mem_${nanoid(10)}`;
    await db.prepare(
      `INSERT INTO memory_items (id, agent_id, owner_user_id, kind, key, value, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, agentId, ownerUserId, kind, key, value, source, now, now);
    return id;
  },

  async list(agentId: string, ownerUserId: string, kind?: MemoryKind | string, limit = 50): MemoryItem[] {
    const params: (string | number)[] = [agentId, ownerUserId];
    let where = `agent_id = ? AND owner_user_id = ?`;
    if (kind) {
      where += ` AND kind = ?`;
      params.push(kind);
    }
    params.push(limit);
    return await (await db.prepare(
      `SELECT * FROM memory_items WHERE ${where} ORDER BY updated_at DESC LIMIT ?`
    ).all(...params) as Row[]).map(rowToItem);
  },

  get(id: string, ownerUserId: string): MemoryItem | null {
    const row = await db.prepare(
      `SELECT * FROM memory_items WHERE id = ? AND owner_user_id = ?`
    ).get(id, ownerUserId) as Row | undefined;
    return row ? rowToItem(row) : null;
  },

  async update(id: string, ownerUserId: string, value: string, source?: string): boolean {
    const now = Date.now();
    const r = source
      ? await db.prepare(`UPDATE memory_items SET value = ?, source = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?`)
          .run(value, source, now, id, ownerUserId)
      : await db.prepare(`UPDATE memory_items SET value = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?`)
          .run(value, now, id, ownerUserId);
    return r.changes > 0;
  },

  async remove(id: string, ownerUserId: string): boolean {
    const r = await db.prepare(`DELETE FROM memory_items WHERE id = ? AND owner_user_id = ?`).run(id, ownerUserId);
    return r.changes > 0;
  },

  async clear(agentId: string, ownerUserId: string): number {
    const r = await db.prepare(`DELETE FROM memory_items WHERE agent_id = ? AND owner_user_id = ?`).run(agentId, ownerUserId);
    return r.changes;
  },
};
