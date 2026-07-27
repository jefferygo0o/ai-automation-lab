/**
 * Audit log — every privileged action is recorded for compliance and debugging.
 *
 *   audit({ ownerId, actor, action, target, metadata })
 *
 * `actor` is "user" (interacting via API), "agent" (tool calls), "system"
 * (background jobs, schedulers), or "webhook" (incoming HTTP triggers).
 */
import { nanoid } from "nanoid";
import { getPool } from "../db/index.ts";
import { getRequestClient } from "../db/user_context.ts";

export type AuditActor = "user" | "agent" | "system" | "webhook" | "anonymous";

export interface AuditEvent {
  id: string;
  ownerId: string;
  actor: AuditActor;
  action: string;             // e.g. "agent.create", "secret.write", "tool.execute"
  targetId?: string;
  targetType?: string;        // e.g. "agent", "skill", "automation"
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  at: number;
}

export const Audit = {
  async record(input: Omit<AuditEvent, "id" | "at">): Promise<void> {
    try {
      const id = `aud_${nanoid(12)}`;
      const at = Date.now();
      const values = [
        id,
        input.ownerId,
        input.actor,
        input.action,
        input.targetId ?? null,
        input.targetType ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ip ?? null,
        input.userAgent ?? null,
        at,
      ];
      const INSERT =
        `INSERT INTO audit_log (id, owner_id, actor, action, target_id, target_type, metadata_json, ip, user_agent, at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

      const requestClient = getRequestClient();
      if (requestClient) {
        // Inside a request — use a savepoint so an RLS failure on audit_log
        // doesn't poison the caller's transaction (the request can continue).
        const sp = `sp_audit_${nanoid(6)}`;
        await requestClient.query(`SAVEPOINT ${sp}`);
        try {
          await requestClient.query(INSERT, values);
          await requestClient.query(`RELEASE SAVEPOINT ${sp}`);
        } catch (e) {
          await requestClient.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
          console.error("[audit] failed to record event (request path):", e?.message ?? e);
        }
      } else {
        // Background task (scheduler, boot) — no request context, so we need
        // to set RLS context explicitly for the INSERT to pass the WITH CHECK policy.
        const client = await getPool().connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL role = 'authenticated'");
          const claims = JSON.stringify({ sub: input.ownerId, role: "authenticated" });
          await client.query(`SET LOCAL request.jwt.claims = '${claims.replace(/'/g, "''")}'`);
          await client.query(INSERT, values);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          console.error("[audit] failed to record event (background path):", e?.message ?? e);
        } finally {
          client.release();
        }
      }
    } catch (e) {
      console.error("[audit] failed to record event:", e?.message ?? e);
    }
  },

  async list(ownerId: string, opts: { action?: string; targetType?: string; limit?: number; offset?: number } = {}): Promise<AuditEvent[]> {
    const limit = Math.min(opts.limit ?? 100, 1000);
    const offset = opts.offset ?? 0;
    const params: (string | number)[] = [ownerId];
    let where = `owner_id = ?`;
    if (opts.action) { where += ` AND action = ?`; params.push(opts.action); }
    if (opts.targetType) { where += ` AND target_type = ?`; params.push(opts.targetType); }
    params.push(limit, offset);
    const rows = await db.prepare(
      `SELECT * FROM audit_log WHERE ${where} ORDER BY at DESC LIMIT ? OFFSET ?`
    ).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      actor: r.actor,
      action: r.action,
      targetId: r.target_id ?? undefined,
      targetType: r.target_type ?? undefined,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
      ip: r.ip ?? undefined,
      userAgent: r.user_agent ?? undefined,
      at: r.at,
    }));
  },

  async counts(ownerId: string, sinceMs = 30 * 24 * 60 * 60 * 1000): Promise<Record<string, number>> {
    const since = Date.now() - sinceMs;
    const rows = await db.prepare(
      `SELECT action, COUNT(*) as c FROM audit_log WHERE owner_id = ? AND at > ? GROUP BY action`
    ).all(ownerId, since) as any[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.action] = r.c;
    return out;
  },

  async clear(ownerId: string, beforeMs: number): Promise<number> {
    const r = await db.prepare(
      `DELETE FROM audit_log WHERE owner_id = ? AND at < ?`
    ).run(ownerId, beforeMs);
    return r.changes;
  },
};
