/**
 * Approvals API — list pending, resolve (approve/reject).
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { Approvals } from "./index.ts";
import { Audit } from "../audit/index.ts";

export const approvalsApi = new Hono<HonoEnv>();

approvalsApi.get("/pending", async (c) => {
  const userId = c.get("userId") as string;
  return c.json({ approvals: await Approvals.listPending(userId) });
});

approvalsApi.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const a = await Approvals.get(c.req.param("id"));
  if (!a || a.ownerId !== userId) return c.json({ error: "not found" }, 404);
  return c.json({ approval: a });
});

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
