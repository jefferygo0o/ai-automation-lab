/**
 * Agent file versioning.
 *
 * Every write to an agent .md file creates a snapshot. The user can rewind
 * any .md file independently.
 */

import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export interface HistoryEntry {
  id: string;
  agentId: string;
  filename: string;
  content: string;
  createdAt: number;
}

interface HistoryRow {
  id: string;
  agent_id: string;
  filename: string;
  content: string;
  created_at: number;
}

function rowToEntry(r: HistoryRow): HistoryEntry {
  return { id: r.id, agentId: r.agent_id, filename: r.filename, content: r.content, createdAt: r.created_at };
}

export const HistoryStore = {
  async record(agentId: string, filename: string, content: string): HistoryEntry {
    const id = `hist_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO agent_file_history (id, agent_id, filename, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, agentId, filename, content, now);
    return { id, agentId, filename, content, createdAt: now };
  },

  async list(agentId: string, file?: string): Promise<HistoryEntry[]> {
    const rows = file
      ? (await db.prepare(`SELECT * FROM agent_file_history WHERE agent_id = ? AND filename = ? ORDER BY created_at DESC`).all(agentId, file) as HistoryRow[])
      : (await db.prepare(`SELECT * FROM agent_file_history WHERE agent_id = ? ORDER BY created_at DESC`).all(agentId) as HistoryRow[]);
    return rows.map(rowToEntry);
  },

  async get(id: string): Promise<HistoryEntry | null> {
    const row = await db.prepare(`SELECT * FROM agent_file_history WHERE id = ?`).get(id) as HistoryRow | undefined;
    return row ? rowToEntry(row) : null;
  },
};

/** Convenience alias used by registry */
export const recordHistory = HistoryStore.record;
