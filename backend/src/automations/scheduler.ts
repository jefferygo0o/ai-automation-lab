/**
 * Automation scheduler.
 *
 * Background loop that polls the `automations` table every ~15 seconds for
 * active automations whose next-run time has elapsed, and fires them.
 *
 * Each fire:
 *   - creates a new `automation_runs` row with status=running
 *   - loads the agent, runs an agent turn with the stored prompt as the user
 *     message, and captures the agent's final message as the run output
 *   - updates the run row with status=completed|failed + output/error + finished_at
 *   - updates the parent automation row with last_run_at and last_error
 *   - never throws — errors are recorded on the run and the automation
 *     stays active for the next cycle
 *
 * Started automatically by server.ts at boot. Safe to import twice (idempotent).
 */
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

interface AutomationRow {
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

interface AutomationRunRow {
  id: string;
  automation_id: string;
  status: string;
  output: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

/**
 * Calculate when an automation is next due.
 *
 * Cadence is anchored to created_at (or last fire's *intended* time, never the
 * wall-clock moment a slow run actually finished). On server restart we catch
 * up: if multiple intervals have elapsed since the last due time, the tick
 * loop will fire it once and then re-anchor from there.
 */
export function getNextRun(row: AutomationRow, now: number = Date.now()): number {
  const rrule = row.rrule || "FREQ=MINUTELY;INTERVAL=1";

  // Anchor: created_at, or last fire time. After the tick loop fires an
  // automation, last_run_at == wall-clock time of that fire, which IS the
  // most recent scheduled time. From that anchor we compute the next boundary.
  const anchor = row.last_run_at ?? row.created_at;

  // Always schedule the *next* boundary strictly after the anchor — never the
  // anchor itself — so a fresh tick after a fire doesn't immediately re-fire.
  // Otherwise now==anchor would return anchor and the loop would spin.
  const computeNext = (intervalMs: number) => {
    if (now <= anchor + intervalMs) return anchor + intervalMs;
    const elapsed = now - anchor;
    const intervalsElapsed = Math.floor(elapsed / intervalMs);
    return anchor + (intervalsElapsed + 1) * intervalMs;
  };

  if (rrule.startsWith("FREQ=MINUTELY")) {
    const m = rrule.match(/INTERVAL=(\d+)/);
    const interval = Math.max(1, m ? parseInt(m[1]) : 1);
    return computeNext(interval * 60_000);
  }
  if (rrule.startsWith("FREQ=HOURLY")) {
    const m = rrule.match(/INTERVAL=(\d+)/);
    const interval = Math.max(1, m ? parseInt(m[1]) : 1);
    return computeNext(interval * 3_600_000);
  }
  if (rrule.startsWith("FREQ=DAILY")) {
    const next = anchor + 86_400_000;
    return now < next ? next : anchor + Math.ceil((now - anchor) / 86_400_000) * 86_400_000;
  }
  if (rrule.startsWith("FREQ=WEEKLY")) {
    const next = anchor + 7 * 86_400_000;
    return now < next ? next : anchor + Math.ceil((now - anchor) / (7 * 86_400_000)) * 7 * 86_400_000;
  }
  if (rrule.startsWith("FREQ=MONTHLY")) {
    const next = anchor + 30 * 86_400_000;
    return now < next ? next : anchor + Math.ceil((now - anchor) / (30 * 86_400_000)) * 30 * 86_400_000;
  }
  // Unrecognised — default to every minute, anchored.
  if (now <= anchor) return anchor;
  const elapsed = now - anchor;
  const intervalsElapsed = Math.floor(elapsed / 60_000);
  return anchor + (intervalsElapsed + 1) * 60_000;
}

function loadDueAutomations(now: number): AutomationRow[] {
  // An automation is due if it is active AND (last_run_at + interval) <= now.
  // For never-run automations we still respect the schedule relative to created_at.
  const rows = db.prepare(
    "SELECT * FROM automations WHERE active = 1"
  ).all() as AutomationRow[];
  return rows.filter((r) => getNextRun(r) <= now);
}

/**
 * Fire one automation: run the agent turn with the stored prompt, capture
 * output, record the run row.
 *
 * Imports runAgentTurn lazily so this module can be loaded without
 * pulling in the LLM stack on cold paths (tests, migrations).
 */
async function fireAutomation(auto: AutomationRow): Promise<void> {
  const runId = `run_${nanoid()}`;
  const startedAt = Date.now();

  db.prepare(
    `INSERT INTO automation_runs (id, automation_id, status, started_at)
     VALUES (?, ?, 'running', ?)`
  ).run(runId, auto.id, startedAt);

  // Capture the agent's final message — we'll re-use the agent's chat
  // transport: create a transient chat, send the prompt, collect the
  // streamed text into `output`.
  try {
    const { runAgentTurn } = await import("../agents/runtime.ts");
    const { ChatStore } = await import("../chats/index.ts");
    const chat = ChatStore.create(auto.owner_id, auto.agent_id, `automation: ${auto.name}`);

    let output = "";
    let error: string | null = null;
    await new Promise<void>((resolve) => {
      runAgentTurn(
        auto.owner_id,
        chat.id,
        auto.prompt || auto.description || "(no prompt)",
        (evt) => {
          if (evt.type === "token") output += evt.delta;
          else if (evt.type === "message" && typeof evt.content === "string") {
            output = evt.content;
          } else if (evt.type === "error") error = evt.message;
        },
        { signal: undefined }
      ).then(resolve).catch((e) => {
        error = e?.message ?? String(e);
        resolve();
      });
    });

    const finishedAt = Date.now();
    const status = error ? "failed" : "completed";
    db.prepare(
      `UPDATE automation_runs
         SET status = ?, output = ?, error = ?, finished_at = ?
       WHERE id = ?`
    ).run(status, output.slice(0, 100_000), error, finishedAt, runId);
    db.prepare(
      `UPDATE automations
         SET last_run_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(finishedAt, error, finishedAt, auto.id);

    console.log(
      `[scheduler] ran automation ${auto.id} (${auto.name}) — ${status} (${finishedAt - startedAt}ms, output=${output.length} chars)`,
    );
  } catch (e: any) {
    const finishedAt = Date.now();
    const msg = e?.message ?? String(e);
    db.prepare(
      `UPDATE automation_runs
         SET status = 'failed', error = ?, finished_at = ?
       WHERE id = ?`
    ).run(msg, finishedAt, runId);
    db.prepare(
      `UPDATE automations
         SET last_run_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(finishedAt, msg, finishedAt, auto.id);
    console.error(`[scheduler] automation ${auto.id} (${auto.name}) failed:`, msg);
  }
}

/**
 * Fire a single automation by id, returning the created run_id.
 * Used by the manual /run-now API endpoint. In-flight guard prevents
 * double-firing if a tick is already running it.
 */
export async function fireAutomationById(automationId: string): Promise<string> {
  const row = db.prepare("SELECT * FROM automations WHERE id = ?").get(automationId) as AutomationRow | undefined;
  if (!row) throw new Error("automation not found");
  if (inFlight.has(row.id)) throw new Error("already in flight");
  inFlight.add(row.id);
  try {
    await fireAutomation(row);
  } finally {
    inFlight.delete(row.id);
  }
  // Return the most recent run row for this automation
  const r = db.prepare(
    "SELECT id FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT 1"
  ).get(automationId) as { id: string } | undefined;
  return r?.id ?? "";
}

// ---- Loop control ----

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 15_000);
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let inFlight: Set<string> = new Set();
let started = false;
let lastTickAt: number | null = null;
let lastTickDurationMs: number | null = null;
let totalFires = 0;
let totalFailures = 0;

export const AutomationScheduler = {
  start() {
    if (started) return;
    started = true;
    console.log(`[scheduler] starting (tick=${TICK_MS}ms)`);
    // First sweep on boot after a short delay so the rest of the app finishes booting.
    setTimeout(() => {
      tick().catch((e) => console.error("[scheduler] boot tick error:", e));
    }, 2000);
    timer = setInterval(() => {
      tick().catch((e) => console.error("[scheduler] tick error:", e));
    }, TICK_MS);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
  },
  isRunning() {
    return started;
  },
  getStats() {
    return {
      started,
      tickMs: TICK_MS,
      lastTickAt,
      lastTickDurationMs,
      inFlight: Array.from(inFlight),
      totalFires,
      totalFailures,
    };
  },
  /** Manually fire a single automation now (admin/debug). */
  async fireNow(automationId: string): Promise<{ ok: boolean; error?: string }> {
    const row = db.prepare("SELECT * FROM automations WHERE id = ?").get(automationId) as AutomationRow | undefined;
    if (!row) return { ok: false, error: "not found" };
    if (inFlight.has(row.id)) return { ok: false, error: "already in flight" };
    inFlight.add(row.id);
    fireAutomation(row)
      .catch((e) => { totalFailures++; console.error(`[scheduler] manual fire ${row.id} crash:`, e); })
      .finally(() => inFlight.delete(row.id));
    return { ok: true };
  },
  /** Force a single tick (used by tests). */
  async tickNow() {
    return tick();
  },
};

async function tick(): Promise<void> {
  if (running) return; // overlap guard
  running = true;
  const start = Date.now();
  try {
    const due = loadDueAutomations(Date.now());
    for (const auto of due) {
      if (inFlight.has(auto.id)) continue; // skip if previous fire still running
      inFlight.add(auto.id);
      totalFires++;
      fireAutomation(auto)
        .catch((e) => { totalFailures++; console.error(`[scheduler] fire ${auto.id} crash:`, e); })
        .finally(() => inFlight.delete(auto.id));
    }
  } finally {
    lastTickAt = Date.now();
    lastTickDurationMs = lastTickAt - start;
    running = false;
  }
}
