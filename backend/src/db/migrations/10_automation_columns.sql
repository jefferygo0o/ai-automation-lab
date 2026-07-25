-- Keep existing automation tables compatible with the current API and scheduler.
-- This is idempotent for databases created before delivery and timezone support.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automations') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'enabled') THEN
      ALTER TABLE automations ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'timezone') THEN
      ALTER TABLE automations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'delivery_method') THEN
      ALTER TABLE automations ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'none';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'delivery_target_json') THEN
      ALTER TABLE automations ADD COLUMN delivery_target_json TEXT NOT NULL DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'model') THEN
      ALTER TABLE automations ADD COLUMN model TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'active') THEN
      ALTER TABLE automations ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'last_run_at') THEN
      ALTER TABLE automations ADD COLUMN last_run_at BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'last_error') THEN
      ALTER TABLE automations ADD COLUMN last_error TEXT;
    END IF;
    ALTER TABLE automations ALTER COLUMN agent_id DROP NOT NULL;
  END IF;
END $$;
