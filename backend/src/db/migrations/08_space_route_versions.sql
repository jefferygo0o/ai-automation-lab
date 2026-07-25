-- ============================================================
-- LAB SPACE: Route version history for undo/redo
-- ============================================================

CREATE TABLE IF NOT EXISTS space_route_versions (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'page',
  code TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'edit',
  label TEXT NOT NULL DEFAULT '',
  is_undo INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_route_versions_owner ON space_route_versions(owner_id, route_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_route_versions_path ON space_route_versions(owner_id, path, version DESC);

-- Add current_version tracking to space_routes
ALTER TABLE space_routes ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- LAB SPACE: Site settings table
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_space_settings (
  owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
