/**
 * Persona API routes — CRUD + set-active.
 */
import { Hono } from "hono";
import { PersonaStore } from "./store.ts";
import { Audit } from "../audit/index.ts";

export const personasApi = new Hono<{ Variables: { userId: string } }>();

// List all personas for the current user
personasApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const personas = await PersonaStore.list(userId);
  return c.json({ personas });
});

// Get a single persona
personasApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const persona = await PersonaStore.get(c.req.param("id"), userId);
  if (!persona) return c.json({ error: "not found" }, 404);
  return c.json({ persona });
});

// Create a new persona
personasApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    prompt?: string;
    imageUrl?: string;
    imageHue?: number;
    model?: string;
  };
  if (!body.name) return c.json({ error: "name required" }, 400);
  if (body.prompt === undefined) return c.json({ error: "prompt required" }, 400);

  const persona = await PersonaStore.create(userId, body.name, body.prompt, {
    imageUrl: body.imageUrl,
    imageHue: body.imageHue,
    model: body.model,
  });

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "persona.create",
    targetId: persona.id,
    targetType: "persona",
    metadata: { name: body.name },
  });

  return c.json({ persona }, 201);
});

// Update a persona
personasApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    prompt?: string;
    imageUrl?: string;
    imageHue?: number;
    model?: string;
  };

  const persona = await PersonaStore.update(c.req.param("id"), userId, body);
  if (!persona) return c.json({ error: "not found" }, 404);

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "persona.update",
    targetId: persona.id,
    targetType: "persona",
    metadata: { updated: Object.keys(body).join(",") },
  });

  return c.json({ persona });
});

// Set a persona as the active one
personasApi.post("/:id/activate", async (c) => {
  const userId = c.get("userId") as string;
  const persona = await PersonaStore.setActive(c.req.param("id"), userId);
  if (!persona) return c.json({ error: "not found" }, 404);

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "persona.activate",
    targetId: persona.id,
    targetType: "persona",
  });

  return c.json({ persona });
});

// Delete a persona
personasApi.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const ok = await PersonaStore.delete(c.req.param("id"), userId);
  if (!ok) return c.json({ error: "not found" }, 404);

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "persona.delete",
    targetId: c.req.param("id"),
    targetType: "persona",
  });

  return c.json({ ok: true });
});
