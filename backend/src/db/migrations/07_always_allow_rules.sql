-- Migration: add always_allow_rules table for persisting user "always allow" preferences.
-- Store action kinds (read, write, exec, http, etc.) the user has permanently approved.

CREATE TABLE IF NOT EXISTS always_allow_rules (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_kind TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(owner_id, action_kind)
);

CREATE INDEX IF NOT EXISTS idx_always_allow_owner ON always_allow_rules(owner_id);
