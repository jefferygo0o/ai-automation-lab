import { db } from "../db/index.ts";
import { toolRegistry } from "../tools/registry.ts";

export const Catalogue = {
  async list(ownerId: string) {
    const providers = await db.prepare("SELECT id, name, kind, base_url, model, enabled FROM provider_registry WHERE owner_id = ? ORDER BY name").all(ownerId);
    const integrations = await db.prepare("SELECT app_slug AS slug, app_name AS name, status FROM integration_connections WHERE owner_id = ? ORDER BY app_name").all(ownerId);
    const skills = await db.prepare("SELECT id, name, description, category, builtin FROM skills WHERE owner_id = ? OR owner_id IS NULL ORDER BY name").all(ownerId);
    const localTools = toolRegistry.all().map((tool) => ({ id: `tool:${tool.name}`, kind: "tool", name: tool.name, description: tool.description, source: "local" }));
    return { providers, integrations, skills, tools: localTools };
  },
  async usage(ownerId: string, days = 30) {
    const since = Date.now() - Math.max(1, Math.min(365, days)) * 86_400_000;
    const runs = await db.prepare("SELECT COUNT(*) AS runs, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_cents), 0) AS cost_cents FROM runs WHERE user_id = ? AND started_at >= ?").get(ownerId, since);
    const tools = await db.prepare("SELECT tool_name, COUNT(*) AS invocations, SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS successful, COALESCE(SUM(duration_ms), 0) AS duration_ms FROM tool_invocations ti INNER JOIN runs r ON r.id = ti.run_id WHERE r.user_id = ? AND ti.started_at >= ? GROUP BY tool_name ORDER BY invocations DESC").all(ownerId, since);
    return { days, since, runs, tools };
  },
};
