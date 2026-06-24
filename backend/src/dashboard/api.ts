/**
 * Dashboard / Observability API — aggregate stats for the user's lab.
 */
import { Hono } from "hono";
import { type HonoEnv } from "../types/hono.ts";
import { db } from "../db/index.ts";

export const dashboardApi = new Hono<HonoEnv>();

const MS_PER_DAY = 86_400_000;

dashboardApi.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const agents = await (await db.query("SELECT COUNT(*) AS n FROM agents WHERE owner_id = ?").get(userId) as { n: number }).n;
  const chats = await (await db.query("SELECT COUNT(*) AS n FROM chats WHERE owner_id = ?").get(userId) as { n: number }).n;
  const messages = await (await db.query(
    `SELECT COUNT(*) AS n FROM messages m
     INNER JOIN chats c ON c.id = m.chat_id
     WHERE c.owner_id = ?`
  ).get(userId) as { n: number }).n;
  const runs = await (await db.query("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(userId) as { n: number }).n;
  const totalTokens = await (await db.query("SELECT COALESCE(SUM(total_tokens), 0) AS t FROM runs WHERE user_id = ?").get(userId) as { t: number }).t;
  const pendingApprovals = await (await db.query(
    "SELECT COUNT(*) AS n FROM approval_requests WHERE owner_id = ? AND status = 'pending'"
  ).get(userId) as { n: number }).n;
  const skills = await (await db.query("SELECT COUNT(*) AS n FROM skills WHERE owner_id = ? OR owner_id IS NULL").get(userId) as { n: number }).n;
  const mcpServers = await (await db.query("SELECT COUNT(*) AS n FROM mcp_servers").get() as { n: number }).n;
  const automations = await (await db.query("SELECT COUNT(*) AS n FROM automations WHERE owner_id = ?").get(userId) as { n: number }).n;
  const webhooks = await (await db.query("SELECT COUNT(*) AS n FROM webhook_endpoints WHERE owner_id = ?").get(userId) as { n: number }).n;
  const last24h = Date.now() - MS_PER_DAY;
  const recentRuns = await (await db.query("SELECT COUNT(*) AS n FROM runs WHERE user_id = ? AND started_at >= ?").get(userId, last24h) as { n: number }).n;
  const failedLast24h = await (await db.query(
    "SELECT COUNT(*) AS n FROM runs WHERE user_id = ? AND started_at >= ? AND status = 'failed'"
  ).get(userId, last24h) as { n: number }).n;
  return c.json({
    counts: { agents, chats, messages, runs, skills, mcpServers, automations, webhooks, pendingApprovals },
    usage: { totalTokens, recentRuns, failedLast24h },
  });
});

dashboardApi.get("/timeseries", async (c) => {
  const userId = c.get("userId") as string;
  const days = Math.min(90, Math.max(1, Number(c.req.query("days") ?? 7)));
  const since = Date.now() - days * MS_PER_DAY;
  // Bucket by day
  const rows = await db.query(
    `SELECT
       (started_at / ${MS_PER_DAY}) * ${MS_PER_DAY} AS day,
       COUNT(*) AS runs,
       COALESCE(SUM(total_tokens), 0) AS tokens,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM runs
     WHERE user_id = ? AND started_at >= ?
     GROUP BY day
     ORDER BY day ASC`
  ).all(userId, since) as Array<{ day: number; runs: number; tokens: number; failed: number }>;
  return c.json({ days, buckets: rows });
});

dashboardApi.get("/top-agents", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db.query(
    `SELECT a.id, a.name, a.description, COUNT(r.id) AS runs, COALESCE(SUM(r.total_tokens), 0) AS tokens
     FROM agents a
     LEFT JOIN runs r ON r.agent_id = a.id
     WHERE a.owner_id = ?
     GROUP BY a.id
     ORDER BY runs DESC
     LIMIT 10`
  ).all(userId) as Array<{ id: string; name: string; description: string; runs: number; tokens: number }>;
  return c.json({ topAgents: rows });
});

dashboardApi.get("/usage", async (c) => {
  const userId = c.get("userId") as string;
  const totalTokens = await (await db.query("SELECT COALESCE(SUM(total_tokens), 0) AS t FROM runs WHERE user_id = ?").get(userId) as { t: number }).t;
  const promptTokens = await (await db.query("SELECT COALESCE(SUM(prompt_tokens), 0) AS t FROM runs WHERE user_id = ?").get(userId) as { t: number }).t;
  const completionTokens = await (await db.query("SELECT COALESCE(SUM(completion_tokens), 0) AS t FROM runs WHERE user_id = ?").get(userId) as { t: number }).t;
  const totalCost = await (await db.query("SELECT COALESCE(SUM(cost_cents), 0) AS t FROM runs WHERE user_id = ?").get(userId) as { t: number }).t;
  return c.json({ totalTokens, promptTokens, completionTokens, totalCostCents: totalCost });
});

dashboardApi.get("/tool-stats", async (c) => {
  const userId = c.get("userId") as string;
  const rows = await db.query(
    `SELECT ti.tool_name AS name, COUNT(*) AS invocations,
       SUM(CASE WHEN ti.status = 'ok' THEN 1 ELSE 0 END) AS ok,
       SUM(CASE WHEN ti.status = 'error' THEN 1 ELSE 0 END) AS errors,
       AVG(ti.duration_ms) AS avg_ms
     FROM tool_invocations ti
     INNER JOIN runs r ON r.id = ti.run_id
     WHERE r.user_id = ?
     GROUP BY ti.tool_name
     ORDER BY invocations DESC
     LIMIT 30`
  ).all(userId) as Array<{ name: string; invocations: number; ok: number; errors: number; avg_ms: number | null }>;
  return c.json({ tools: rows });
});
