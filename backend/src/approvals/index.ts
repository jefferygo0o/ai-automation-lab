/**
 * Approvals — human-in-the-loop gating for agent actions.
 *
 * Flow:
 *   1. Agent calls `propose_plan` tool with a structured plan.
 *   2. We persist a `pending` approval tied to (chat, run, agent).
 *   3. The chat SSE stream blocks on a Promise that resolves on
 *      approve/reject (a setTimeout-backed poll).
 *   4. UI shows a card, user clicks Approve/Reject/Edit-and-Approve.
 *   5. The Promise resolves and the agent continues (or aborts).
 *
 * Approvals are surfaced via SSE so the frontend gets a live update
 * without polling, but we still poll the DB on the runtime side as a
 * safety net (in case the SSE message was missed).
 */
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "auto-approved";

export interface ApprovalRequest {
  id: string;
  ownerId: string;
  chatId: string;
  runId: string;
  agentId: string;
  kind: "plan" | "tool" | "shell" | "secret-use" | "destructive";
  title: string;
  body: string;             // Markdown explanation
  payload: Record<string, unknown>;  // the proposed action (tool name + args, etc.)
  status: ApprovalStatus;
  response: string | null;  // user feedback text (if rejected/edited)
  createdAt: number;
  resolvedAt: number | null;
  expiresAt: number;
}

interface Row {
  id: string;
  owner_id: string;
  chat_id: string;
  run_id: string;
  agent_id: string;
  kind: string;
  title: string;
  body: string;
  payload_json: string;
  status: string;
  response: string | null;
  created_at: number;
  resolved_at: number | null;
  expires_at: number;
}

function rowToApproval(r: Row): ApprovalRequest {
  return {
    id: r.id,
    ownerId: r.owner_id,
    chatId: r.chat_id,
    runId: r.run_id,
    agentId: r.agent_id,
    kind: r.kind as ApprovalRequest["kind"],
    title: r.title,
    body: r.body,
    payload: r.payload_json ? JSON.parse(r.payload_json) : {},
    status: r.status as ApprovalStatus,
    response: r.response,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    expiresAt: r.expires_at,
  };
}

const DEFAULT_TTL_MS = 5 * 60_000; // 5 min to approve before auto-expire

export const Approvals = {
  create(input: {
    ownerId: string;
    chatId: string;
    runId: string;
    agentId: string;
    kind: ApprovalRequest["kind"];
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    ttlMs?: number;
  }): ApprovalRequest {
    const id = `apr_${nanoid(12)}`;
    const now = Date.now();
    const expiresAt = now + (input.ttlMs ?? DEFAULT_TTL_MS);
    db.prepare(
      `INSERT INTO approval_requests (id, owner_id, chat_id, run_id, agent_id, kind, title, body, payload_json, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      id,
      input.ownerId,
      input.chatId,
      input.runId,
      input.agentId,
      input.kind,
      input.title,
      input.body,
      JSON.stringify(input.payload ?? {}),
      now,
      expiresAt,
    );
    return Approvals.get(id)!;
  },

  get(id: string): ApprovalRequest | null {
    const row = db.prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(id) as Row | undefined;
    return row ? rowToApproval(row) : null;
  },

  getForRun(runId: string): ApprovalRequest[] {
    return (db.prepare(
      `SELECT * FROM approval_requests WHERE run_id = ? ORDER BY created_at DESC`
    ).all(runId) as Row[]).map(rowToApproval);
  },

  listPending(ownerId: string): ApprovalRequest[] {
    return (db.prepare(
      `SELECT * FROM approval_requests WHERE owner_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC`
    ).all(ownerId, Date.now()) as Row[]).map(rowToApproval);
  },

  resolve(id: string, decision: "approved" | "rejected" | "auto-approved", response?: string): ApprovalRequest | null {
    const now = Date.now();
    const r = db.prepare(
      `UPDATE approval_requests SET status = ?, response = ?, resolved_at = ? WHERE id = ? AND status = 'pending'`
    ).run(decision, response ?? null, now, id);
    if (r.changes === 0) return null;
    return Approvals.get(id);
  },

  expireOverdue(): number {
    const r = db.prepare(
      `UPDATE approval_requests SET status = 'expired', resolved_at = ? WHERE status = 'pending' AND expires_at < ?`
    ).run(Date.now(), Date.now());
    return r.changes;
  },

  /**
   * Wait for an approval to resolve. Polls every 500ms; returns the resolved
   * approval. If the runtime aborts (signal), returns a "rejected" view.
   */
  async waitFor(
    id: string,
    signal?: AbortSignal,
  ): Promise<ApprovalRequest> {
    const start = Date.now();
    while (Date.now() - start < 30 * 60_000) {
      if (signal?.aborted) {
        // mark as rejected due to abort
        Approvals.resolve(id, "rejected", "agent run aborted by user");
        return Approvals.get(id) ?? { ...this.fakeRejected(id), status: "rejected", response: "aborted" };
      }
      const a = Approvals.get(id);
      if (a && a.status !== "pending") return a;
      if (a && a.expiresAt < Date.now()) {
        Approvals.resolve(id, "expired", "approval expired before response");
        return Approvals.get(id)!;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    Approvals.resolve(id, "expired", "approval wait timeout");
    return Approvals.get(id) ?? this.fakeRejected(id);
  },

  fakeRejected(id: string): ApprovalRequest {
    return {
      id,
      ownerId: "", chatId: "", runId: "", agentId: "",
      kind: "plan", title: "(unknown)", body: "",
      payload: {}, status: "rejected", response: "lookup failed",
      createdAt: Date.now(), resolvedAt: Date.now(), expiresAt: 0,
    };
  },
};
