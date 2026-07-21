/**
 * Approvals API — list pending, resolve (approve/reject/always-allow), manage always-allow rules.
 *
 * IMPORTANT: Route ordering matters. Static paths must come before `/:id`
 * so "always-allow" and "categories" aren't captured as the `:id` param.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { Approvals } from "./index.ts";
import { AlwaysAllowStore } from "./always_allow.ts";
import { getToolCategory, allCategories } from "./tool_categories.ts";
import { Audit } from "../audit/index.ts";

export const approvalsApi = new Hono<HonoEnv>();

// ═══════════════════════════════════════════════════════════════
// Static routes (must come BEFORE /:id)
// ═══════════════════════════════════════════════════════════════

// ─── Pending ───
approvalsApi.get("/pending", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ approvals: await Approvals.listPending(userId) });
});

// ─── Always-allow rules ───
approvalsApi.get("/always-allow/list", async (c) => {
  const userId = c.get("userId") as string;
  const rules = await AlwaysAllowStore.list(userId);
  return c.json({ rules });
});

approvalsApi.delete("/always-allow/:kind", async (c) => {
  const userId = c.get("userId") as string;
  const kind = c.req.param("kind");
  const removed = await AlwaysAllowStore.remove(userId, kind);
  if (!removed) return c.json({ error: "rule not found" }, 404);
  Audit.record({ ownerId: userId, actor: "user", action: "approval.remove-always-allow", targetId: kind, targetType: "approval" });
  return c.json({ removed: true });
});

// ─── Tool categories ───
approvalsApi.get("/categories/list", async (c) => {
  return c.json({ categories: allCategories() });
});

// ═══════════════════════════════════════════════════════════════
// Dynamic routes (/:id catches a specific approval)
// ═══════════════════════════════════════════════════════════════

approvalsApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const a = await Approvals.get(c.req.param("id"));
  if (!a || a.ownerId !== userId) return c.json({ error: "not found" }, 404);
  return c.json({ approval: a });
});

// ─── Approve ───
approvalsApi.post("/:id/approve", async (c) => {
  const userId = c.get("userId") as string;
  const existing = await Approvals.get(c.req.param("id"));
  if (!existing || existing.ownerId !== userId) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({})) as { response?: string };
  const a = await Approvals.resolve(c.req.param("id"), "approved", body.response);
  if (!a) return c.json({ error: "not found or already resolved" }, 404);
  Audit.record({ ownerId: userId, actor: "user", action: "approval.approve", targetId: a.id, targetType: "approval" });
  return c.json({ approval: a });
});

// ─── Reject ───
approvalsApi.post("/:id/reject", async (c) => {
  const userId = c.get("userId") as string;
  const existing = await Approvals.get(c.req.param("id"));
  if (!existing || existing.ownerId !== userId) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({})) as { response?: string };
  const a = await Approvals.resolve(c.req.param("id"), "rejected", body.response);
  if (!a) return c.json({ error: "not found or already resolved" }, 404);
  Audit.record({ ownerId: userId, actor: "user", action: "approval.reject", targetId: a.id, targetType: "approval" });
  return c.json({ approval: a });
});

// ─── Approve + always allow for this action category ───
approvalsApi.post("/:id/always-allow", async (c) => {
  const userId = c.get("userId") as string;
  const existing = await Approvals.get(c.req.param("id"));
  if (!existing || existing.ownerId !== userId) return c.json({ error: "not found" }, 404);
  if (existing.status !== "pending") return c.json({ error: "already resolved" }, 400);

  // Extract the tool name from the payload to determine the action category
  const payload = existing.payload as Record<string, unknown> | undefined;
  const toolName = typeof payload?.tool === "string" ? payload.tool : null;
  const actionCategory = toolName ? getToolCategory(toolName) : null;

  if (!actionCategory) {
    return c.json({ error: "could not determine action category for this tool" }, 400);
  }

  // Register the always-allow rule
  const rule = await AlwaysAllowStore.add(userId, actionCategory);

  // Approve the current request
  const a = await Approvals.resolve(c.req.param("id"), "approved", `always allow for ${actionCategory}`);
  if (!a) return c.json({ error: "not found or already resolved" }, 404);

  Audit.record({
    ownerId: userId, actor: "user", action: "approval.always-allow", targetId: a.id, targetType: "approval",
    metadata: { actionCategory },
  });

  return c.json({ approval: a, alwaysAllowRule: rule });
});
