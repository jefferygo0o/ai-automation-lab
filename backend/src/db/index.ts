/**
 * Database initialisation.
 *
 * SQLite for application data (fast, zero-dep).
 * Supabase Auth handles authentication.
 */
import { Database } from "bun:sqlite";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const DB_PATH = process.env.LAB_DB_PATH ?? join(resolve(import.meta.dir || "."), "..", "..", "data", "lab.db");

const dir = resolve(import.meta.dir || ".");
const schemaCandidates = [
  join(dir, "schema.sql"),
  resolve(dir, "..", "..", "data", "schema.sql"),
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

db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);");

const columnExists = (table, col) => {
  const rows = db.query("PRAGMA table_info(" + table + ")").all();
  return rows.some((r) => r.name === col);
};

const tableExists = (name) => {
  return !!db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
};

const migrations = [
  { id: "runs.error_message", run: () => { if (!columnExists("runs", "error_message")) db.exec("ALTER TABLE runs ADD COLUMN error_message TEXT;"); } },
  { id: "skills.hash", run: () => { if (!columnExists("skills", "hash")) db.exec("ALTER TABLE skills ADD COLUMN hash TEXT;"); } },
  { id: "agents.hash", run: () => { if (!columnExists("agents", "hash")) db.exec("ALTER TABLE agents ADD COLUMN hash TEXT;"); } },
  { id: "agents.runtime", run: () => { if (!columnExists("agents", "runtime")) db.exec("ALTER TABLE agents ADD COLUMN runtime TEXT;"); } },
  { id: "runs.agent_hash", run: () => { if (!columnExists("runs", "agent_hash")) db.exec("ALTER TABLE runs ADD COLUMN agent_hash TEXT;"); } },
  { id: "runs.agent_runtime", run: () => { if (!columnExists("runs", "agent_runtime")) db.exec("ALTER TABLE runs ADD COLUMN agent_runtime TEXT;"); } },
  { id: "runs.cost_cents", run: () => { if (!columnExists("runs", "cost_cents")) db.exec("ALTER TABLE runs ADD COLUMN cost_cents REAL NOT NULL DEFAULT 0;"); } },
  { id: "messages.feedback_rating", run: () => { if (!columnExists("messages", "feedback_rating")) db.exec("ALTER TABLE messages ADD COLUMN feedback_rating INTEGER;"); } },
  { id: "messages.feedback_comment", run: () => { if (!columnExists("messages", "feedback_comment")) db.exec("ALTER TABLE messages ADD COLUMN feedback_comment TEXT;"); } },
  { id: "runs.approval_id", run: () => { if (!columnExists("runs", "approval_id")) db.exec("ALTER TABLE runs ADD COLUMN approval_id TEXT;"); } },
  { id: "chats.last_message_at", run: () => { if (!columnExists("chats", "last_message_at")) db.exec("ALTER TABLE chats ADD COLUMN last_message_at INTEGER;"); } },
  { id: "chats.total_tokens", run: () => { if (!columnExists("chats", "total_tokens")) db.exec("ALTER TABLE chats ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;"); } },
  { id: "chats.total_runs", run: () => { if (!columnExists("chats", "total_runs")) db.exec("ALTER TABLE chats ADD COLUMN total_runs INTEGER NOT NULL DEFAULT 0;"); } },
  { id: "chats.last_run_at", run: () => { if (!columnExists("chats", "last_run_at")) db.exec("ALTER TABLE chats ADD COLUMN last_run_at INTEGER;"); } },
  { id: "webhook_endpoints.reusable", run: () => { if (!columnExists("webhook_endpoints", "reusable")) db.exec("ALTER TABLE webhook_endpoints ADD COLUMN reusable INTEGER;"); } },
  { id: "integrations", run: () => {
    if (!tableExists("integration_connections")) {
      db.exec("CREATE TABLE IF NOT EXISTS integration_connections (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_slug TEXT NOT NULL, app_name TEXT NOT NULL, auth_type TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'disconnected', credentials_ref TEXT, connected_account_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner_id, app_slug));");
      db.exec("CREATE INDEX IF NOT EXISTS idx_integrations_owner ON integration_connections(owner_id);");
    }
  }},
  { id: "integration_action_cache", run: () => {
    if (!tableExists("integration_action_cache")) {
      db.exec("CREATE TABLE IF NOT EXISTS integration_action_cache (id TEXT PRIMARY KEY, app_slug TEXT NOT NULL, action_key TEXT NOT NULL, name TEXT NOT NULL, description TEXT, source TEXT NOT NULL DEFAULT 'action', input_schema_json TEXT, fetched_at INTEGER NOT NULL, UNIQUE(app_slug, action_key));");
      db.exec("CREATE INDEX IF NOT EXISTS idx_action_cache_app ON integration_action_cache(app_slug);");
    }
  }},
];

for (const m of migrations) {
  const already = db.query("SELECT 1 FROM schema_migrations WHERE id = ?").get(m.id);
  if (already) continue;
  try {
    m.run();
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now());
  } catch (e) {
    // ignore
  }
}

console.log("[db] open", DB_PATH);
export { db };

  // ─── Migrations lost during SQLite revert ───
  { id: "memory_items.owner_user_id", run: () => { if (!columnExists("memory_items", "owner_user_id")) db.exec("ALTER TABLE memory_items ADD COLUMN owner_user_id TEXT;"); } },
  { id: "runs.status_index", run: () => { if (!columnExists("runs", "status_index")) db.exec("ALTER TABLE runs ADD COLUMN status_index INTEGER NOT NULL DEFAULT 0;"); } },
  { id: "catalog_app_cache", run: () => {
    if (!tableExists("catalog_app_cache")) {
      db.exec("CREATE TABLE IF NOT EXISTS catalog_app_cache (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, app_slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', auth_type TEXT NOT NULL DEFAULT 'none', auth_description TEXT NOT NULL DEFAULT '', action_count INTEGER NOT NULL DEFAULT 0, trigger_count INTEGER NOT NULL DEFAULT 0, logo_url TEXT NOT NULL DEFAULT '', categories_json TEXT NOT NULL DEFAULT '[]', fetched_at INTEGER NOT NULL, UNIQUE(owner_id, app_slug));");
      db.exec("CREATE INDEX IF NOT EXISTS idx_catalog_cache_owner ON catalog_app_cache(owner_id);");
    }
  }},
  { id: "catalog_sync_state", run: () => {
    if (!tableExists("catalog_sync_state")) {
      db.exec("CREATE TABLE IF NOT EXISTS catalog_sync_state (owner_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'idle', total INTEGER NOT NULL DEFAULT 0, error_message TEXT, started_at INTEGER NOT NULL DEFAULT 0, completed_at INTEGER);");
    }
  }},
