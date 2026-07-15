-- AI Automation Lab - Database Schema
-- All tables use TEXT IDs (nanoid) for portability across SQLite/Postgres.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT "user",
  timezone TEXT NOT NULL DEFAULT "UTC",
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_secrets_owner ON secrets(owner_id);

CREATE TABLE IF NOT EXISTS rate_counters (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, hour)
);

-- Agent registry (filesystem-backed content, DB-backed metadata)
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT "",
  tags TEXT NOT NULL DEFAULT "[]",
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT "New chat",
  active_agent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_owner ON chats(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,            -- system | user | assistant | tool
  content TEXT NOT NULL,
  tool_calls TEXT,               -- JSON array
  tool_call_id TEXT,
  name TEXT,
  agent_id TEXT,                 -- which sub-agent (when active_agent_id != chat.agent_id)
  run_id TEXT,                   -- ties together a single user turn + all tool turns
  feedback_rating TEXT,          -- 'up' | 'down' | NULL
  feedback_comment TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

-- Aggregate stats on chats (denormalized for quick dashboards)
-- total_tokens / total_runs / last_run_at are added via migrations

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT "running",  -- running | completed | failed | cancelled
  status_detail TEXT,
  approval_id TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents REAL NOT NULL DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_chat ON runs(chat_id, started_at DESC);

CREATE TABLE IF NOT EXISTS tool_invocations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  result_json TEXT,
  status TEXT NOT NULL DEFAULT "pending",  -- pending | ok | error | denied
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  sandbox_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_run ON tool_invocations(run_id, started_at);

CREATE TABLE IF NOT EXISTS agent_file_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT "",
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_agent ON agent_file_history(agent_id, filename, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,        -- fact | preference | reference | task
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  owner_user_id TEXT,
  source TEXT NOT NULL DEFAULT "agent",
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, kind, key)
);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_items(agent_id);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT "stdio",  -- stdio | sse
  command TEXT,                  -- for stdio
  args TEXT NOT NULL DEFAULT "[]",
  env TEXT NOT NULL DEFAULT "{}",   -- JSON
  url TEXT,                      -- for sse
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_owner ON mcp_servers(owner_id);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,  -- NULL for built-in
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT "general",
  builtin INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner_id);

-- Automations (scheduled agent tasks)
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT "",
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rrule TEXT NOT NULL,           -- RRULE or simple interval string
  prompt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automations_owner ON automations(owner_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT "running",  -- running | completed | failed
  output TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_auto ON automation_runs(automation_id, started_at DESC);

-- Web Space routes
CREATE TABLE IF NOT EXISTS space_routes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT "page",  -- page | api
  code TEXT NOT NULL DEFAULT "",
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_space_routes_owner ON space_routes(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_routes_path_owner ON space_routes(owner_id, path);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,                          -- user | agent | system | webhook
  action TEXT NOT NULL,                         -- e.g. "agent.create", "secret.write"
  target_id TEXT,                               -- e.g. agent_xxx
  target_type TEXT,                             -- e.g. "agent", "skill"
  metadata_json TEXT,                           -- JSON blob
  ip TEXT,
  user_agent TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_owner ON audit_log(owner_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(owner_id, action, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(owner_id, target_type, target_id, at DESC);

-- Approval requests: when an agent proposes a plan that requires user sign-off.
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  run_id TEXT,
  agent_id TEXT,
  tool_call_id TEXT,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | rejected | expired
  decision TEXT,                                 -- approved | rejected
  decision_comment TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_owner ON approval_requests(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_chat ON approval_requests(chat_id, created_at DESC);

-- Webhooks: external HTTP endpoints that can trigger an agent.
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,                          -- HMAC secret
  instruction_template TEXT NOT NULL,            -- e.g. "Process the {{event.type}} event"
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fired_at INTEGER,
  fire_count INTEGER NOT NULL DEFAULT 0,
  reusable INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_owner ON webhook_endpoints(owner_id);

-- Agent templates: pre-built agent packs users can clone. Built-ins live in code, user templates live here.
CREATE TABLE IF NOT EXISTS agent_templates (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,  -- NULL for built-in
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
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_owner ON agent_templates(owner_id, category);

-- Chat feedback: thumbs up/down + comments per message, used for agent improvement.
CREATE TABLE IF NOT EXISTS chat_feedback (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  rating INTEGER NOT NULL,                       -- 1 = up, -1 = down
  comment TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_chat ON chat_feedback(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_msg ON chat_feedback(message_id);

-- Scheduled jobs: an internal queue for the automation scheduler to atomically claim work.
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,                        -- http | agent | cleanup
  payload_json TEXT NOT NULL DEFAULT '{}',
  rrule TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_owner ON scheduled_jobs(owner_id);

-- Observability metrics (rolling counters)
CREATE TABLE IF NOT EXISTS observability_metrics (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,                          -- e.g. "runs.completed", "tools.executed"
  bucket TEXT NOT NULL,                          -- e.g. "2026-06-19", "agent_xxx"
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id, metric, bucket)
);
CREATE INDEX IF NOT EXISTS idx_metrics_owner ON observability_metrics(owner_id, metric, updated_at DESC);

-- Personas: named AI identities per user
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_hue INTEGER NOT NULL DEFAULT -1,
  model TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personas_owner ON personas(owner_id);

-- Agent workspace snapshots
CREATE TABLE IF NOT EXISTS agent_snapshots (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  trigger TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  byte_size INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON agent_snapshots(agent_id, created_at DESC);

-- Rules: persistent behavioural constraints applied to all agents
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_owner ON rules(owner_id);

CREATE TABLE IF NOT EXISTS provider_registry (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  secret_name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_registry_owner ON provider_registry(owner_id, kind);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Browser session',
  status TEXT NOT NULL DEFAULT 'stopped',
  current_url TEXT NOT NULL DEFAULT '',
  storage_state_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_started_at INTEGER,
  last_stopped_at INTEGER,
  UNIQUE(owner_id, agent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_owner ON browser_sessions(owner_id);

CREATE TABLE IF NOT EXISTS browser_downloads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_browser_downloads_owner ON browser_downloads(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS service_deployments (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  config_json TEXT NOT NULL DEFAULT '{}',
  build_output TEXT NOT NULL DEFAULT '',
  health_url TEXT NOT NULL DEFAULT '',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  created_at INTEGER NOT NULL,
  deployed_at INTEGER,
  rolled_back_at INTEGER,
  UNIQUE(service_id, version)
);
CREATE INDEX IF NOT EXISTS idx_service_deployments_owner ON service_deployments(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_services (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT,
  label TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT "http",
  entrypoint TEXT NOT NULL,
  workdir TEXT NOT NULL DEFAULT "",
  local_port INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT "idle",
  pid INTEGER,
  http_url TEXT NOT NULL DEFAULT "",
  tcp_addr TEXT NOT NULL DEFAULT "",
  env_vars TEXT NOT NULL DEFAULT "{}",
  secret_refs TEXT NOT NULL DEFAULT "{}"
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'llm',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_owner ON usage_events(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_adapters (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_adapters_owner ON channel_adapters(owner_id);