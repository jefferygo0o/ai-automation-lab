import { Hono } from "hono";
import { ServiceStore } from "./store.ts";
import { startService, stopService, restartService, getServiceLogs } from "../sites/supervisor.ts";
import { Audit } from "../audit/index.ts";

export const servicesApi = new Hono<{ Variables: { userId: string } }>();

// List all services
servicesApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const services = await ServiceStore.list(userId);
  return c.json({ services });
});

// Get a single service
servicesApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  return c.json({ service: svc });
});

// Create a new standalone service
servicesApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as {
    label?: string; mode?: string; entrypoint?: string; workdir?: string;
    localPort?: number; isPublic?: boolean; envVars?: Record<string, string>;
  };
  if (!body.label) return c.json({ error: "label required" }, 400);
  if (!body.entrypoint) return c.json({ error: "entrypoint required" }, 400);

  const svc = await ServiceStore.create(userId, {
    label: body.label,
    mode: body.mode || "http",
    entrypoint: body.entrypoint,
    workdir: body.workdir,
    localPort: body.localPort,
    isPublic: body.isPublic,
    envVars: body.envVars,
  });
  Audit.record({
    ownerId: userId, actor: "user", action: "service.create",
    targetId: svc.id, targetType: "service", metadata: { label: svc.label, mode: svc.mode },
  });
  return c.json({ service: svc }, 201);
});

// Update a service
servicesApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as {
    label?: string; mode?: string; entrypoint?: string; workdir?: string;
    localPort?: number; isPublic?: boolean | string;
  };
  // Handle isPublic as string "true"/"false" from form-like inputs
  let parsedBody: any = { ...body };
  if (typeof body.isPublic === "string") {
    parsedBody.isPublic = body.isPublic === "true";
  }
  const svc = await ServiceStore.update(c.req.param("id"), userId, parsedBody);
  if (!svc) return c.json({ error: "not found" }, 404);
  Audit.record({
    ownerId: userId, actor: "user", action: "service.update",
    targetId: svc.id, targetType: "service",
  });
  return c.json({ service: svc });
});

// Delete a service
servicesApi.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  await stopService(c.req.param("id"));
  const ok = await ServiceStore.delete(c.req.param("id"), userId);
  if (!ok) return c.json({ error: "not found" }, 404);
  Audit.record({
    ownerId: userId, actor: "user", action: "service.delete",
    targetId: c.req.param("id"), targetType: "service",
  });
  return c.json({ ok: true });
});

// Start a service
servicesApi.post("/:id/start", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  const result = await startService(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error || "start failed" }, 500);
  Audit.record({
    ownerId: userId, actor: "user", action: "service.start",
    targetId: svc.id, targetType: "service",
  });
  const updated = await ServiceStore.get(c.req.param("id"), userId);
  return c.json({ service: updated, ok: true });
});

// Stop a service
servicesApi.post("/:id/stop", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  await stopService(c.req.param("id"));
  Audit.record({
    ownerId: userId, actor: "user", action: "service.stop",
    targetId: svc.id, targetType: "service",
  });
  const updated = await ServiceStore.get(c.req.param("id"), userId);
  return c.json({ service: updated, ok: true });
});

// Restart a service (e.g. after code change)
servicesApi.post("/:id/restart", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  const result = await restartService(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error || "restart failed" }, 500);
  const updated = await ServiceStore.get(c.req.param("id"), userId);
  return c.json({ service: updated, ok: true });
});

// Get service logs
servicesApi.get("/:id/logs", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  const tail = Number(c.req.query("tail") ?? 200);
  const logs = getServiceLogs(c.req.param("id"), tail);
  return c.json({ logs });
});

// Add custom domain (nip.io)
servicesApi.post("/:id/domains", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  const { domain } = await c.req.json().catch(() => ({})) as { domain?: string };
  if (!domain) return c.json({ error: "domain required" }, 400);

  const ok = await ServiceStore.addCustomDomain(c.req.param("id"), domain);
  if (!ok) return c.json({ error: "failed to add domain (may already exist)" }, 409);
  Audit.record({
    ownerId: userId, actor: "user", action: "service.domain_add",
    targetId: svc.id, targetType: "service", metadata: { domain },
  });
  return c.json({ ok: true });
});

// Remove custom domain
servicesApi.delete("/:id/domains/:domainEncoded", async (c) => {
  const userId = c.get("userId") as string;
  const svc = await ServiceStore.get(c.req.param("id"), userId);
  if (!svc) return c.json({ error: "not found" }, 404);
  const domain = decodeURIComponent(c.req.param("domainEncoded"));
  await ServiceStore.removeCustomDomain(c.req.param("id"), domain);
  Audit.record({
    ownerId: userId, actor: "user", action: "service.domain_remove",
    targetId: svc.id, targetType: "service", metadata: { domain },
  });
  return c.json({ ok: true });
});
