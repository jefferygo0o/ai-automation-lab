-- Ensure the legacy approval tool call identifier exists and is nullable.
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS tool_call_id TEXT;
ALTER TABLE public.approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;
