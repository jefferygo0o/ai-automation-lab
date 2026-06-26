/**
 * Rules API — CRUD + toggle for persistent behavioural constraints.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { RuleStore } from "./store.ts";
import { Audit } from "../audit/index.ts";

export const rulesApi = new Hono<HonoEnv>();

// List all rules for the current user
rulesApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const rules = await RuleStore.list(userId);
  return c.json({ rules });
});

// Get a single rule
rulesApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const rule = await RuleStore.get(c.req.param("id"), userId);
  if (!rule) return c.json({ error: "not found" }, 404);
  return c.json({ rule });
});

// Create a new rule
rulesApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as {
    name?: string; instruction?: string; description?: string; category?: string; priority?: number;
  };
  if (!body.name) return c.json({ error: "name required" }, 400);
  if (!body.instruction) return c.json({ error: "instruction required" }, 400);

  const rule = await RuleStore.create(userId, body.name, body.instruction, {
    description: body.description,
    category: body.category,
    priority: body.priority,
  });

  Audit.record({
    ownerId: userId, actor: "user", action: "rule.create",
    targetId: rule.id, targetType: "rule", metadata: { name: body.name },
  });

  return c.json({ rule }, 201);
});

// Update a rule
rulesApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as {
    name?: string; instruction?: string; description?: string; category?: string; priority?: number; enabled?: boolean;
  };

  const rule = await RuleStore.update(c.req.param("id"), userId, body);
  if (!rule) return c.json({ error: "not found" }, 404);

  Audit.record({
    ownerId: userId, actor: "user", action: "rule.update",
    targetId: rule.id, targetType: "rule", metadata: { updated: Object.keys(body).join(",") },
  });

  return c.json({ rule });
});

// Toggle a rule on/off
rulesApi.post("/:id/toggle", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as { enabled?: boolean };
  const enabled = body.enabled !== false; // default to true

  const rule = await RuleStore.toggle(c.req.param("id"), userId, enabled);
  if (!rule) return c.json({ error: "not found" }, 404);

  Audit.record({
    ownerId: userId, actor: "user", action: "rule.toggle",
    targetId: rule.id, targetType: "rule", metadata: { enabled },
  });

  return c.json({ rule });
});

// Delete a rule
rulesApi.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const ok = await RuleStore.delete(c.req.param("id"), userId);
  if (!ok) return c.json({ error: "not found" }, 404);

  Audit.record({
    ownerId: userId, actor: "user", action: "rule.delete",
    targetId: c.req.param("id"), targetType: "rule",
  });

  return c.json({ ok: true });
});
