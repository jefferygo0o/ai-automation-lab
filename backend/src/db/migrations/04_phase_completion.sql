CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Browser session',
  status TEXT NOT NULL DEFAULT 'stopped',
  current_url TEXT NOT NULL DEFAULT '',
  storage_state_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_started_at BIGINT,
  last_stopped_at BIGINT,
  UNIQUE(owner_id, agent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_owner ON browser_sessions(owner_id);
CREATE TABLE IF NOT EXISTS browser_downloads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_browser_downloads_owner ON browser_downloads(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS service_deployments (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  config_json TEXT NOT NULL DEFAULT '{}',
  build_output TEXT NOT NULL DEFAULT '',
  health_url TEXT NOT NULL DEFAULT '',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  created_at BIGINT NOT NULL,
  deployed_at BIGINT,
  rolled_back_at BIGINT,
  UNIQUE(service_id, version)
);
CREATE INDEX IF NOT EXISTS idx_service_deployments_owner ON service_deployments(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'llm',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents REAL NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_owner ON usage_events(owner_id, created_at DESC);
ALTER TABLE user_services ADD COLUMN IF NOT EXISTS secret_refs TEXT NOT NULL DEFAULT '{}';