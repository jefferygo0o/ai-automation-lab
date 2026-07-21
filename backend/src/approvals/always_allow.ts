/**
 * Always-Allow Store — persists user preferences to auto-approve tools
 * by action category (read, write, exec, http, etc.).
 *
 * When a user clicks "Always Allow" on an approval prompt for a specific
 * action category, a rule is stored here. Subsequent tool calls in that
 * category will be auto-approved without showing the approval prompt.
 */
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export interface AlwaysAllowRule {
  id: string;
  ownerId: string;
  actionKind: string;
  createdAt: number;
}

interface Row {
  id: string;
  owner_id: string;
  action_kind: string;
  created_at: number;
}

function rowToRule(r: Row): AlwaysAllowRule {
  return {
    id: r.id,
    ownerId: r.owner_id,
    actionKind: r.action_kind,
    createdAt: r.created_at,
  };
}

export const AlwaysAllowStore = {
  /**
   * Check if a given action kind has been always-allowed by this user.
   */
  async check(ownerId: string, actionKind: string): Promise<boolean> {
    const row = await db.prepare(
      `SELECT 1 FROM always_allow_rules WHERE owner_id = ? AND action_kind = ?`
    ).get(ownerId, actionKind) as Row | undefined;
    return !!row;
  },

  /**
   * Add an always-allow rule for a given action kind.
   * Returns the created rule, or the existing one if already set.
   */
  async add(ownerId: string, actionKind: string): Promise<AlwaysAllowRule> {
    // Check if already exists
    const existing = await db.prepare(
      `SELECT * FROM always_allow_rules WHERE owner_id = ? AND action_kind = ?`
    ).get(ownerId, actionKind) as Row | undefined;
    if (existing) return rowToRule(existing);

    const id = `alw_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO always_allow_rules (id, owner_id, action_kind, created_at) VALUES (?, ?, ?, ?)`
    ).run(id, ownerId, actionKind, now);
    return { id, ownerId, actionKind, createdAt: now };
  },

  /**
   * Remove an always-allow rule.
   */
  async remove(ownerId: string, actionKind: string): Promise<boolean> {
    const r = await db.prepare(
      `DELETE FROM always_allow_rules WHERE owner_id = ? AND action_kind = ?`
    ).run(ownerId, actionKind);
    return (r.changes ?? 0) > 0;
  },

  /**
   * List all always-allow rules for a user.
   */
  async list(ownerId: string): Promise<AlwaysAllowRule[]> {
    const rows = await db.prepare(
      `SELECT * FROM always_allow_rules WHERE owner_id = ? ORDER BY created_at DESC`
    ).all(ownerId) as Row[];
    return rows.map(rowToRule);
  },
};
