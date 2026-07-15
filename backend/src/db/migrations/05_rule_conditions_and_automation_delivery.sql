-- Migration: Add rule conditions, automation delivery + timezone fields.
--
-- Rule conditions allow rules to be applied conditionally based on
-- channel, tool, provider, route, or user-message patterns.
--
-- Automation delivery enables email/SMS/Telegram delivery of results
-- and per-automation timezone + model overrides.

DO $$ BEGIN
  -- ============================================================
  -- Rules: condition_json
  -- ============================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rules') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'rules' AND column_name = 'condition_json'
    ) THEN
      ALTER TABLE rules ADD COLUMN condition_json TEXT NOT NULL DEFAULT '{}';
    END IF;
  END IF;

  -- ============================================================
  -- Automations: timezone, delivery_method, delivery_target_json, model
  -- ============================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'automations' AND column_name = 'timezone'
    ) THEN
      ALTER TABLE automations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'automations' AND column_name = 'delivery_method'
    ) THEN
      ALTER TABLE automations ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'none';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'automations' AND column_name = 'delivery_target_json'
    ) THEN
      ALTER TABLE automations ADD COLUMN delivery_target_json TEXT NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'automations' AND column_name = 'model'
    ) THEN
      ALTER TABLE automations ADD COLUMN model TEXT;
    END IF;
  END IF;

  -- ============================================================
  -- Access tokens: richer scopes table
  -- ============================================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'access_tokens') THEN
    CREATE TABLE IF NOT EXISTS access_tokens (
      id TEXT PRIMARY KEY,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      token_prefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT 'chat:write',
      last_used_at BIGINT,
      expires_at BIGINT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_access_tokens_owner ON access_tokens(owner_id);
    CREATE INDEX IF NOT EXISTS idx_access_tokens_hash ON access_tokens(token_hash);
  END IF;
END $$;
