import { nanoid } from "nanoid";
import { db } from "../db/pg.ts";

export type BrowserSessionStatus = "stopped" | "starting" | "active" | "closed";

export interface BrowserSession {
  id: string;
  ownerId: string;
  agentId: string;
  name: string;
  status: BrowserSessionStatus;
  currentUrl: string;
  storageStateJson: string;
  createdAt: number;
  updatedAt: number;
  lastStartedAt: number | null;
  lastStoppedAt: number | null;
}

interface Row {
  id: string;
  owner_id: string;
  agent_id: string;
  name: string;
  status: string;
  current_url: string;
  storage_state_json: string;
  created_at: number;
  updated_at: number;
  last_started_at: number | null;
  last_stopped_at: number | null;
}

function rowToSession(r: Row): BrowserSession {
  return {
    id: r.id,
    ownerId: r.owner_id,
    agentId: r.agent_id,
    name: r.name,
    status: r.status as BrowserSessionStatus,
    currentUrl: r.current_url,
    storageStateJson: r.storage_state_json,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastStartedAt: r.last_started_at,
    lastStoppedAt: r.last_stopped_at,
  };
}

export const BrowserSessionStore = {
  async create(ownerId: string, opts: { agentId?: string; name?: string } = {}): Promise<BrowserSession> {
    const id = `bs_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO browser_sessions (id, owner_id, agent_id, name, status, current_url, storage_state_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'stopped', '', '{}', $5, $5)`
    ).run(id, ownerId, opts.agentId ?? "", opts.name ?? "Browser session", now);
    const session = await this.get(id, ownerId);
    if (!session) throw new Error("Failed to create browser session");
    return session;
  },

  async get(id: string, ownerId: string): Promise<BrowserSession | null> {
    return db.prepare<Row>(
      "SELECT * FROM browser_sessions WHERE id = $1 AND owner_id = $2"
    ).get(id, ownerId).then(r => r ? rowToSession(r) : null);
  },

  async list(ownerId: string): Promise<BrowserSession[]> {
    const rows = await db.prepare<Row>(
      "SELECT * FROM browser_sessions WHERE owner_id = $1 ORDER BY updated_at DESC"
    ).all(ownerId);
    return rows.map(rowToSession);
  },

  async update(id: string, ownerId: string, patch: Partial<{
    status: BrowserSessionStatus;
    currentUrl: string;
    name: string;
    storageStateJson: string;
    lastStartedAt: number;
    lastStoppedAt: number;
  }>): Promise<BrowserSession | null> {
    const sets: string[] = ["updated_at = $1"];
    const values: unknown[] = [Date.now()];
    let idx = 2;
    const fields: [string, keyof typeof patch][] = [
      ["status", "status"],
      ["current_url", "currentUrl"],
      ["name", "name"],
      ["storage_state_json", "storageStateJson"],
      ["last_started_at", "lastStartedAt"],
      ["last_stopped_at", "lastStoppedAt"],
    ];
    for (const [col, key] of fields) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = $${idx++}`);
        values.push(patch[key]);
      }
    }
    values.push(id, ownerId);
    await db.prepare(
      `UPDATE browser_sessions SET ${sets.join(", ")} WHERE id = $${idx++} AND owner_id = $${idx}`
    ).run(...values);
    return this.get(id, ownerId);
  },

  async close(id: string, ownerId: string): Promise<boolean> {
    const now = Date.now();
    const result = await db.prepare(
      "UPDATE browser_sessions SET status = 'closed', last_stopped_at = $1, updated_at = $1 WHERE id = $2 AND owner_id = $3"
    ).run(now, id, ownerId);
    return result.changes > 0;
  },

  async markLostOnBoot(): Promise<void> {
    await db.prepare(
      "UPDATE browser_sessions SET status = 'closed' WHERE status IN ('starting', 'active')"
    ).run();
  },
};
