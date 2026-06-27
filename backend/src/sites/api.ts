import { Hono } from "hono";
import { SiteStore } from "./store.ts";
import { startService, stopService, restartService, getServiceLogs } from "./supervisor.ts";
import { Audit } from "../audit/index.ts";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export const sitesApi = new Hono<{ Variables: { userId: string } }>();

// List all sites
sitesApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const sites = await SiteStore.list(userId);
  return c.json({ sites });
});

// Get a single site
sitesApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const site = await SiteStore.get(c.req.param("id"), userId);
  if (!site) return c.json({ error: "not found" }, 404);
  return c.json({ site });
});

// Create a new site
sitesApi.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as {
    name?: string; variant?: string; parentPathParts?: string[];
  };
  if (!body.name) return c.json({ error: "name required" }, 400);
  const site = await SiteStore.create(userId, body.name, body.variant, body.parentPathParts);
  if (!site) return c.json({ error: "failed to create site" }, 500);
  Audit.record({
    ownerId: userId, actor: "user", action: "site.create",
    targetId: site.id, targetType: "site", metadata: { name: site.name, variant: site.variant },
  });
  return c.json({ site }, 201);
});

// Update a site
sitesApi.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as {
    name?: string; description?: string; isPublic?: boolean;
  };
  const site = await SiteStore.update(c.req.param("id"), userId, body);
  if (!site) return c.json({ error: "not found" }, 404);
  Audit.record({
    ownerId: userId, actor: "user", action: "site.update",
    targetId: site.id, targetType: "site",
  });
  return c.json({ site });
});

// Delete a site
sitesApi.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  // Stop published service if any
  const site = await SiteStore.get(c.req.param("id"), userId);
  if (site?.publishedServiceId) {
    await stopService(site.publishedServiceId);
  }
  const ok = await SiteStore.delete(c.req.param("id"), userId);
  if (!ok) return c.json({ error: "not found" }, 404);
  Audit.record({
    ownerId: userId, actor: "user", action: "site.delete",
    targetId: c.req.param("id"), targetType: "site",
  });
  return c.json({ ok: true });
});

// Publish a site — create a production build and start a service
sitesApi.post("/:id/publish", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as { isPublic?: boolean };
  const site = await SiteStore.get(c.req.param("id"), userId);
  if (!site) return c.json({ error: "not found" }, 404);

  const isPublic = body.isPublic !== false;

  try {
    // Run production build
    const buildProc = Bun.spawn(["bun", "run", "build"], {
      cwd: site.rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [buildStdout, buildStderr, buildExit] = await Promise.all([
      Bun.readableStreamToText(buildProc.stdout),
      Bun.readableStreamToText(buildProc.stderr),
      buildProc.exited,
    ]);
    if (buildExit !== 0) {
      return c.json({ error: `Build failed (exit ${buildExit}):\n${buildStderr.slice(0, 2000)}` }, 400);
    }

    // If already published, restart the existing service
    if (site.publishedServiceId) {
      await restartService(site.publishedServiceId);
      return c.json({ site: await SiteStore.update(site.id, userId, { isPublic }) });
    }

    // Create a new service that serves the built files
    const { ServiceStore } = await import("../services/store.ts");
    const entrypoint = `bun run ${join(site.rootDir, "node_modules", ".bin", "vite")} preview --port $PORT`;
    const service = await ServiceStore.create(userId, {
      label: `site:${site.slug}`,
      mode: "http",
      entrypoint: `cd ${site.rootDir} && bunx vite preview --port $PORT --host 0.0.0.0`,
      workdir: site.rootDir,
      isPublic,
      envVars: { SITE_ROOT: site.rootDir, NODE_ENV: "production" },
    });

    // Update site with service ID
    await SiteStore.update(site.id, userId, { publishedServiceId: service.id, isPublic });

    // Start the service
    const startResult = await startService(service.id);
    if (!startResult.ok) {
      return c.json({ error: `Service start failed: ${startResult.error}` }, 500);
    }

    Audit.record({
      ownerId: userId, actor: "user", action: "site.publish",
      targetId: site.id, targetType: "site", metadata: { serviceId: service.id, isPublic },
    });

    return c.json({ site: await SiteStore.get(site.id, userId), service }, 201);
  } catch (e: any) {
    return c.json({ error: `publish failed: ${e?.message ?? String(e)}` }, 500);
  }
});

// Unpublish a site — stop the service
sitesApi.post("/:id/unpublish", async (c) => {
  const userId = c.get("userId") as string;
  const site = await SiteStore.get(c.req.param("id"), userId);
  if (!site) return c.json({ error: "not found" }, 404);
  if (site.publishedServiceId) {
    await stopService(site.publishedServiceId);
    const { ServiceStore } = await import("../services/store.ts");
    await ServiceStore.delete(site.publishedServiceId, userId);
  }
  await SiteStore.update(site.id, userId, { publishedServiceId: null });
  return c.json({ ok: true });
});

// Get site dev URL (proxy to dev server)
sitesApi.get("/:id/dev-url", async (c) => {
  const userId = c.get("userId") as string;
  const site = await SiteStore.get(c.req.param("id"), userId);
  if (!site) return c.json({ error: "not found" }, 404);
  // Dev server always runs on the lab's own port with a proxy route
  const labBase = process.env.LAB_BASE_URL || `http://localhost:7777`;
  return c.json({ url: `${labBase}/_sites/${site.slug}/` });
});