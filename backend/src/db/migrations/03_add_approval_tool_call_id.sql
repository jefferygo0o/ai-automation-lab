DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'approval_requests') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'approval_requests' AND column_name = 'tool_call_id'
    ) THEN
      ALTER TABLE approval_requests ADD COLUMN tool_call_id TEXT;
    END IF;
    ALTER TABLE approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;
  END IF;
END $$;
