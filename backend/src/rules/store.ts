/**
 * Rules Store — CRUD for persistent behavioural constraints.
 *
 * Rules are user-wide (like personas) and apply to all agents. They're
 * injected into the system prompt in priority order (highest first).
 */
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

export interface RuleCondition {
  channel?: string;
  tool?: string;
  provider?: string;
  route?: string;
  userMessage?: string;
}

export interface Rule {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  instruction: string;
  condition?: RuleCondition;
  category: string;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

function safeParseJson<T>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

interface RuleRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  instruction: string;
  condition_json?: string;
  category: string;
  priority: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function rowToRule(r: RuleRow): Rule {
  const condition = r.condition_json
    ? safeParseJson<RuleCondition>(r.condition_json)
    : undefined;
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    description: r.description,
    instruction: r.instruction,
    condition: condition && Object.keys(condition).length > 0 ? condition : undefined,
    category: r.category,
    priority: r.priority,
    enabled: r.enabled === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const RuleStore = {
  async list(ownerId: string): Promise<Rule[]> {
    const rows = await db
      .prepare("SELECT * FROM rules WHERE owner_id = ? ORDER BY priority DESC, created_at ASC")
      .all(ownerId);
    return rows.map(rowToRule);
  },

  async listEnabled(ownerId: string): Promise<Rule[]> {
    const rows = await db
      .prepare("SELECT * FROM rules WHERE owner_id = ? AND enabled = 1 ORDER BY priority DESC, created_at ASC")
      .all(ownerId);
    return rows.map(rowToRule);
  },

  async get(id: string, ownerId: string): Promise<Rule | null> {
    const row = await db
      .prepare("SELECT * FROM rules WHERE id = ? AND owner_id = ?")
      .get(id, ownerId) as RuleRow | undefined;
    return row ? rowToRule(row) : null;
  },

  async create(
    ownerId: string,
    name: string,
    instruction: string,
    opts: { description?: string; category?: string; priority?: number; condition?: RuleCondition } = {}
  ): Promise<Rule> {
    const id = `rule_${nanoid(12)}`;
    const now = Date.now();
    const conditionJson = opts.condition ? JSON.stringify(opts.condition) : "{}";
    await db.prepare(
      `INSERT INTO rules (id, owner_id, name, description, instruction, condition_json, category, priority, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      id, ownerId, name, opts.description ?? "", instruction, conditionJson,
      opts.category ?? "general", opts.priority ?? 0, now, now
    );
    return (await RuleStore.get(id, ownerId))!;
  },

  async update(
    id: string,
    ownerId: string,
    fields: { name?: string; description?: string; instruction?: string; condition?: RuleCondition; category?: string; priority?: number; enabled?: boolean }
  ): Promise<Rule | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); vals.push(fields.name); }
    if (fields.description !== undefined) { sets.push("description = ?"); vals.push(fields.description); }
    if (fields.instruction !== undefined) { sets.push("instruction = ?"); vals.push(fields.instruction); }
    if (fields.condition !== undefined) { sets.push("condition_json = ?"); vals.push(JSON.stringify(fields.condition)); }
    if (fields.category !== undefined) { sets.push("category = ?"); vals.push(fields.category); }
    if (fields.priority !== undefined) { sets.push("priority = ?"); vals.push(fields.priority); }
    if (fields.enabled !== undefined) { sets.push("enabled = ?"); vals.push(fields.enabled ? 1 : 0); }
    if (sets.length === 0) return RuleStore.get(id, ownerId);
    sets.push("updated_at = ?");
    vals.push(Date.now());
    vals.push(id, ownerId);
    await db.prepare(`UPDATE rules SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
    return RuleStore.get(id, ownerId);
  },

  async delete(id: string, ownerId: string): Promise<boolean> {
    const r = await db.prepare("DELETE FROM rules WHERE id = ? AND owner_id = ?").run(id, ownerId);
    return r.changes > 0;
  },

  async toggle(id: string, ownerId: string, enabled: boolean): Promise<Rule | null> {
    return RuleStore.update(id, ownerId, { enabled });
  },
};
