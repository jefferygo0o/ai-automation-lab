-- Align legacy approval and automation tables with the current PostgreSQL schema.
-- Uses plain idempotent ALTER statements (no dollar-quoted blocks) to avoid
-- the "unterminated dollar-quoted string" error in the startup SQL splitter.

-- Approval_requests: add columns the code expects (kind, title, body, payload_json, response, resolved_at)
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS resolved_at BIGINT;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS tool_call_id TEXT;

-- Make agent_id nullable so plans don't require an agent
ALTER TABLE public.approval_requests ALTER COLUMN agent_id DROP NOT NULL;

-- Make tool_call_id nullable (some approvals don't have a tool call)
ALTER TABLE public.approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;

-- Automations: add columns the scheduler and API expect
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_run_at BIGINT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.automations ALTER COLUMN agent_id DROP NOT NULL;
