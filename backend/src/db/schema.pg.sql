-- AI Automation Lab - PostgreSQL Schema
-- Mirrors the SQLite schema with PG-idiomatic types.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_secrets_owner ON secrets(owner_id);

CREATE TABLE IF NOT EXISTS rate_counters (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, hour)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL DEFAULT '',
  runtime TEXT NOT NULL DEFAULT 'bun',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);

-- Migration: add hash and runtime columns to agents (PG-only, added post-SQLite)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS hash TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS runtime TEXT NOT NULL DEFAULT 'bun';

-- Migration: add config_json column to agents for config persistence across deploys
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config_json TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  active_agent_id TEXT,
  last_message_at BIGINT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_runs INTEGER NOT NULL DEFAULT 0,
  last_run_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_owner ON chats(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_call_id TEXT,
  name TEXT,
  agent_id TEXT,
  run_id TEXT,
  feedback_rating INTEGER,
  feedback_comment TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  status_detail TEXT,
  approval_id TEXT,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents REAL NOT NULL DEFAULT 0,
  error_message TEXT,
  agent_hash TEXT,
  agent_runtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_chat ON runs(chat_id, started_at DESC);

CREATE TABLE IF NOT EXISTS tool_invocations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  result_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  sandbox_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_run ON tool_invocations(run_id, started_at);

CREATE TABLE IF NOT EXISTS agent_file_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_agent ON agent_file_history(agent_id, filename, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent',
  owner_user_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(agent_id, kind, key)
);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_items(agent_id);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'stdio',
  command TEXT,
  args TEXT NOT NULL DEFAULT '[]',
  env TEXT NOT NULL DEFAULT '{}',
  url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_owner ON mcp_servers(owner_id);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  builtin INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  hash TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner_id);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  rrule TEXT NOT NULL DEFAULT 'FREQ=DAILY',
  prompt TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at BIGINT,
  last_error TEXT,
  next_run_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automations_owner ON automations(owner_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  output TEXT,
  error TEXT,
  started_at BIGINT NOT NULL,
  finished_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_auto ON automation_runs(automation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS space_routes (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'page',
  code TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(owner_id, path)
);
CREATE INDEX IF NOT EXISTS idx_space_routes_owner ON space_routes(owner_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  target_type TEXT,
  metadata_json TEXT,
  ip TEXT,
  user_agent TEXT,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_owner ON audit_log(owner_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(owner_id, action, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(owner_id, target_type, target_id, at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  run_id TEXT,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  tool_call_id TEXT,
  kind TEXT NOT NULL DEFAULT 'plan',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  response TEXT,
  resolved_at BIGINT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_owner ON approval_requests(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_chat ON approval_requests(chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  instruction_template TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fired_at BIGINT,
  fire_count INTEGER NOT NULL DEFAULT 0,
  reusable INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_owner ON webhook_endpoints(owner_id);

CREATE TABLE IF NOT EXISTS agent_templates (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  icon TEXT NOT NULL DEFAULT '🤖',
  system_prompt TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL DEFAULT '',
  skills_md TEXT NOT NULL DEFAULT '',
  tools_md TEXT NOT NULL DEFAULT '',
  memory_md TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_owner ON agent_templates(owner_id, category);

CREATE TABLE IF NOT EXISTS chat_feedback (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_chat ON chat_feedback(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_msg ON chat_feedback(message_id);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  rrule TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at BIGINT,
  last_error TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_owner ON scheduled_jobs(owner_id);

CREATE TABLE IF NOT EXISTS observability_metrics (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  UNIQUE(owner_id, metric, bucket)
);
CREATE INDEX IF NOT EXISTS idx_metrics_owner ON observability_metrics(owner_id, metric, updated_at DESC);

-- ============================================================
-- MISSING TABLES (added by migration)
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_slug TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_description TEXT NOT NULL DEFAULT '',
  auth_type TEXT NOT NULL DEFAULT 'oauth',
  auth_description TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected',
  credentials_ref TEXT,
  connected_account_id TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integration_owner ON integration_connections(owner_id, app_slug);

CREATE TABLE IF NOT EXISTS integration_action_cache (
  id TEXT PRIMARY KEY,
  app_slug TEXT NOT NULL,
  action_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'action',
  input_schema TEXT NOT NULL DEFAULT '{}',
  output_schema TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_action_cache_app ON integration_action_cache(app_slug, action_key);

-- Dedupe legacy catalog_app_cache rows before we add the UNIQUE constraint.
-- The earlier schema had no uniqueness on (owner_id, app_slug), and the
-- earlier cacheAppCatalog did a plain INSERT, so re-syncs accumulated many
-- rows per app. We must collapse to one row per (owner_id, app_slug) before
-- the UNIQUE constraint is added below, otherwise CREATE TABLE would fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'catalog_app_cache'
  ) THEN
    -- legacy databases may have many rows per (owner_id, app_slug); collapse them.
    DELETE FROM catalog_app_cache c
    USING catalog_app_cache newer
    WHERE c.owner_id = newer.owner_id
      AND c.app_slug = newer.app_slug
      AND (newer.fetched_at, newer.ctid) > (c.fetched_at, c.ctid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS catalog_app_cache (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  auth_type TEXT NOT NULL DEFAULT '',
  auth_description TEXT NOT NULL DEFAULT '',
  action_count INTEGER NOT NULL DEFAULT 0,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  logo_url TEXT NOT NULL DEFAULT '',
  categories_json TEXT NOT NULL DEFAULT '[]',
  fetched_at BIGINT NOT NULL,
  CONSTRAINT catalog_app_cache_owner_slug_unique UNIQUE (owner_id, app_slug)
);
-- Name-based browse index. The UNIQUE (owner_id, app_slug) constraint above
-- also serves lookups by slug within a user.
CREATE INDEX IF NOT EXISTS idx_catalog_owner ON catalog_app_cache(owner_id, name);

-- Belt-and-suspenders for existing deploys: CREATE TABLE IF NOT EXISTS
-- skips when the table already exists, which would leave the old (no
-- constraint) table in place. Explicitly add the constraint here so
-- upserts in cacheAppCatalog work on legacy databases too.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalog_app_cache_owner_slug_unique'
  ) THEN
    ALTER TABLE catalog_app_cache
      ADD CONSTRAINT catalog_app_cache_owner_slug_unique
      UNIQUE (owner_id, app_slug);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS catalog_sync_state (
  owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle',
  total INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  last_used_at BIGINT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);

-- Migration: add is_enabled column to webhook_endpoints
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS is_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS provider_registry (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  secret_name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_registry_owner ON provider_registry(owner_id, kind);

-- ============================================================
-- AGENT WORKSPACE SNAPSHOTS (persistent agent files in Supabase)
-- ============================================================
-- The snapshots module (backend/src/snapshots/index.ts) reads and
-- writes this table to persist agent workspace files across deploys.
CREATE TABLE IF NOT EXISTS agent_snapshots (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  byte_size BIGINT NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL,
  error_message TEXT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_agent ON agent_snapshots(agent_id, created_at DESC);

-- ============================================================
-- PERSONAS
-- ============================================================

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_hue INTEGER NOT NULL DEFAULT -1,
  model TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personas_owner ON personas(owner_id);
CREATE INDEX IF NOT EXISTS idx_personas_active ON personas(owner_id, is_active) WHERE is_active = 1;

-- Rules: persistent behavioural constraints applied to all agents
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_owner ON rules(owner_id);

-- ============================================================
-- SITES (Zo-like managed websites)
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT 'blank',
  root_dir TEXT NOT NULL,
  dev_port INTEGER,
  dev_status TEXT NOT NULL DEFAULT 'idle',
  published_service_id TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sites_owner ON sites(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_slug ON sites(slug);

-- ============================================================
-- USER SERVICES (supervised long-running processes)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_services (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'http',
  entrypoint TEXT NOT NULL,
  workdir TEXT NOT NULL DEFAULT '',
  local_port INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle',
  pid INTEGER,
  http_url TEXT NOT NULL DEFAULT '',
  tcp_addr TEXT NOT NULL DEFAULT '',
  env_vars TEXT NOT NULL DEFAULT '{}',
  custom_domains TEXT NOT NULL DEFAULT '[]',
  restart_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_services_owner ON user_services(owner_id);
CREATE INDEX IF NOT EXISTS idx_user_services_site ON user_services(site_id);

-- ============================================================
-- CUSTOM DOMAINS (via nip.io wildcard DNS)
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_domains (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES user_services(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_domains_service ON custom_domains(service_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);