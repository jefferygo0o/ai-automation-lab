-- Phase 2: Enable Row-Level Security on all user-owned tables.
-- This migration is idempotent — safe to re-run.
--
-- Strategy:
--   1. SECURITY DEFINER helper functions for cross-table ownership lookups.
--   2. Enable RLS on every table.
--   3. One "isolation" policy per table: USING + WITH CHECK on owner_id = auth.uid().
--      Tables with nullable owner_id (skills, agent_templates) add OR owner_id IS NULL
--      so builtins remain public.
--      Tables with public-facing rows (space_routes) add OR is_public = 1.
--   4. Cross-table ownership uses the helper functions.
--   5. Service role (used by scheduler, migrations, admin) bypasses RLS automatically.

-- ============================================================
-- 1. HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS internally)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_chat_owner(p_chat_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT owner_id FROM chats WHERE id = p_chat_id
$$;

CREATE OR REPLACE FUNCTION public.get_agent_owner(p_agent_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT owner_id FROM agents WHERE id = p_agent_id
$$;

CREATE OR REPLACE FUNCTION public.get_automation_owner(p_auto_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT owner_id FROM automations WHERE id = p_auto_id
$$;

CREATE OR REPLACE FUNCTION public.get_service_owner(p_svc_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT owner_id FROM user_services WHERE id = p_svc_id
$$;

CREATE OR REPLACE FUNCTION public.get_run_chat_owner(p_run_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT c.owner_id FROM runs r JOIN chats c ON c.id = r.chat_id WHERE r.id = p_run_id
$$;

-- ============================================================
-- 2. ENABLE RLS + POLICIES
-- ============================================================
-- Pattern: one FOR ALL policy with USING + WITH CHECK.
-- Service role (used by scheduler, migrations) bypasses RLS automatically.

-- users — each user can only see/modify their own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_isolation ON sessions;
CREATE POLICY sessions_isolation ON sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- secrets
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS secrets_isolation ON secrets;
CREATE POLICY secrets_isolation ON secrets
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- rate_counters (user_id is TEXT)
ALTER TABLE rate_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_counters_isolation ON rate_counters;
CREATE POLICY rate_counters_isolation ON rate_counters
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agents_isolation ON agents;
CREATE POLICY agents_isolation ON agents
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- chats
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chats_isolation ON chats;
CREATE POLICY chats_isolation ON chats
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- messages (owned via chat -> chats.owner_id)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_isolation ON messages;
CREATE POLICY messages_isolation ON messages
  FOR ALL
  USING (get_chat_owner(chat_id) = auth.uid())
  WITH CHECK (get_chat_owner(chat_id) = auth.uid());

-- runs (owned via chat -> chats.owner_id)
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS runs_isolation ON runs;
CREATE POLICY runs_isolation ON runs
  FOR ALL
  USING (get_chat_owner(chat_id) = auth.uid())
  WITH CHECK (get_chat_owner(chat_id) = auth.uid());

-- tool_invocations (owned via run -> runs -> chats.owner_id)
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tool_invocations_isolation ON tool_invocations;
CREATE POLICY tool_invocations_isolation ON tool_invocations
  FOR ALL
  USING (get_run_chat_owner(run_id) = auth.uid())
  WITH CHECK (get_run_chat_owner(run_id) = auth.uid());

-- agent_file_history (owned via agent -> agents.owner_id)
ALTER TABLE agent_file_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_file_history_isolation ON agent_file_history;
CREATE POLICY agent_file_history_isolation ON agent_file_history
  FOR ALL
  USING (get_agent_owner(agent_id) = auth.uid())
  WITH CHECK (get_agent_owner(agent_id) = auth.uid());

-- memory_items (owned via agent -> agents.owner_id)
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_items_isolation ON memory_items;
CREATE POLICY memory_items_isolation ON memory_items
  FOR ALL
  USING (get_agent_owner(agent_id) = auth.uid())
  WITH CHECK (get_agent_owner(agent_id) = auth.uid());

-- mcp_servers
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_servers_isolation ON mcp_servers;
CREATE POLICY mcp_servers_isolation ON mcp_servers
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- skills (builtins with NULL owner_id are visible to all authenticated users)
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS skills_isolation ON skills;
CREATE POLICY skills_isolation ON skills
  FOR ALL
  USING (owner_id = auth.uid() OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid());

-- automations
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automations_isolation ON automations;
CREATE POLICY automations_isolation ON automations
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- automation_runs (owned via automation -> automations.owner_id)
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_isolation ON automation_runs;
CREATE POLICY automation_runs_isolation ON automation_runs
  FOR ALL
  USING (get_automation_owner(automation_id) = auth.uid())
  WITH CHECK (get_automation_owner(automation_id) = auth.uid());

-- space_routes (public routes visible to everyone, private ones owner-only)
ALTER TABLE space_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_routes_isolation ON space_routes;
CREATE POLICY space_routes_isolation ON space_routes
  FOR ALL
  USING (owner_id = auth.uid() OR is_public = 1)
  WITH CHECK (owner_id = auth.uid());

-- audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_isolation ON audit_log;
CREATE POLICY audit_log_isolation ON audit_log
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- approval_requests
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_requests_isolation ON approval_requests;
CREATE POLICY approval_requests_isolation ON approval_requests
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- webhook_endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_endpoints_isolation ON webhook_endpoints;
CREATE POLICY webhook_endpoints_isolation ON webhook_endpoints
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- agent_templates (builtins with NULL owner_id are visible to all)
ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_templates_isolation ON agent_templates;
CREATE POLICY agent_templates_isolation ON agent_templates
  FOR ALL
  USING (owner_id = auth.uid() OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid());

-- chat_feedback
ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_feedback_isolation ON chat_feedback;
CREATE POLICY chat_feedback_isolation ON chat_feedback
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- scheduled_jobs
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_jobs_isolation ON scheduled_jobs;
CREATE POLICY scheduled_jobs_isolation ON scheduled_jobs
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- observability_metrics
ALTER TABLE observability_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS observability_metrics_isolation ON observability_metrics;
CREATE POLICY observability_metrics_isolation ON observability_metrics
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- integration_connections
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_connections_isolation ON integration_connections;
CREATE POLICY integration_connections_isolation ON integration_connections
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_keys_isolation ON api_keys;
CREATE POLICY api_keys_isolation ON api_keys
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- provider_registry
ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_registry_isolation ON provider_registry;
CREATE POLICY provider_registry_isolation ON provider_registry
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- personas
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personas_isolation ON personas;
CREATE POLICY personas_isolation ON personas
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- rules
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rules_isolation ON rules;
CREATE POLICY rules_isolation ON rules
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sites_isolation ON sites;
CREATE POLICY sites_isolation ON sites
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- user_services
ALTER TABLE user_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_services_isolation ON user_services;
CREATE POLICY user_services_isolation ON user_services
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- custom_domains (owned via user_services -> owner_id)
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_domains_isolation ON custom_domains;
CREATE POLICY custom_domains_isolation ON custom_domains
  FOR ALL
  USING (get_service_owner(service_id) = auth.uid())
  WITH CHECK (get_service_owner(service_id) = auth.uid());

-- browser_sessions
ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS browser_sessions_isolation ON browser_sessions;
CREATE POLICY browser_sessions_isolation ON browser_sessions
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- browser_downloads
ALTER TABLE browser_downloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS browser_downloads_isolation ON browser_downloads;
CREATE POLICY browser_downloads_isolation ON browser_downloads
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- service_deployments
ALTER TABLE service_deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_deployments_isolation ON service_deployments;
CREATE POLICY service_deployments_isolation ON service_deployments
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- usage_events
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_events_isolation ON usage_events;
CREATE POLICY usage_events_isolation ON usage_events
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- channel_adapters
ALTER TABLE channel_adapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_adapters_isolation ON channel_adapters;
CREATE POLICY channel_adapters_isolation ON channel_adapters
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- catalog_app_cache
ALTER TABLE catalog_app_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_app_cache_isolation ON catalog_app_cache;
CREATE POLICY catalog_app_cache_isolation ON catalog_app_cache
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- catalog_sync_state
ALTER TABLE catalog_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_sync_state_isolation ON catalog_sync_state;
CREATE POLICY catalog_sync_state_isolation ON catalog_sync_state
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- agent_snapshots (owned via agent -> agents.owner_id)
ALTER TABLE agent_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_snapshots_isolation ON agent_snapshots;
CREATE POLICY agent_snapshots_isolation ON agent_snapshots
  FOR ALL
  USING (get_agent_owner(agent_id) = auth.uid())
  WITH CHECK (get_agent_owner(agent_id) = auth.uid());

-- access_tokens
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_tokens_isolation ON access_tokens;
CREATE POLICY access_tokens_isolation ON access_tokens
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- workspace_events
ALTER TABLE workspace_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_events_isolation ON workspace_events;
CREATE POLICY workspace_events_isolation ON workspace_events
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- Tables deliberately LEFT WITHOUT RLS:
--   integration_action_cache — shared cache, no owner_id.
-- ============================================================
