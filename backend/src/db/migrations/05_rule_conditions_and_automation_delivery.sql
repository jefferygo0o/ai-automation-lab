-- Add rule conditions, automation delivery fields, model overrides, and access tokens.
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS condition_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS delivery_target_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS model TEXT;
CREATE TABLE IF NOT EXISTS access_tokens (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'chat:write',
  last_used_at BIGINT,
  expires_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_tokens_owner ON access_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_hash ON access_tokens(token_hash);
