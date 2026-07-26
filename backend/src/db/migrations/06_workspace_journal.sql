-- Workspace journal tables. Retention is handled outside startup migrations.
CREATE TABLE IF NOT EXISTS workspace_events (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('write', 'mkdir', 'move', 'rename', 'delete', 'copy', 'restore')),
  source_path TEXT NOT NULL,
  target_path TEXT,
  file_type TEXT DEFAULT 'file',
  file_size BIGINT DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_events_owner ON workspace_events(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_events_path ON workspace_events(owner_id, source_path, created_at DESC);
