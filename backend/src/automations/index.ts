/**
 * Automations — scheduled agent task runner (like Zo's automations).
 * Stored in the lab SQLite DB (automations table). A simple interval-based
 * scheduler checks for due automations and triggers them.
 */
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

interface Automation {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  agent_id: string;
  rrule: string;
  prompt: string;
  active: number;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface AutomationRun {
  id: string;
  automation_id: string;
  status: string;
  output: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

function formatRRule(rrule: string): string {
  if (rrule.startsWith("FREQ=DAILY")) return "Daily";
  if (rrule.startsWith("FREQ=WEEKLY")) return "Weekly";
  if (rrule.startsWith("FREQ=MONTHLY")) return "Monthly";
  if (rrule.startsWith("FREQ=HOURLY")) return "Hourly";
  if (rrule.startsWith("FREQ=MINUTELY")) {
    const m = rrule.match(/INTERVAL=(\d+)/);
    return m ? `Every ${m[1]} min` : "Every minute";
  }
  return rrule;
}

function format(row: Automation): {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  agent_id: string;
  rrule: string;
  prompt: string;
  active: boolean;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
} {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description,
    agent_id: row.agent_id,
    rrule: row.rrule,
    prompt: row.prompt,
    active: row.active !== 0,
    last_run_at: row.last_run_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getNextRun(automation: Automation): number {
  // Simple interval parser for common patterns
  const rrule = automation.rrule;
  const now = Date.now();
  const last = automation.last_run_at ?? 0;

  // Start from now if never run
  const from = last > 0 ? last : now;

  if (rrule.startsWith("FREQ=MINUTELY")) {
    const m = rrule.match(/INTERVAL=(\d+)/);
    const interval = m ? parseInt(m[1]) : 1;
    return from + interval * 60_000;
  }
  if (rrule.startsWith("FREQ=HOURLY")) {
    const m = rrule.match(/INTERVAL=(\d+)/);
    const interval = m ? parseInt(m[1]) : 1;
    return from + interval * 3600_000;
  }
  if (rrule.startsWith("FREQ=DAILY")) {
    return from + 86400_000;
  }
  if (rrule.startsWith("FREQ=WEEKLY")) {
    return from + 7 * 86400_000;
  }
  if (rrule.startsWith("FREQ=MONTHLY")) {
    return from + 30 * 86400_000;
  }
  return from + 60000; // default: 1 minute
}

export const automationsApi = new Hono();

// ---- Routes (relative to mount point /api/automations) ----

automationsApi.get("", (c) => {
  const userId = c.get("userId") as string;
  const rows = db.query(
    "SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(userId) as Automation[];
  return c.json({ automations: rows.map(format) });
});

automationsApi.get("/", (c) => {
  const userId = c.get("userId") as string;
  const rows = db.query(
    "SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(userId) as Automation[];
  return c.json({ automations: rows.map(format) });
});

automationsApi.get("/:id", (c) => {
  const userId = c.get("userId") as string;
  const row = db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId) as Automation | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ automation: format(row) });
});

automationsApi.post("", async (c) => {
  try {
    const userId = c.get("userId") as string;
    console.log("[automations] POST userId:", userId);
    const body = await c.req.json() as { name?: string; agent_id?: string; rrule?: string; instruction?: string; active?: boolean };
    console.log("[automations] POST body:", JSON.stringify(body));
    if (!body.name || !body.agent_id) return c.json({ error: "name and agent_id required" }, 400);
    const id = `auto_${nanoid()}`;
    const now = Date.now();
    db.query(
      `INSERT INTO automations (id, owner_id, name, agent_id, rrule, prompt, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, body.name, body.agent_id, body.rrule ?? "", body.instruction ?? "", body.active !== false ? 1 : 0, now, now);
    console.log("[automations] created:", id);
    return c.json({ automation: { id, name: body.name, agentId: body.agent_id, rrule: body.rrule ?? "", instruction: body.instruction ?? "", active: body.active !== false, createdAt: now, updatedAt: now } });
  } catch (e: any) {
    console.error("[automations] POST error:", e?.message ?? String(e), e?.stack ?? "");
    return c.json({ error: e?.message ?? String(e) }, 500);
  }
});

automationsApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { name?: string; agent_id?: string; rrule?: string; instruction?: string; active?: boolean };
  if (!body.name || !body.agent_id) return c.json({ error: "name and agent_id required" }, 400);
  const id = `auto_${nanoid()}`;
  const now = Date.now();
  db.query(
    `INSERT INTO automations (id, owner_id, name, agent_id, rrule, prompt, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, body.name, body.agent_id, body.rrule ?? "", body.instruction ?? "", body.active !== false ? 1 : 0, now, now);
  return c.json({ automation: { id, name: body.name, agentId: body.agent_id, rrule: body.rrule ?? "", instruction: body.instruction ?? "", active: body.active !== false, createdAt: now, updatedAt: now } });
});

automationsApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as { name?: string; agent_id?: string; rrule?: string; instruction?: string; active?: boolean };
  const sets: string[] = [];
  const vals: any[] = [];
  if (body.name !== undefined) { sets.push("name = ?"); vals.push(body.name); }
  if (body.agent_id !== undefined) { sets.push("agent_id = ?"); vals.push(body.agent_id); }
  if (body.rrule !== undefined) { sets.push("rrule = ?"); vals.push(body.rrule); }
  if (body.instruction !== undefined) { sets.push("prompt = ?"); vals.push(body.instruction); }
  if (body.active !== undefined) { sets.push("active = ?"); vals.push(body.active ? 1 : 0); }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(c.req.param("id"), userId);
  const result = db.query(
    `UPDATE automations SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`
  ).run(...vals);
  if (!result.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

automationsApi.delete("/:id", (c) => {
  const userId = c.get("userId") as string;
  const result = db.query("DELETE FROM automations WHERE id = ? AND owner_id = ?").run(c.req.param("id"), userId);
  return c.json({ ok: result.changes > 0 });
});

automationsApi.get("/:id/runs", (c) => {
  const userId = c.get("userId") as string;
  // First verify ownership
  const auto = db.query("SELECT id FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId);
  if (!auto) return c.json({ error: "not found" }, 404);
  const runs = db.query(
    "SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT 50"
  ).all(c.req.param("id")) as AutomationRun[];
  return c.json({ runs });
});
