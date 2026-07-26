-- Align legacy approval and automation tables with the current PostgreSQL schema.
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS resolved_at BIGINT;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS tool_call_id TEXT;
ALTER TABLE public.approval_requests ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_run_at BIGINT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.automations ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;
