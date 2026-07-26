-- Final plain-SQL repair for automation columns.
-- Keep this migration free of DO blocks so older deployment images can execute it.
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS rrule TEXT NOT NULL DEFAULT 'FREQ=DAILY';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_run_at BIGINT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS next_run_at BIGINT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS delivery_target_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.automations ALTER COLUMN agent_id DROP NOT NULL;
UPDATE public.automations
SET enabled = COALESCE(enabled, active, 1),
    active = COALESCE(active, enabled, 1),
    timezone = COALESCE(NULLIF(timezone, ''), 'UTC'),
    delivery_method = COALESCE(NULLIF(delivery_method, ''), 'none'),
    delivery_target_json = COALESCE(NULLIF(delivery_target_json, ''), '{}');
