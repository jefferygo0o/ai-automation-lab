import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { AutomationScheduler, getNextRun, fireAutomationById } from "./scheduler.ts";
import { getUserTimezone } from "../settings/user.ts";
import { validateRRule } from "./rrule.ts";

interface AutomationRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  agent_id: string | null;
  rrule: string;
  prompt: string;
  active: number;
  enabled?: number;
  last_run_at: number | null;
  last_error: string | null;
  next_run_at?: number | null;
  timezone?: string;
  delivery_method?: string;
  delivery_target_json?: string;
  model?: string | null;
  created_at: number;
  updated_at: number;
}

interface AutomationRunRow {
  id: string;
  automation_id: string;
  status: string;
  output: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

function format(row: AutomationRow, now = Date.now()) {
  const active = row.active !== 0 && row.enabled !== 0;
  const nextRunAt = active ? getNextRun(row, now) : null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    owner_id: row.owner_id,
    name: row.name,
    title: row.name,
    description: row.description ?? "",
    agentId: row.agent_id,
    agent_id: row.agent_id,
    rrule: row.rrule,
    instruction: row.prompt ?? "",
    prompt: row.prompt ?? "",
    active,
    enabled: active,
    lastRunAt: row.last_run_at,
    last_run_at: row.last_run_at,
    nextRunAt,
    next_run_at: nextRunAt,
    lastError: row.last_error,
    last_error: row.last_error,
    timezone: row.timezone ?? "UTC",
    deliveryMethod: row.delivery_method ?? "none",
    delivery_method: row.delivery_method ?? "none",
    model: row.model ?? null,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  };
}

function bodyAgentId(body: Record<string, unknown>): string | null | undefined {
  if (body.agent_id !== undefined) return body.agent_id ? String(body.agent_id) : null;
  if (body.agentId !== undefined) return body.agentId ? String(body.agentId) : null;
  return undefined;
}

function bodyInstruction(body: Record<string, unknown>): string | undefined {
  if (body.instruction !== undefined) return String(body.instruction);
  if (body.prompt !== undefined) return String(body.prompt);
  return undefined;
}

function bodyActive(body: Record<string, unknown>): boolean | undefined {
  if (body.active !== undefined) return Boolean(body.active);
  if (body.enabled !== undefined) return Boolean(body.enabled);
  return undefined;
}

function validateSchedule(rrule: string): string | null {
  return validateRRule(rrule);
}

function validateTimezone(timezone: string): string | null {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
    return null;
  } catch {
    return `invalid timezone: ${timezone}`;
  }
}

export const automationsApi = new Hono<HonoEnv>();

automationsApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const now = Date.now();
  const rows = await db.query("SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC").all(userId) as AutomationRow[];
  return c.json({ automations: rows.map((row) => format(row, now)), scheduler: { running: AutomationScheduler.isRunning(), stats: AutomationScheduler.getStats() } });
});

automationsApi.get("/scheduler/status", async (c) => {
  const userId = c.get("userId") as string;
  const now = Date.now();
  const rows = await db.query("SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC").all(userId) as AutomationRow[];
  return c.json({
    scheduler: {
      running: AutomationScheduler.isRunning(),
      stats: AutomationScheduler.getStats(),
      tick_ms: Number(process.env.SCHEDULER_TICK_MS ?? 15_000),
      server_time: now,
    },
    automations: rows.map((row) => ({ ...format(row, now), due_in_ms: Math.max(0, (getNextRun(row, now) ?? now) - now) })),
  });
});

automationsApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId) as AutomationRow | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ automation: format(row) });
});

automationsApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const name = String(body.name ?? body.title ?? "").trim();
  const instruction = bodyInstruction(body) ?? "";
  if (!name || !instruction.trim()) return c.json({ error: "name/title and instruction are required" }, 400);
  const rrule = String(body.rrule ?? "FREQ=DAILY");
  const scheduleError = validateSchedule(rrule);
  if (scheduleError) return c.json({ error: scheduleError }, 400);
  const agentId = bodyAgentId(body);
  if (agentId !== undefined) {
    if (agentId !== null) {
      const agent = await db.query("SELECT id FROM agents WHERE id = ? AND owner_id = ?").get(agentId, userId);
      if (!agent) return c.json({ error: "agent not found" }, 400);
    }
  }
  let timezone = String(body.timezone ?? await getUserTimezone(userId));
  const timezoneError = validateTimezone(timezone);
  if (timezoneError) return c.json({ error: timezoneError }, 400);
  const deliveryMethod = String(body.delivery_method ?? body.deliveryMethod ?? "none").toLowerCase();
  if (!["none", "email", "sms", "telegram", "slack", "discord"].includes(deliveryMethod)) return c.json({ error: "invalid delivery_method" }, 400);
  const id = `auto_${nanoid()}`;
  const now = Date.now();
  await db.query(
    `INSERT INTO automations (id, owner_id, name, description, agent_id, rrule, prompt, active, enabled, timezone, delivery_method, delivery_target_json, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, name, String(body.description ?? ""), agentId ?? null, rrule, instruction, bodyActive(body) === false ? 0 : 1, bodyActive(body) === false ? 0 : 1, timezone, deliveryMethod, JSON.stringify(body.delivery_target ?? body.deliveryTarget ?? {}), body.model ? String(body.model) : null, now, now);
  const row = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(id, userId) as AutomationRow;
  return c.json({ automation: format(row) }, 201);
});

automationsApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const existing = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId) as AutomationRow | undefined;
  if (!existing) return c.json({ error: "not found" }, 404);
  const sets: string[] = [];
  const values: unknown[] = [];
  const name = body.name ?? body.title;
  const instruction = bodyInstruction(body);
  const agentId = bodyAgentId(body);
  const active = bodyActive(body);
  if (name !== undefined) { if (!String(name).trim()) return c.json({ error: "title cannot be empty" }, 400); sets.push("name = ?"); values.push(String(name)); }
  if (body.description !== undefined) { sets.push("description = ?"); values.push(String(body.description)); }
  if (instruction !== undefined) { if (!instruction.trim()) return c.json({ error: "instruction cannot be empty" }, 400); sets.push("prompt = ?"); values.push(instruction); }
  if (agentId !== undefined) {
    if (agentId !== null) {
      const agent = await db.query("SELECT id FROM agents WHERE id = ? AND owner_id = ?").get(agentId, userId);
      if (!agent) return c.json({ error: "agent not found" }, 400);
    }
    sets.push("agent_id = ?"); values.push(agentId);
  }
  if (body.rrule !== undefined) {
    const rrule = String(body.rrule);
    const scheduleError = validateSchedule(rrule);
    if (scheduleError) return c.json({ error: scheduleError }, 400);
    sets.push("rrule = ?"); values.push(rrule);
  }
  if (active !== undefined) { sets.push("active = ?"); values.push(active ? 1 : 0); sets.push("enabled = ?"); values.push(active ? 1 : 0); }
  if (body.timezone !== undefined) {
    const timezone = String(body.timezone);
    const timezoneError = validateTimezone(timezone);
    if (timezoneError) return c.json({ error: timezoneError }, 400);
    sets.push("timezone = ?"); values.push(timezone);
  }
  if (body.delivery_method !== undefined || body.deliveryMethod !== undefined) {
    const deliveryMethod = String(body.delivery_method ?? body.deliveryMethod ?? "none").toLowerCase();
    if (!["none", "email", "sms", "telegram", "slack", "discord"].includes(deliveryMethod)) return c.json({ error: "invalid delivery_method" }, 400);
    sets.push("delivery_method = ?"); values.push(deliveryMethod);
  }
  if (body.model !== undefined) { sets.push("model = ?"); values.push(body.model ? String(body.model) : null); }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
  sets.push("updated_at = ?"); values.push(Date.now(), c.req.param("id"), userId);
  await db.query(`UPDATE automations SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...values);
  const row = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId) as AutomationRow;
  return c.json({ automation: format(row) });
});

automationsApi.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const result = await db.query("DELETE FROM automations WHERE id = ? AND owner_id = ?").run(c.req.param("id"), userId);
  return c.json({ ok: result.changes > 0 });
});

automationsApi.get("/:id/runs", async (c) => {
  const userId = c.get("userId") as string;
  const auto = await db.query("SELECT id FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId);
  if (!auto) return c.json({ error: "not found" }, 404);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const runs = await db.query("SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT ?").all(c.req.param("id"), limit) as AutomationRunRow[];
  return c.json({ runs: runs.map((run) => ({ id: run.id, automationId: run.automation_id, automation_id: run.automation_id, status: run.status, startedAt: run.started_at, started_at: run.started_at, finishedAt: run.finished_at, finished_at: run.finished_at, output: run.output, error: run.error })) });
});

automationsApi.post("/:id/run-now", async (c) => {
  const userId = c.get("userId") as string;
  const row = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(c.req.param("id"), userId) as AutomationRow | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  fireAutomationById(row.id, userId).catch((error) => console.error(`[automations] manual run ${row.id} failed:`, error));
  return c.json({ ok: true });
});

// Diagnostic endpoint — shows raw DB state for debugging scheduler issues
automationsApi.get("/debug/diagnose", async (c) => {
  const userId = c.get("userId") as string;
  const allRows = await db.query("SELECT * FROM automations WHERE owner_id = ?").all(userId) as AutomationRow[];
  const now = Date.now();
  const rows = await db.query("SELECT * FROM automations WHERE owner_id = ? AND active::int = 1 AND enabled::int = 1").all(userId) as AutomationRow[];
  const due = rows.filter((row) => {
    const next = getNextRun(row, now);
    return next !== null && next <= now;
  });
  return c.json({
    total: allRows.length,
    active: rows.length,
    due: due.length,
    automations: allRows.map((r) => ({
      id: r.id, name: r.name, agent_id: r.agent_id,
      rrule: r.rrule, active: r.active, enabled: r.enabled,
      last_run_at: r.last_run_at, last_error: r.last_error,
      next_run_at: getNextRun(r, now),
      created_at: r.created_at,
    })),
    scheduler: AutomationScheduler.getStats(),
  });
});
