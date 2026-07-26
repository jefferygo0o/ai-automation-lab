import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { nextScheduledRun } from "./rrule.ts";

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
}

export function getNextRun(row: AutomationRow, now = Date.now()): number | null {
  if (row.active === 0 || row.enabled === 0) return null;
  try {
    return nextScheduledRun(row.rrule || "FREQ=DAILY", row.created_at, row.last_run_at ?? null, row.timezone || "UTC");
  } catch {
    return null;
  }
}

async function loadDueAutomations(now: number): Promise<AutomationRow[]> {
  const rows = await db.prepare("SELECT * FROM automations WHERE active = 1 AND enabled = 1").all() as AutomationRow[];
  return rows.filter((row) => {
    const next = getNextRun(row, now);
    return next !== null && next <= now;
  });
}

async function fireAutomation(auto: AutomationRow): Promise<void> {
  const runId = `run_${nanoid()}`;
  const startedAt = Date.now();
  await db.prepare("INSERT INTO automation_runs (id, automation_id, status, started_at) VALUES (?, ?, 'running', ?)").run(runId, auto.id, startedAt);

  try {
    const { runAgentTurn } = await import("../agents/runtime.ts");
    const { ChatStore } = await import("../chats/index.ts");
    const agentId = auto.agent_id || await resolveCurrentAgent(auto.owner_id);
    if (!agentId) throw new Error("no current agent available for automation");
    const chat = await ChatStore.create(auto.owner_id, agentId, `automation: ${auto.name}`);
    await db.prepare("UPDATE automations SET agent_id = ? WHERE id = ? AND agent_id IS NULL").run(agentId, auto.id);
    let output = "";
    let error: string | null = null;
    await new Promise<void>((resolve) => {
      runAgentTurn(auto.owner_id, chat.id, auto.prompt || auto.description || "(no instruction)", (event) => {
        if (event.type === "token") output += event.delta;
        else if (event.type === "message") output = event.content;
        else if (event.type === "error") error = event.message;
      }, { maxToolCalls: 30, modelOverride: auto.model || undefined }).then(() => resolve()).catch((cause) => { error = cause?.message ?? String(cause); resolve(); });
    });

    const finishedAt = Date.now();
    const status = error ? "failed" : "completed";
    await db.prepare("UPDATE automation_runs SET status = ?, output = ?, error = ?, finished_at = ? WHERE id = ?").run(status, output.slice(0, 100_000), error, finishedAt, runId);
    await db.prepare("UPDATE automations SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(finishedAt, error, finishedAt, auto.id);
    console.log(`[scheduler] ran automation ${auto.id} (${auto.name}) — ${status} (${finishedAt - startedAt}ms)`);
  } catch (cause: any) {
    const finishedAt = Date.now();
    const message = cause?.message ?? String(cause);
    await db.prepare("UPDATE automation_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(message, finishedAt, runId);
    await db.prepare("UPDATE automations SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(finishedAt, message, finishedAt, auto.id);
    console.error(`[scheduler] automation ${auto.id} (${auto.name}) failed:`, message);
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
  if (running) return;
  running = true;
  const start = Date.now();
  try {
    for (const automation of await loadDueAutomations(Date.now())) {
      if (inFlight.has(automation.id)) continue;
      inFlight.add(automation.id);
      totalFires++;
      fireAutomation(automation).catch((error) => { totalFailures++; console.error(`[scheduler] fire ${automation.id} crash:`, error); }).finally(() => inFlight.delete(automation.id));
    }
  } finally {
    lastTickAt = Date.now();
    lastTickDurationMs = lastTickAt - start;
    running = false;
  }
}
