import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { nextScheduledRun } from "./rrule.ts";
import { deliverResult, notifyFailure } from "./delivery.ts";

const RUN_TIMEOUT_MS = Number(process.env.AUTOMATION_RUN_TIMEOUT_MS ?? 5 * 60 * 1000); // default 5 minutes

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
  created_at: number;
  updated_at: number;
  timezone?: string;
  model?: string | null;
  delivery_method?: string;
  delivery_target_json?: string;
}

export function getNextRun(row: AutomationRow, now = Date.now()): number | null {
  // Handle both BOOLEAN (Supabase pg driver) and INTEGER column types.
  // pg returns booleans as true/false, SQLite/bun:sqlite returns 0/1.
  const isActive = row.active === 1 || row.active === true;
  const isEnabled = row.enabled === 1 || row.enabled === true || row.enabled === undefined;
  if (!isActive || !isEnabled) return null;
  try {
    return nextScheduledRun(row.rrule || "FREQ=DAILY", row.created_at, row.last_run_at ?? null, row.timezone || "UTC");
  } catch (e: any) {
    console.error(`[scheduler] getNextRun error for ${row.id}:`, e?.message ?? e);
    return null;
  }
}

async function loadDueAutomations(now: number): Promise<AutomationRow[]> {
  // Use active::int to handle both BOOLEAN (Supabase) and INTEGER column types.
  // PostgreSQL: true::int = 1, false::int = 0, 1::int = 1, 0::int = 0.
  let rows: AutomationRow[];
  try {
    rows = await db.prepare("SELECT * FROM automations WHERE active::int = 1 AND enabled::int = 1").all() as AutomationRow[];
  } catch (e: any) {
    console.error("[scheduler] loadDueAutomations query failed, trying fallback:", e?.message ?? e);
    try {
      const all = await db.prepare("SELECT * FROM automations").all() as AutomationRow[];
      rows = all.filter((r) => {
        const a = r.active;
        const e2 = r.enabled;
        return (a === 1 || a === true) && (e2 === 1 || e2 === true);
      });
    } catch (e2: any) {
      console.error("[scheduler] fallback query also failed:", e2?.message ?? e2);
      return [];
    }
  }
  const due = rows.filter((row) => {
    const next = getNextRun(row, now);
    return next !== null && next <= now;
  });
  if (rows.length > 0 && due.length === 0) {
    const summary = rows.map((r) => `${r.id}(next=${getNextRun(r, now)}, active=${r.active}, enabled=${r.enabled})`).join(", ");
    console.log(`[scheduler] ${rows.length} active automations found, 0 due. Details: ${summary}`);
  }
  return due;
}

