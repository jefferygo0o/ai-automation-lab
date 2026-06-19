/**
 * Approvals API — list pending, resolve (approve/reject).
 */
import { Hono } from "hono";
import { Approvals } from "./index.ts";
import { Audit } from "../audit/index.ts";

export const approvalsApi = new Hono();

approvalsApi.get("/pending", (c) => {
  const userId = c.get("userId") as string;
  return c.json({ approvals: Approvals.listPending(userId) });
});

approvalsApi.get("/:id", (c) => {
  const a = Approvals.get(c.req.param("id"));
  if (!a) return c.json({ error: "not found" }, 404);
  return c.json({ approval: a });
});

approvalsApi.post("/:id/approve", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as { response?: string };
  const a = Approvals.resolve(c.req.param("id"), "approved", body.response);
  if (!a) return c.json({ error: "not found or already resolved" }, 404);
  Audit.record({ ownerId: userId, actor: "user", action: "approval.approve", targetId: a.id, targetType: "approval" });
  return c.json({ approval: a });
});

approvalsApi.post("/:id/reject", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({})) as { response?: string };
  const a = Approvals.resolve(c.req.param("id"), "rejected", body.response);
  if (!a) return c.json({ error: "not found or already resolved" }, 404);
  Audit.record({ ownerId: userId, actor: "user", action: "approval.reject", targetId: a.id, targetType: "approval" });
  return c.json({ approval: a });
});
