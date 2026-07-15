-- Relax legacy approval columns retained by older deployments.
-- The current approval model stores kind, title, body, and payload_json.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_requests' AND column_name = 'tool_call_id') THEN
    ALTER TABLE approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_requests' AND column_name = 'tool_name') THEN
    ALTER TABLE approval_requests ALTER COLUMN tool_name DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approval_requests' AND column_name = 'summary') THEN
    ALTER TABLE approval_requests ALTER COLUMN summary DROP NOT NULL;
  END IF;
END $$;
