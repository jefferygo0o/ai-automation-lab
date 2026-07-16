/**
 * WorkspaceJournal — event-sourced tracking of workspace operations.
 *
 * Records every write, mkdir, move, rename, delete, copy, and restore so the
 * user can browse history, undo changes, and audit file activity.
 *
 * Retention: automatic 30-day TTL (handled by DB migration function).
 */

import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

export type JournalEventKind =
  | "write"
  | "mkdir"
  | "move"
  | "rename"
  | "delete"
  | "copy"
  | "restore";

export interface JournalEvent {
  id: string;
  ownerId: string;
  kind: JournalEventKind;
  sourcePath: string;
  targetPath: string | null;
  fileType: "file" | "dir";
  fileSize: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export const WorkspaceJournal = {
  async record(
    ownerId: string,
    kind: JournalEventKind,
    sourcePath: string,
    opts: {
      targetPath?: string;
      fileType?: "file" | "dir";
      fileSize?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<JournalEvent> {
    const id = `evt_${nanoid(16)}`;
    const now = Date.now();
    const row = {
      id,
      owner_id: ownerId,
      kind,
      source_path: sourcePath,
      target_path: opts.targetPath ?? null,
      file_type: opts.fileType ?? "file",
      file_size: opts.fileSize ?? 0,
      metadata_json: JSON.stringify(opts.metadata ?? {}),
      created_at: now,
    };
    await db.query(
      `INSERT INTO workspace_events (id, owner_id, kind, source_path, target_path, file_type, file_size, metadata_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.owner_id, row.kind, row.source_path, row.target_path, row.file_type, row.file_size, row.metadata_json, row.created_at],
    );
    return {
      id: row.id,
      ownerId: row.owner_id,
      kind: row.kind as JournalEventKind,
      sourcePath: row.source_path,
      targetPath: row.target_path,
      fileType: row.file_type as "file" | "dir",
      fileSize: row.file_size,
      metadata: JSON.parse(row.metadata_json),
      createdAt: row.created_at,
    };
  },

  async list(
    ownerId: string,
    opts: { limit?: number; offset?: number; kind?: JournalEventKind } = {},
  ): Promise<JournalEvent[]> {
    const conditions: string[] = ["owner_id = $1"];
    const params: (string | number)[] = [ownerId];
    let idx = 2;
    if (opts.kind) {
      conditions.push(`kind = $${idx++}`);
      params.push(opts.kind);
    }
    const sql = `SELECT * FROM workspace_events WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(opts.limit ?? 50, opts.offset ?? 0);
    const rows = await db.query(sql, params);
    return (rows?.rows ?? []).map(rowToEvent);
  },

  async listByPath(ownerId: string, path: string, limit = 20): Promise<JournalEvent[]> {
    const rows = await db.query(
      `SELECT * FROM workspace_events
       WHERE owner_id = $1 AND (source_path = $2 OR target_path = $2)
       ORDER BY created_at DESC LIMIT $3`,
      [ownerId, path, limit],
    );
    return (rows?.rows ?? []).map(rowToEvent);
  },
};

function rowToEvent(r: any): JournalEvent {
  return {
    id: r.id,
    ownerId: r.owner_id,
    kind: r.kind,
    sourcePath: r.source_path,
    targetPath: r.target_path,
    fileType: r.file_type,
    fileSize: r.file_size,
    metadata: safeParse(r.metadata_json),
    createdAt: r.created_at,
  };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
