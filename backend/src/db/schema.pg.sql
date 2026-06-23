-- AI Automation Lab - PostgreSQL Schema
-- Mirrors the SQLite schema with PG-idiomatic types.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
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
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
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
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rrule TEXT NOT NULL,
  prompt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at BIGINT,
  last_error TEXT,
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
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decision TEXT,
  decision_comment TEXT,
  decided_at BIGINT,
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
