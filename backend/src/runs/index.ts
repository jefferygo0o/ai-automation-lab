/**
 * Run store — tracks each "turn" of a chat (one user message + N tool calls
 * + 1 assistant final reply) and the individual tool invocations within it.
 *
 * This is what the UI surfaces as "execution logs" and what the system uses
 * to charge tokens, replay runs, and audit tool use.
 */

import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { createSnapshot } from "../snapshots/index.ts";

export interface Run {
  id: string;
  chatId: string;
  userId: string;
  agentId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  finishedAt: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  errorMessage?: string | null;
  agentHash: string;
  agentRuntime: string;
}

export interface ToolInvocation {
  id: string;
  runId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  status: "pending" | "ok" | "error" | "denied";
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number;
  sandboxId: string | null;
}

interface RunRow {
  id: string;
  chat_id: string;
  user_id: string;
  agent_id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_cents: number;
  error_message: string | null;
  agent_hash: string | null;
  agent_runtime: string | null;
}

interface ToolRow {
  id: string;
  run_id: string;
  tool_name: string;
  arguments_json: string;
  result_json: string | null;
  status: string;
  error: string | null;
  started_at: number;
  finished_at: number | null;
  duration_ms: number;
  sandbox_id: string | null;
}

function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    chatId: r.chat_id,
    userId: r.user_id,
    agentId: r.agent_id,
    status: r.status as Run["status"],
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    totalTokens: r.total_tokens,
    costCents: r.cost_cents,
    errorMessage: r.error_message,
    agentHash: r.agent_hash ?? "",
    agentRuntime: r.agent_runtime ?? "bun",
  };
}

function rowToTool(r: ToolRow): ToolInvocation {
  let args: unknown = r.arguments_json;
  let result: unknown = r.result_json;
  try { args = JSON.parse(r.arguments_json); } catch { /* keep as string */ }
  try { result = r.result_json == null ? null : JSON.parse(r.result_json); } catch { result = r.result_json; }
  return {
    id: r.id,
    runId: r.run_id,
    toolName: r.tool_name,
    arguments: args,
    result,
    status: r.status as ToolInvocation["status"],
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    sandboxId: r.sandbox_id,
  };
}

export const RunStore = {
  async start(chatId: string, userId: string, agentId: string): Promise<Run> {
    const id = `run_${nanoid(12)}`;
    const now = Date.now();
    const aRow = await db.prepare(`SELECT hash, runtime FROM agents WHERE id = ?`).get(agentId) as
      | { hash: string | null; runtime: string | null }
      | undefined;
    const agentHash = aRow?.hash ?? "";
    const agentRuntime = aRow?.runtime ?? "bun";
    await db.prepare(
      `INSERT INTO runs (id, chat_id, user_id, agent_id, status, started_at, finished_at, prompt_tokens, completion_tokens, total_tokens, cost_cents, error_message, agent_hash, agent_runtime)
       VALUES (?, ?, ?, ?, 'running', ?, NULL, 0, 0, 0, 0, NULL, ?, ?)`,
    ).run(id, chatId, userId, agentId, now, agentHash, agentRuntime);
    return {
      id, chatId, userId, agentId, status: "running",
      startedAt: now, finishedAt: null,
      promptTokens: 0, completionTokens: 0, totalTokens: 0, costCents: 0,
      agentHash, agentRuntime,
    };
  },

  async complete(id: string, usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) {
    const now = Date.now();
    if (usage) {
      await db.prepare(
        `UPDATE runs SET status = 'completed', finished_at = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ? WHERE id = ?`,
      ).run(now, usage.promptTokens ?? 0, usage.completionTokens ?? 0, usage.totalTokens ?? 0, id);
    } else {
      await db.prepare(`UPDATE runs SET status = 'completed', finished_at = ? WHERE id = ?`).run(now, id);
    }
    // Snapshot agent files in the background. Failure must not affect run completion.
    try {
      const run = await RunStore.get(id);
      if (run) {
        createSnapshot({ agentId: run.agentId, trigger: "run_complete", runId: id })
          .catch((e) => console.warn(`[runs] snapshot error (complete):`, e?.message ?? e));
      }
    } catch (e: any) {
      console.warn(`[runs] snapshot lookup error (complete):`, e?.message ?? e);
    }
  },

  async fail(id: string, error: string) {
    await db.prepare(`UPDATE runs SET status = 'failed', finished_at = ?, error_message = ? WHERE id = ?`)
      .run(Date.now(), error, id);
    try {
      const run = await RunStore.get(id);
      if (run) {
        createSnapshot({ agentId: run.agentId, trigger: "run_fail", runId: id })
          .catch((e) => console.warn(`[runs] snapshot error (fail):`, e?.message ?? e));
      }
    } catch (e: any) {
      console.warn(`[runs] snapshot lookup error (fail):`, e?.message ?? e);
    }
  },

  async addUsage(id: string, usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) {
    await db.prepare(
      `UPDATE runs SET prompt_tokens = prompt_tokens + ?, completion_tokens = completion_tokens + ?, total_tokens = total_tokens + ? WHERE id = ?`,
    ).run(usage.promptTokens ?? 0, usage.completionTokens ?? 0, usage.totalTokens ?? 0, id);
  },

  async get(id: string, userId?: string): Promise<Run | null> {
    const row = userId
      ? (await db.prepare(`SELECT * FROM runs WHERE id = ? AND user_id = ?`).get(id, userId) as RunRow | undefined)
      : (await db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined);
    return row ? rowToRun(row) : null;
  },

  async listForChat(chatId: string, limit = 50): Promise<Run[]> {
    return await (await db.prepare(
      `SELECT * FROM runs WHERE chat_id = ? ORDER BY started_at DESC LIMIT ?`,
    ).all(chatId, limit) as RunRow[]).map(rowToRun);
  },

  async listForUser(userId: string, limit = 100): Promise<Run[]> {
    return await (await db.prepare(
      `SELECT * FROM runs WHERE user_id = ? ORDER BY started_at DESC LIMIT ?`,
    ).all(userId, limit) as RunRow[]).map(rowToRun);
  },

  // ---- tool invocations ----

  async recordToolStart(runId: string, toolName: string, args: unknown, sandboxId: string | null = null): Promise<ToolInvocation> {
    const id = `inv_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO tool_invocations (id, run_id, tool_name, arguments_json, result_json, status, error, started_at, finished_at, duration_ms, sandbox_id)
       VALUES (?, ?, ?, ?, NULL, 'pending', NULL, ?, NULL, 0, ?)`,
    ).run(id, runId, toolName, JSON.stringify(args ?? {}), now, sandboxId);
    return { id, runId, toolName, arguments: args, result: null, status: "pending", error: null, startedAt: now, finishedAt: null, durationMs: 0, sandboxId };
  },

  async recordToolFinish(id: string, status: "ok" | "error" | "denied", result: unknown, error: string | null = null) {
    const now = Date.now();
    const start = await db.prepare(`SELECT started_at FROM tool_invocations WHERE id = ?`).get(id) as { started_at: number } | undefined;
    const dur = start ? now - start.started_at : 0;
    await db.prepare(
      `UPDATE tool_invocations SET status = ?, result_json = ?, error = ?, finished_at = ?, duration_ms = ? WHERE id = ?`,
    ).run(status, JSON.stringify(result ?? null), error, now, dur, id);
  },

  async listForRun(runId: string): Promise<ToolInvocation[]> {
    return await (await db.prepare(
      `SELECT * FROM tool_invocations WHERE run_id = ? ORDER BY started_at ASC`,
    ).all(runId) as ToolRow[]).map(rowToTool);
  },
};
