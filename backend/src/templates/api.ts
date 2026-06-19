/**
 * Templates API — list built-in + user templates; instantiate one into a
 * fresh agent.
 */
import { Hono } from "hono";
import { Templates, type Template } from "./index.ts";
import { AgentStore } from "../agents/registry.ts";
import { Audit } from "../audit/index.ts";
import { nanoid } from "nanoid";

export const templatesApi = new Hono();

templatesApi.get("/", (c) => {
  const category = c.req.query("category");
  const list = category ? Templates.list().filter((t) => t.category === category) : Templates.list();
  return c.json({ templates: list });
});

templatesApi.get("/:id", (c) => {
  const t = Templates.get(c.req.param("id"));
  if (!t) return c.json({ error: "not found" }, 404);
  return c.json({ template: t });
});

/**
 * Instantiate a template into a new agent. Copies system/persona/skills/tools/memory
 * markdown and seeds config.
 */
templatesApi.post("/:id/instantiate", async (c) => {
  const userId = c.get("userId") as string;
  const t = Templates.get(c.req.param("id"));
  if (!t) return c.json({ error: "template not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { name?: string; installSkills?: boolean };
  const agentName = body.name?.trim() || t.name;
  const agent = AgentStore.create(userId, agentName, t.description);

  // Write the markdown files
  const files: Array<[string, string]> = [
    ["system.md", t.systemMd],
    ["persona.md", t.personaMd],
    ["tools.md", t.toolsMd],
    ["skills.md", t.skillsMd],
    ["memory.md", t.memoryMd],
  ];
  for (const [name, content] of files) {
    if (content) AgentStore.writeFile(agent.id, userId, name, content);
  }

  // Apply config
  if (t.config && Object.keys(t.config).length) {
    AgentStore.updateConfig(agent.id, userId, t.config);
  }

  Audit.record({ ownerId: userId, actor: "user", action: "agent.create", targetId: agent.id, targetType: "agent", metadata: { source: "template", templateId: t.id } });

  return c.json({ agent });
});
