/**
 * Agent workspace snapshots — zip each agent's data directory and persist
 * it to Supabase Storage so deployments / container restarts don't lose
 * files. Index rows in the agent_snapshots Postgres table.
 *
 * Triggers:
 *   - RunStore.complete() / RunStore.fail()  → snapshot after every run
 *   - Server boot                           → hydrate local dirs from latest snapshot
 *   - API: POST /api/agents/:id/snapshots   → manual snapshot
 *   - API: POST /api/snapshots/:id/restore  → manual restore
 *   - API: POST /api/snapshots/restore-all  → bulk hydrate
 *
 * Retention: keep last 10 snapshots per agent AND last 14 days, whichever
 * is more permissive. Pruning happens after each new snapshot.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, stat, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { supabaseAdmin } from "../security/supabase.ts";
import { AGENTS_DIR, ensureAgentDir } from "../agents/files.ts";

function resolveAgentDir(agentId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(agentId)) throw new Error(`invalid agentId: ${agentId}`);
  return join(AGENTS_DIR, agentId);
}

const BUCKET = process.env.SUPABASE_SNAPSHOT_BUCKET || "agent-snapshots";
const MAX_PER_AGENT = 10;
const RETENTION_DAYS = 14;

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".cache", ".next", "dist",
  ".venv", "venv", ".bun", "build", ".sass-cache", ".turbo",
]);

export interface SnapshotRow {
  id: string;
  agentId: string;
  runId: string | null;
  trigger: string;
  status: "pending" | "ready" | "failed";
  byteSize: number;
  fileCount: number;
  contentHash: string;
  storagePath: string;
  errorMessage: string | null;
  createdAt: number;
  expiresAt: number;
}

function rowToSnapshot(r: any): SnapshotRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    runId: r.run_id,
    trigger: r.trigger,
    status: r.status,
    byteSize: Number(r.byte_size ?? 0),
    fileCount: Number(r.file_count ?? 0),
    contentHash: r.content_hash ?? "",
    storagePath: r.storage_path,
    errorMessage: r.error_message,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer + reader (no compression — stored-only).
// Enough for text-heavy agent files; compresses small and decodes fast.
// ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  const T = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    T[n] = c >>> 0;
  }
  return T;
})();
function crc32Table() { return CRC_TABLE; }

function dosTime(d = new Date()): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

interface ZipEntry { name: string; data: Uint8Array; mtimeMs: number; }

function buildZip(entries: ZipEntry[]): Uint8Array {
  const { time, date } = dosTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = new TextEncoder().encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // method = stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(e.data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const localSize = offset;
  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);

  const out = new Uint8Array(localSize + centralSize + 22);
  let p = 0;
  for (const part of localParts) { out.set(part, p); p += part.length; }
  for (const part of centralParts) { out.set(part, p); p += part.length; }
  const v = new DataView(out.buffer);
  v.setUint32(p, 0x06054b50, true);
  v.setUint16(p + 4, 0, true);
  v.setUint16(p + 6, 0, true);
  v.setUint16(p + 8, entries.length, true);
  v.setUint16(p + 10, entries.length, true);
  v.setUint32(p + 12, centralSize, true);
  v.setUint32(p + 16, localSize, true);
  v.setUint16(p + 20, 0, true);
  return out;
}

function readZip(buf: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const total = buf.length;
  let p = 0;
  while (p < total - 4) {
    const sig = v.getUint32(p, true);
    if (sig !== 0x04034b50) break;
    const method = v.getUint16(p + 8, true);
    const compSize = v.getUint32(p + 18, true);
    const uncompSize = v.getUint32(p + 22, true);
    const nameLen = v.getUint16(p + 26, true);
    const extraLen = v.getUint16(p + 28, true);
    const nameBytes = buf.subarray(p + 30, p + 30 + nameLen);
    const dataStart = p + 30 + nameLen + extraLen;
    const name = new TextDecoder().decode(nameBytes);
    const data = method === 0 ? buf.subarray(dataStart, dataStart + uncompSize) : new Uint8Array(0);
    out.set(name, data);
    p = dataStart + compSize;
  }
  return out;
}

async function walkForZip(root: string, out: ZipEntry[]): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  async function walk(dir: string) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".gitkeep") continue;
      if (EXCLUDED_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          const st = await stat(full);
          if (st.size > 50 * 1024 * 1024) continue; // skip files >50MB
          const data = await readFile(full);
          const rel = relative(root, full).replace(/\\/g, "/");
          out.push({ name: rel, data: new Uint8Array(data), mtimeMs: st.mtimeMs });
          count += 1;
          bytes += st.size;
        } catch {}
      }
    }
  }
  await walk(root);
  return { count, bytes };
}

async function zipAgentDir(agentDir: string): Promise<{ zip: Uint8Array; count: number; bytes: number; hash: string }> {
  const entries: ZipEntry[] = [];
  const { count, bytes } = await walkForZip(agentDir, entries);
  const zip = buildZip(entries);
  const hash = createHash("sha256").update(zip).digest("hex").slice(0, 16);
  return { zip, count, bytes, hash };
}

// ---------------------------------------------------------------------------
// Supabase Storage I/O
// ---------------------------------------------------------------------------

async function ensureBucket(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (!data && !error) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
      if (createErr) {
        console.error("[snapshots] bucket create failed:", createErr.message);
        return false;
      }
      console.log(`[snapshots] created bucket ${BUCKET}`);
    } else if (error && !/not found/i.test(error.message)) {
      console.error("[snapshots] getBucket error:", error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[snapshots] ensureBucket error:", e?.message ?? e);
    return false;
  }
}

async function uploadZip(storagePath: string, zip: Uint8Array): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const blob = new Blob([new Uint8Array(zip)], { type: "application/zip" });
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: "application/zip",
    upsert: true,
  });
  if (error) {
    console.error(`[snapshots] upload failed (${storagePath}):`, error.message);
    return false;
  }
  return true;
}

async function downloadZip(storagePath: string): Promise<Uint8Array | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    console.error(`[snapshots] download failed (${storagePath}):`, error?.message ?? "no data");
    return null;
  }
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

async function deleteRemoteZip(storagePath: string): Promise<void> {
  if (!supabaseAdmin) return;
  try { await supabaseAdmin.storage.from(BUCKET).remove([storagePath]); }
  catch (e: any) { console.warn(`[snapshots] remote delete failed (${storagePath}):`, e?.message ?? e); }
}

// ---------------------------------------------------------------------------
// Snapshot creation + retention
// ---------------------------------------------------------------------------

export async function createSnapshot(opts: {
  agentId: string;
  trigger: "run_complete" | "run_fail" | "manual" | "boot";
  runId?: string | null;
}): Promise<SnapshotRow | null> {
  if (!supabaseAdmin) {
    console.warn("[snapshots] Supabase not configured — skipping snapshot");
    return null;
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(opts.agentId)) {
    console.error(`[snapshots] invalid agentId: ${opts.agentId}`);
    return null;
  }
  const bucketOk = await ensureBucket();
  if (!bucketOk) return null;

  const agentDir = resolveAgentDir(opts.agentId);
  if (!existsSync(agentDir)) {
    console.log(`[snapshots] agent ${opts.agentId}: local dir missing, nothing to snapshot`);
    return null;
  }

  const { zip, count, bytes, hash } = await zipAgentDir(agentDir);
  if (count === 0) {
    console.log(`[snapshots] agent ${opts.agentId}: empty, skipping`);
    return null;
  }

  // Skip if identical to latest snapshot (deduplicate noisy repeated saves)
  const latest = await getLatestReadySnapshot(opts.agentId);
  if (latest && latest.contentHash === hash) {
    return latest;
  }

  const id = `snap_${nanoid(16)}`;
  const now = Date.now();
  const expiresAt = now + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const storagePath = `${opts.agentId}/${id}.zip`;

  const ok = await uploadZip(storagePath, zip);
  if (!ok) {
    await db.prepare(
      `INSERT INTO agent_snapshots (id, agent_id, run_id, trigger, status, byte_size, file_count, content_hash, storage_path, error_message, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, opts.agentId, opts.runId ?? null, opts.trigger, bytes, count, hash, storagePath, "upload failed", now, expiresAt);
    return null;
  }

  await db.prepare(
    `INSERT INTO agent_snapshots (id, agent_id, run_id, trigger, status, byte_size, file_count, content_hash, storage_path, error_message, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  ).run(id, opts.agentId, opts.runId ?? null, opts.trigger, bytes, count, hash, storagePath, now, expiresAt);

  console.log(`[snapshots] ${opts.agentId} → ${id} (${count} files, ${bytes} bytes, hash=${hash}, trigger=${opts.trigger})`);

  // Fire-and-forget retention prune
  pruneSnapshots(opts.agentId).catch((e) => console.warn(`[snapshots] prune error:`, e?.message ?? e));

  return (await getSnapshot(id)) ?? null;
}

export async function getLatestReadySnapshot(agentId: string): Promise<SnapshotRow | null> {
  const row = await db.prepare(
    `SELECT * FROM agent_snapshots WHERE agent_id = ? AND status = 'ready'
     ORDER BY created_at DESC LIMIT 1`
  ).get(agentId);
  return row ? rowToSnapshot(row) : null;
}

export async function getSnapshot(snapshotId: string): Promise<SnapshotRow | null> {
  const row = await db.prepare(`SELECT * FROM agent_snapshots WHERE id = ?`).get(snapshotId);
  return row ? rowToSnapshot(row) : null;
}

export async function listSnapshots(agentId: string, limit = 50): Promise<SnapshotRow[]> {
  const rows = await db.prepare(
    `SELECT * FROM agent_snapshots WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(agentId, limit);
  return (rows as any[]).map(rowToSnapshot);
}

export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
  const snap = await getSnapshot(snapshotId);
  if (!snap) return false;
  await deleteRemoteZip(snap.storagePath);
  await db.prepare(`DELETE FROM agent_snapshots WHERE id = ?`).run(snapshotId);
  return true;
}

// Retention: keep last MAX_PER_AGENT snapshots AND anything inside RETENTION_DAYS.
// Anything else: delete remote + row.
export async function pruneSnapshots(agentId: string): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const all = await db.prepare(
    `SELECT * FROM agent_snapshots WHERE agent_id = ? ORDER BY created_at DESC`
  ).all(agentId) as any[];
  if (!all || all.length === 0) return 0;

  const keep = new Set<string>();
  for (let i = 0; i < Math.min(MAX_PER_AGENT, all.length); i++) keep.add(all[i].id);
  // Also keep everything in the retention window (regardless of count)
  for (const r of all) {
    if (Number(r.created_at) >= cutoff) keep.add(r.id);
  }

  let removed = 0;
  for (const r of all) {
    if (keep.has(r.id)) continue;
    await deleteRemoteZip(r.storage_path);
    await db.prepare(`DELETE FROM agent_snapshots WHERE id = ?`).run(r.id);
    removed += 1;
  }
  if (removed > 0) console.log(`[snapshots] pruned ${removed} old snapshot(s) for ${agentId}`);
  return removed;
}

// ---------------------------------------------------------------------------
// Restore + hydration
// ---------------------------------------------------------------------------

export async function restoreSnapshot(snapshotId: string): Promise<{
  ok: boolean;
  agentId: string;
  filesWritten: number;
  error?: string;
}> {
  const snap = await getSnapshot(snapshotId);
  if (!snap) return { ok: false, agentId: "", filesWritten: 0, error: "snapshot not found" };
  if (snap.status !== "ready") return { ok: false, agentId: snap.agentId, filesWritten: 0, error: `snapshot status: ${snap.status}` };

  const zip = await downloadZip(snap.storagePath);
  if (!zip) return { ok: false, agentId: snap.agentId, filesWritten: 0, error: "download failed" };

  const files = readZip(zip);
  const agentDir = resolveAgentDir(snap.agentId);
  try { await rm(agentDir, { recursive: true, force: true }); } catch {}
  await mkdir(agentDir, { recursive: true });
  await mkdir(join(agentDir, "skills"), { recursive: true });
  await mkdir(join(agentDir, "workdir"), { recursive: true });

  let written = 0;
  for (const [name, data] of files) {
    if (name.includes("..") || name.startsWith("/")) continue;
    const full = join(agentDir, name);
    if (!full.startsWith(agentDir)) continue;
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, data);
    written += 1;
  }
  console.log(`[snapshots] restored ${snap.agentId} from ${snap.id} (${written} files)`);
  return { ok: true, agentId: snap.agentId, filesWritten: written };
}

// If the local agent dir is empty/missing, pull latest snapshot.
export async function hydrateAgent(agentId: string): Promise<{ restored: boolean; fromSnapshotId?: string; fileCount?: number }> {
  const dir = resolveAgentDir(agentId);
  let isEmpty = !existsSync(dir);
  if (!isEmpty) {
    try {
      const names = await readdir(dir);
      if (names.length === 0) isEmpty = true;
    } catch { isEmpty = true; }
  }
  if (!isEmpty) return { restored: false };

  const latest = await getLatestReadySnapshot(agentId);
  if (!latest) return { restored: false };

  const r = await restoreSnapshot(latest.id);
  return r.ok ? { restored: true, fromSnapshotId: latest.id, fileCount: r.filesWritten } : { restored: false };
}

// Hydrate every agent that has a DB row + at least one snapshot but no
// (or empty) local dir. Called once at server boot.
export async function hydrateAllAgents(): Promise<{ scanned: number; restored: number; errors: number }> {
  if (!supabaseAdmin) return { scanned: 0, restored: 0, errors: 0 };
  let scanned = 0;
  let restored = 0;
  let errors = 0;

  let agentRows: any[];
  try {
    agentRows = (await db.prepare(`SELECT id FROM agents`).all()) as any[];
  } catch (e: any) {
    console.error("[snapshots] hydrateAllAgents: agent query failed:", e?.message ?? e);
    return { scanned: 0, restored: 0, errors: 0 };
  }

  for (const r of agentRows) {
    scanned += 1;
    const id = r.id;
    try {
      const res = await hydrateAgent(id);
      if (res.restored) {
        restored += 1;
        console.log(`[snapshots] hydrated ${id} from ${res.fromSnapshotId} (${res.fileCount} files)`);
      }
    } catch (e: any) {
      errors += 1;
      console.warn(`[snapshots] hydrate ${id} failed:`, e?.message ?? e);
    }
  }
  console.log(`[snapshots] boot hydrate complete: scanned=${scanned} restored=${restored} errors=${errors}`);
  return { scanned, restored, errors };
}

export { ensureBucket as ensureSnapshotBucket };

