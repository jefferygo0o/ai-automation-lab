-- Personas: named AI identities that shape how agents respond.
-- A user can have multiple personas and switch the active one at any time.
-- The active persona's prompt is injected into the system prompt at runtime.
-- Model/hue/temperature overrides in the persona take precedence over agent config.

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_hue INTEGER NOT NULL DEFAULT -1,  -- HSL hue 0-360, -1 = no tint
  model TEXT NOT NULL DEFAULT '',          -- override LLM model, empty = inherit from agent
  is_active INTEGER NOT NULL DEFAULT 0,   -- only one active persona per user at a time
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personas_owner ON personas(owner_id);
CREATE INDEX IF NOT EXISTS idx_personas_active ON personas(owner_id, is_active) WHERE is_active = 1;

-- Migrations for existing deployments
ALTER TABLE personas ADD COLUMN IF NOT EXISTS image_hue INTEGER NOT NULL DEFAULT -1;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';
