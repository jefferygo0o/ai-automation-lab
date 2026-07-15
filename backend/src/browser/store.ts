import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { Audit } from "../audit/index.ts";

export type BrowserSessionStatus = "starting" | "active" | "closed" | "lost";

export interface BrowserSession {
  id: string;
  ownerId: string;
  agentId: string | null;
  label: string;
  status: BrowserSessionStatus;
  currentUrl: string;
  title: string;
  profilePath: string;
  downloadPath: string;
  createdAt: number;
  lastUsedAt: number;
  closedAt: number | null;
}

interface BrowserSessionRow {
  id: string;
  owner_id: string;
  agent_id: string | null;
  label: string;
  status: string;
  current_url: string;
  title: string;
  profile_path: string;
  download_path: string;
  created_at: number;
  last_used_at: number;
  closed_at: number | null;
}

function rowToSession(row: BrowserSessionRow): BrowserSession {
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id,
    label: row.label,
    status: row.status as BrowserSessionStatus,
    currentUrl: row.current_url,
    title: row.title,
    profilePath: row.profile_path,
    downloadPath: row.download_path,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    closedAt: row.closed_at,
  };
}

export const BrowserSessionStore = {
  async create(ownerId: string, input: { agentId?: string; label?: string; profilePath?: string; downloadPath?: string }): Promise<BrowserSession> {
    const id = `bs_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO browser_sessions (id, owner_id, agent_id, label, status, current_url, title, profile_path, download_path, created_at, last_used_at, closed_at)
       VALUES (?, ?, ?, ?, 'starting', '', '', ?, ?, ?, ?, NULL)`,
    ).run(id, ownerId, input.agentId ?? null, input.label ?? "Browser session", input.profilePath ?? "", input.downloadPath ?? "", now, now);
    const session = await this.get(id, ownerId);
    if (!session) throw new Error("failed to create browser session");
    await Audit.record({ ownerId, actor: "user", action: "browser.session_create", targetId: id, targetType: "browser_session" });
    return session;
  },

  async get(id: string, ownerId: string): Promise<BrowserSession | null> {
    const row = await db.prepare("SELECT * FROM browser_sessions WHERE id = ? AND owner_id = ?").get(id, ownerId) as BrowserSessionRow | undefined;
    return row ? rowToSession(row) : null;
  },

  async list(ownerId: string): Promise<BrowserSession[]> {
    const rows = await db.prepare("SELECT * FROM browser_sessions WHERE owner_id = ? ORDER BY last_used_at DESC").all(ownerId) as BrowserSessionRow[];
    return rows.map(rowToSession);
  },

  async touch(id: string, ownerId: string, patch: Partial<{ status: BrowserSessionStatus; currentUrl: string; title: string }>): Promise<BrowserSession | null> {
    const sets = ["last_used_at = ?"];
    const values: unknown[] = [Date.now()];
    if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
    if (patch.currentUrl !== undefined) { sets.push("current_url = ?"); values.push(patch.currentUrl); }
    if (patch.title !== undefined) { sets.push("title = ?"); values.push(patch.title); }
    values.push(id, ownerId);
    await db.prepare(`UPDATE browser_sessions SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...values);
    return this.get(id, ownerId);
  },

  async close(id: string, ownerId: string): Promise<boolean> {
    const now = Date.now();
    const result = await db.prepare("UPDATE browser_sessions SET status = 'closed', closed_at = ?, last_used_at = ? WHERE id = ? AND owner_id = ?").run(now, now, id, ownerId);
    if (result.changes) await Audit.record({ ownerId, actor: "user", action: "browser.session_close", targetId: id, targetType: "browser_session" });
    return result.changes > 0;
  },

  async markLostOnBoot(): Promise<void> {
    await db.prepare("UPDATE browser_sessions SET status = 'lost' WHERE status IN ('starting', 'active')").run();
  },
};

export function browserSessionRow(session: BrowserSession): Record<string, unknown> {
  return { ...session };
}
