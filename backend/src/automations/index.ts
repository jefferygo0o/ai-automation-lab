/**
 * Automations — scheduled agent task runner (like Zo's automations).
 * Stored in the lab SQLite DB (automations table). A simple interval-based
 * scheduler checks for due automations and triggers them.
 *
 * Routes are mounted at /api/automations (single source of truth — see
 * backend/src/api/server.ts).
 */
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { AutomationScheduler, getNextRun, fireAutomationById } from "./scheduler.ts";

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

function format(row: Automation, now: number = Date.now()) {
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
    next_run_at: row.active ? getNextRun(row, now) : null,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const automationsApi = new Hono();

// ---- Routes (relative to mount point /api/automations) ----

automationsApi.get("/", (c) => {
  const userId = c.get("userId") as string;
  const now = Date.now();
  const rows = db.query(
    "SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(userId) as Automation[];
  return c.json({
    automations: rows.map((r) => format(r, now)),
    scheduler: {
      running: AutomationScheduler.isRunning(),
      stats: AutomationScheduler.getStats(),
    },
  });
});

automationsApi.get("/:id", (c) => {
  const userId = c.get("userId") as string;
  const row = db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?")
    .get(c.req.param("id"), userId) as Automation | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ automation: format(row) });
});

automationsApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    name?: string;
    agent_id?: string;
    rrule?: string;
    instruction?: string;
    active?: boolean;
  };
  if (!body.name || !body.agent_id) {
    return c.json({ error: "name and agent_id required" }, 400);
  }
  const id = `auto_${nanoid()}`;
  const now = Date.now();
  db.query(
    `INSERT INTO automations (id, owner_id, name, agent_id, rrule, prompt, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    body.name,
    body.agent_id,
    body.rrule ?? "FREQ=MINUTELY;INTERVAL=15",
    body.instruction ?? "",
    body.active !== false ? 1 : 0,
    now,
    now,
  );
  return c.json({
    automation: {
      id,
      name: body.name,
      agentId: body.agent_id,
      rrule: body.rrule ?? "FREQ=MINUTELY;INTERVAL=15",
      instruction: body.instruction ?? "",
      active: body.active !== false,
      createdAt: now,
      updatedAt: now,
    },
  });
});

automationsApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json() as {
    name?: string;
    agent_id?: string;
    rrule?: string;
    instruction?: string;
    active?: boolean;
  };
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
  const result = db.query("DELETE FROM automations WHERE id = ? AND owner_id = ?")
    .run(c.req.param("id"), userId);
  return c.json({ ok: result.changes > 0 });
});

automationsApi.get("/:id/runs", (c) => {
  const userId = c.get("userId") as string;
  const auto = db.query("SELECT id FROM automations WHERE id = ? AND owner_id = ?")
    .get(c.req.param("id"), userId);
  if (!auto) return c.json({ error: "not found" }, 404);
  const runs = db.query(
    "SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT 50"
  ).all(c.req.param("id")) as AutomationRun[];
  return c.json({ runs });
});

// Scheduler liveness + per-automation due-time view. Frontend polls this to
// show "next run in" and whether the background loop is alive.
automationsApi.get("/scheduler/status", (c) => {
  const userId = c.get("userId") as string;
  const now = Date.now();
  const rows = db.query(
    "SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(userId) as Automation[];
  const enriched = rows.map((r) => ({
    ...format(r, now),
    due_in_ms: Math.max(0, getNextRun(r, now) - now),
  }));
  return c.json({
    scheduler: {
      running: AutomationScheduler.isRunning(),
      stats: AutomationScheduler.getStats(),
      tick_ms: Number(process.env.SCHEDULER_TICK_MS ?? 15_000),
      server_time: now,
    },
    automations: enriched,
  });
});

// Manual trigger — fires the automation once, regardless of schedule. Useful
// for testing before waiting on the timer.
automationsApi.post("/:id/run-now", async (c) => {
  const userId = c.get("userId") as string;
  const row = db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?")
    .get(c.req.param("id"), userId) as Automation | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  const runId = await fireAutomationById(row.id);
  return c.json({ ok: true, run_id: runId });
});