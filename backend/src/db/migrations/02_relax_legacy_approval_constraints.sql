-- Relax legacy approval columns retained by older deployments.
ALTER TABLE public.approval_requests ALTER COLUMN tool_call_id DROP NOT NULL;