async function fireAutomation(auto: AutomationRow): Promise<void> {
  const runId = `run_${nanoid()}`;
  const startedAt = Date.now();
  console.log(`[scheduler] fireAutomation START id=${auto.id} name="${auto.name}" agent=${auto.agent_id ?? "(none)"} rrule=${auto.rrule}`);
  try {
    await db.prepare("INSERT INTO automation_runs (id, automation_id, status, started_at) VALUES (?, ?, 'running', ?)").run(runId, auto.id, startedAt);
  } catch (e: any) {
    console.error(`[scheduler] failed to insert automation_run for ${auto.id}:`, e?.message ?? e);
    throw e;
  }

  // Set up abort controller with timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);

  try {
    const { runAgentTurn } = await import("../agents/runtime.ts");
    const { ChatStore } = await import("../chats/index.ts");
    const agentId = auto.agent_id || await resolveCurrentAgent(auto.owner_id);
    if (!agentId) throw new Error("no current agent available for automation");
    console.log(`[scheduler] resolved agentId=${agentId} for automation ${auto.id}`);
    const chat = await ChatStore.create(auto.owner_id, agentId, `automation: ${auto.name}`);
    console.log(`[scheduler] created chat ${chat.id} for automation ${auto.id}`);
    await db.prepare("UPDATE automations SET agent_id = ? WHERE id = ? AND agent_id IS NULL").run(agentId, auto.id);
    let output = "";
    let error: string | null = null;
    await new Promise<void>((resolve) => {
      runAgentTurn(auto.owner_id, chat.id, auto.prompt || auto.description || "(no instruction)", (event) => {
        if (event.type === "token") output += event.delta;
        else if (event.type === "message") output = event.content;
        else if (event.type === "error") error = event.message;
      }, { maxToolCalls: 30, signal: controller.signal, modelOverride: auto.model || undefined }).then(() => resolve()).catch((cause) => { error = cause?.message ?? String(cause); resolve(); });
    });

    clearTimeout(timeoutHandle);
    const finishedAt = Date.now();
    const timedOut = controller.signal.aborted && !error;
    const status = timedOut ? "failed" : error ? "failed" : "completed";
    const errorMessage = timedOut ? `automation timed out after ${RUN_TIMEOUT_MS / 1000}s` : error;
    await db.prepare("UPDATE automation_runs SET status = ?, output = ?, error = ?, finished_at = ? WHERE id = ?").run(status, output.slice(0, 100_000), errorMessage, finishedAt, runId);
    await db.prepare("UPDATE automations SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(finishedAt, errorMessage, finishedAt, auto.id);
    console.log(`[scheduler] ran automation ${auto.id} (${auto.name}) — ${status} (${finishedAt - startedAt}ms)`);

    // Deliver result if configured
    if (status === "completed") {
      await deliverResult(auto, output, "completed", runId).catch((e) => console.error(`[scheduler] delivery failed for ${auto.id}:`, e));
    }
    // Notify on failure (even when delivery is "none")
    if (status === "failed" && errorMessage) {
      await notifyFailure(auto, errorMessage, runId).catch((e) => console.error(`[scheduler] failure notification failed for ${auto.id}:`, e));
    }
  } catch (cause: any) {
    clearTimeout(timeoutHandle);
    const finishedAt = Date.now();
    const message = cause?.message ?? String(cause);
    console.error(`[scheduler] automation ${auto.id} (${auto.name}) EXCEPTION:`, message);
    try {
      await db.prepare("UPDATE automation_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(message, finishedAt, runId);
      await db.prepare("UPDATE automations SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(finishedAt, message, finishedAt, auto.id);
    } catch (updateErr: any) {
      console.error(`[scheduler] failed to record error for ${auto.id}:`, updateErr?.message ?? updateErr);
    }
    console.error(`[scheduler] automation ${auto.id} (${auto.name}) failed:`, message);
    // Always notify on failure
    await notifyFailure(auto, message, runId).catch((e) => console.error(`[scheduler] failure notification failed for ${auto.id}:`, e));
  }
}

async function resolveCurrentAgent(ownerId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM agents WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 1").get(ownerId) as { id?: string } | null;
  return row?.id ?? null;
}

export async function fireAutomationById(automationId: string, ownerId?: string): Promise<string> {
  const row = await db.prepare("SELECT * FROM automations WHERE id = ?" + (ownerId ? " AND owner_id = ?" : "")).get(...(ownerId ? [automationId, ownerId] : [automationId])) as AutomationRow | null;
  if (!row) throw new Error("automation not found");
  if (inFlight.has(row.id)) throw new Error("already in flight");
  inFlight.add(row.id);
  try { await fireAutomation(row); } finally { inFlight.delete(row.id); }
  const run = await db.prepare("SELECT id FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT 1").get(automationId) as { id?: string } | null;
  return run?.id ?? "";
}

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 15_000);
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let started = false;
let lastTickAt: number | null = null;
let lastTickDurationMs: number | null = null;
let totalFires = 0;
let totalFailures = 0;
const inFlight = new Set<string>();

export const AutomationScheduler = {
  start() {
    if (started) return;
    started = true;
    console.log(`[scheduler] starting (tick=${TICK_MS}ms)`);
    setTimeout(() => { tick().catch((error) => console.error("[scheduler] boot tick error:", error)); }, 2_000);
    timer = setInterval(() => { tick().catch((error) => console.error("[scheduler] tick error:", error)); }, TICK_MS);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
  },
  isRunning: () => started,
  getStats: () => ({ started, tickMs: TICK_MS, lastTickAt, lastTickDurationMs, inFlight: Array.from(inFlight), totalFires, totalFailures }),
  async fireNow(automationId: string) {
    try { await fireAutomationById(automationId); return { ok: true }; }
    catch (error: any) { return { ok: false, error: error?.message ?? String(error) }; }
  },
  tickNow: () => tick(),
};

async function tick(): Promise<void> {
  if (running) {
    console.warn("[scheduler] tick skipped — previous tick still running");
    return;
  }
  running = true;
  const start = Date.now();

  // Safety: if the DB query hangs, release the lock after 30s so future ticks aren't blocked forever.
  const safetyTimeout = setTimeout(() => {
    if (running) {
      console.error("[scheduler] tick safety timeout — force-releasing lock after 30s");
      running = false;
    }
  }, 30_000);

  try {
    const due = await loadDueAutomations(Date.now());
    console.log(`[scheduler] tick: ${due.length} automations due`);
    for (const automation of due) {
      if (inFlight.has(automation.id)) {
        console.log(`[scheduler] skipping ${automation.id} — already in flight`);
        continue;
      }
      inFlight.add(automation.id);
      totalFires++;
      console.log(`[scheduler] firing automation ${automation.id} ("${automation.name}") rrule=${automation.rrule}`);
      fireAutomation(automation).catch((error) => { totalFailures++; console.error(`[scheduler] fire ${automation.id} crash:`, error); }).finally(() => inFlight.delete(automation.id));
    }
  } catch (e: any) {
    console.error("[scheduler] tick error:", e?.message ?? e);
  } finally {
    clearTimeout(safetyTimeout);
    lastTickAt = Date.now();
    lastTickDurationMs = lastTickAt - start;
    running = false;
  }
}
