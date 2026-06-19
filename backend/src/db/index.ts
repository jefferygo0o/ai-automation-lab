/**
 * Database initialisation.
 *
 * Uses bun:sqlite (sync, fast, zero-dep). The schema is idempotent and
 * lives in src/db/schema.sql. A small migration log in `schema_migrations`
 * lets us add non-destructive ALTER TABLE patches without losing data.
 */
import { Database } from "bun:sqlite";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const DB_PATH = process.env.LAB_DB_PATH ?? "/home/workspace/Projects/ai-automation-lab/backend/data/lab.db";

const dir = resolve(import.meta.dir || ".");
// Resolve schema from the source tree — works in dev and relative to the project root
const schemaCandidates = [
  join(dir, "schema.sql"),                                             // dev: ./src/db/schema.sql
  "/home/workspace/Projects/ai-automation-lab/backend/src/db/schema.sql", // prod (compiled): absolute fallback
];

const dbDir = join(DB_PATH, "..");
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const db = new Database(DB_PATH, { strict: true });

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

let schema = "";
for (const p of schemaCandidates) {
  try { schema = readFileSync(p, "utf8"); break; } catch {}
}
if (!schema) throw new Error("Cannot find schema.sql. Tried: " + schemaCandidates.join(", "));
db.exec(schema);

// Migration log: idempotent ALTER TABLE patches that have to be applied
// after the initial schema (which assumes CREATE-only semantics).
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`);

type Migration = { id: string; sql: string; run: () => void };

// Migrations are checked against `PRAGMA table_info` to decide if they're
// needed. If the column already exists, the migration is a no-op.
const columnExists = (table: string, col: string): boolean => {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === col);
};

const tableExists = (name: string): boolean => {
  const row = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
  return !!row;
};

const migrations: Migration[] = [
  {
    id: "runs.error_message",
    sql: "ALTER TABLE runs ADD COLUMN error_message TEXT;",
    run: () => { if (!columnExists("runs", "error_message")) db.exec("ALTER TABLE runs ADD COLUMN error_message TEXT;"); },
  },
  {
    id: "skills.hash",
    sql: "ALTER TABLE skills ADD COLUMN hash TEXT;",
    run: () => { if (!columnExists("skills", "hash")) db.exec("ALTER TABLE skills ADD COLUMN hash TEXT;"); },
  },
  {
    id: "agents.hash",
    sql: "ALTER TABLE agents ADD COLUMN hash TEXT;",
    run: () => { if (!columnExists("agents", "hash")) db.exec("ALTER TABLE agents ADD COLUMN hash TEXT;"); },
  },
  {
    id: "agents.runtime",
    sql: "ALTER TABLE agents ADD COLUMN runtime TEXT;",
    run: () => { if (!columnExists("agents", "runtime")) db.exec("ALTER TABLE agents ADD COLUMN runtime TEXT;"); },
  },
  {
    id: "runs.status_index",
    sql: "ALTER TABLE runs ADD COLUMN status_index INTEGER NOT NULL DEFAULT 0;",
    run: () => { if (!columnExists("runs", "status_index")) db.exec("ALTER TABLE runs ADD COLUMN status_index INTEGER NOT NULL DEFAULT 0;"); },
  },
  {
    id: "memory_items.owner_user_id",
    sql: "ALTER TABLE memory_items ADD COLUMN owner_user_id TEXT;",
    run: () => { if (!columnExists("memory_items", "owner_user_id")) db.exec("ALTER TABLE memory_items ADD COLUMN owner_user_id TEXT;"); },
  },
  {
    id: "runs.agent_hash",
    sql: "ALTER TABLE runs ADD COLUMN agent_hash TEXT;",
    run: () => { if (!columnExists("runs", "agent_hash")) db.exec("ALTER TABLE runs ADD COLUMN agent_hash TEXT;"); },
  },
  {
    id: "runs.agent_runtime",
    sql: "ALTER TABLE runs ADD COLUMN agent_runtime TEXT;",
    run: () => { if (!columnExists("runs", "agent_runtime")) db.exec("ALTER TABLE runs ADD COLUMN agent_runtime TEXT;"); },
  },
  {
    id: "messages.feedback_rating",
    sql: "ALTER TABLE messages ADD COLUMN feedback_rating INTEGER;",
    run: () => { if (!columnExists("messages", "feedback_rating")) db.exec("ALTER TABLE messages ADD COLUMN feedback_rating INTEGER;"); },
  },
  {
    id: "messages.feedback_comment",
    sql: "ALTER TABLE messages ADD COLUMN feedback_comment TEXT;",
    run: () => { if (!columnExists("messages", "feedback_comment")) db.exec("ALTER TABLE messages ADD COLUMN feedback_comment TEXT;"); },
  },
  {
    id: "runs.approval_id",
    sql: "ALTER TABLE runs ADD COLUMN approval_id TEXT;",
    run: () => { if (!columnExists("runs", "approval_id")) db.exec("ALTER TABLE runs ADD COLUMN approval_id TEXT;"); },
  },
  {
    id: "chats.last_message_at",
    sql: "ALTER TABLE chats ADD COLUMN last_message_at INTEGER;",
    run: () => { if (!columnExists("chats", "last_message_at")) db.exec("ALTER TABLE chats ADD COLUMN last_message_at INTEGER;"); },
  },
  {
    id: "chats.total_tokens",
    sql: "ALTER TABLE chats ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;",
    run: () => { if (!columnExists("chats", "total_tokens")) db.exec("ALTER TABLE chats ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;"); },
  },
  {
    id: "chats.total_runs",
    sql: "ALTER TABLE chats ADD COLUMN total_runs INTEGER NOT NULL DEFAULT 0;",
    run: () => { if (!columnExists("chats", "total_runs")) db.exec("ALTER TABLE chats ADD COLUMN total_runs INTEGER NOT NULL DEFAULT 0;"); },
  },
  {
    id: "chats.last_run_at",
    sql: "ALTER TABLE chats ADD COLUMN last_run_at INTEGER;",
    run: () => { if (!columnExists("chats", "last_run_at")) db.exec("ALTER TABLE chats ADD COLUMN last_run_at INTEGER;"); },
  },
  {
    id: "webhook_endpoints.reusable",
    sql: "ALTER TABLE webhook_endpoints ADD COLUMN reusable INTEGER;",
    run: () => { if (!columnExists("webhook_endpoints", "reusable")) db.exec("ALTER TABLE webhook_endpoints ADD COLUMN reusable INTEGER;"); },
  },
];

for (const m of migrations) {
  const already = db.query(`SELECT 1 FROM schema_migrations WHERE id = ?`).get(m.id);
  if (already) continue;
  try {
    m.run();
    db.prepare(`INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`).run(m.id, Date.now());
  } catch (e) {
    // ignore "duplicate column" errors etc — they're safe to skip
  }
}

console.log(`[db] open ${DB_PATH}`);

export { db };