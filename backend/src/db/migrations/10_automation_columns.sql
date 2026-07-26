-- Keep existing automation tables compatible with the current API and scheduler.
-- Plain idempotent ALTER statements avoid dollar-quoted blocks in the startup splitter.
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS delivery_target_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_run_at BIGINT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.automations ALTER COLUMN agent_id DROP NOT NULL;
