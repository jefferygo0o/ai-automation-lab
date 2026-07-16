-- Migration: Workspace journal — event-sourced write/move/delete/rename tracking
-- with automatic retention (30-day TTL via cron or on-insert cleanup).

CREATE TABLE IF NOT EXISTS workspace_events (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('write', 'mkdir', 'move', 'rename', 'delete', 'copy', 'restore')),
  source_path TEXT NOT NULL,
  target_path TEXT,
  file_type TEXT DEFAULT 'file',  -- 'file' | 'dir'
  file_size BIGINT DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_events_owner
  ON workspace_events(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_events_path
  ON workspace_events(owner_id, source_path, created_at DESC);

-- Retention: clean events older than 30 days
CREATE OR REPLACE FUNCTION cleanup_workspace_events() RETURNS void AS $$
BEGIN
  DELETE FROM workspace_events WHERE created_at < EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000;
END;
$$ LANGUAGE plpgsql;
