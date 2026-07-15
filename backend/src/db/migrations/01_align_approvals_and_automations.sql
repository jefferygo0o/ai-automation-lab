-- Migration: align approval_requests + automations schemas with what the code expects.
--
-- Background: the code in src/approvals/index.ts (Approvals.create) inserts into
-- columns (kind, title, body, payload_json, response, resolved_at) that don't exist
-- in the schema. The current schema has (tool_call_id, tool_name, arguments_json,
-- summary, decision, decision_comment, decided_at) instead.
--
-- Same for automations: code inserts (active, last_run_at, last_error, prompt) while
-- the schema has (description, last_run, prompt, enabled). Also agent_id is NOT NULL,
-- but the agent tool creates automations with no agent.
--
-- This migration is idempotent: every ALTER uses IF NOT EXISTS.

-- === approval_requests ===
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='kind') THEN
    ALTER TABLE approval_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'tool';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='title') THEN
    ALTER TABLE approval_requests ADD COLUMN title TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='body') THEN
    ALTER TABLE approval_requests ADD COLUMN body TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='payload_json') THEN
    ALTER TABLE approval_requests ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='response') THEN
    ALTER TABLE approval_requests ADD COLUMN response TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='resolved_at') THEN
    ALTER TABLE approval_requests ADD COLUMN resolved_at BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='tool_call_id') THEN
    ALTER TABLE approval_requests ADD COLUMN tool_call_id TEXT;
  END IF;
  -- Make agent_id nullable so plans don't require an agent
  ALTER TABLE approval_requests ALTER COLUMN agent_id DROP NOT NULL;
  ALTER TABLE approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;
END $$;

-- === automations ===
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automations' AND column_name='active') THEN
    ALTER TABLE automations ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automations' AND column_name='last_run_at') THEN
    ALTER TABLE automations ADD COLUMN last_run_at BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automations' AND column_name='last_error') THEN
    ALTER TABLE automations ADD COLUMN last_error TEXT;
  END IF;
  -- Make agent_id nullable
  ALTER TABLE automations ALTER COLUMN agent_id DROP NOT NULL;
  -- Add enabled alias (some code uses enabled, some uses active)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automations' AND column_name='enabled') THEN
    ALTER TABLE automations ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;