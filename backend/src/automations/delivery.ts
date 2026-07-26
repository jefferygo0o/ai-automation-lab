/**
 * Automation delivery — sends run output to configured channels.
 *
 * Supported delivery methods:
 *   email   — via Resend HTTP API (RESEND_API_KEY env var)
 *   slack   — via incoming webhook URL (delivery_target_json.webhook_url)
 *   discord — via incoming webhook URL (delivery_target_json.webhook_url)
 *   sms     — via delivery_target_json.webhook_url (generic POST)
 *   telegram— via delivery_target_json.webhook_url (generic POST)
 *   none    — no delivery
 *
 * Failure notifications are always emailed to the automation owner,
 * regardless of the delivery_method setting.
 */

import { db } from "../db/index.ts";

interface DeliveryTarget {
  webhook_url?: string;
  to?: string;
  channel?: string;
}

interface AutomationRow {
  id: string;
  owner_id: string;
  name: string;
  delivery_method?: string;
  delivery_target_json?: string;
}

interface UserRow {
  id: string;
  email: string;
}

function parseTarget(json?: string): DeliveryTarget {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id, email FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  return row?.email ?? null;
}

// ── Resend email sender ──────────────────────────────────────────────

async function sendEmailViaResend(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[delivery] RESEND_API_KEY not set — cannot send email");
    return false;
  }
  const from = process.env.RESEND_FROM || "AI Automation Lab <onboarding@resend.dev>";
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[delivery] Resend API error ${resp.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[delivery] Resend fetch failed:`, err?.message);
    return false;
  }
}

// ── Webhook sender (Slack, Discord, generic) ────────────────────────

async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[delivery] webhook error ${resp.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[delivery] webhook fetch failed:`, err?.message);
    return false;
  }
}

function formatSlackPayload(autoName: string, output: string, status: string, runId: string): Record<string, unknown> {
  const color = status === "completed" ? "#36a64f" : "#cc0000";
  const truncated = output.length > 2000 ? output.slice(0, 1997) + "..." : output;
  return {
    attachments: [{
      color,
      title: `Automation: ${autoName}`,
      text: truncated || "(no output)",
      footer: `Run ${runId} | ${status}`,
      ts: Math.floor(Date.now() / 1000),
    }],
  };
}

function formatDiscordPayload(autoName: string, output: string, status: string, runId: string): Record<string, unknown> {
  const color = status === "completed" ? 0x36a64f : 0xcc0000;
  const truncated = output.length > 2000 ? output.slice(0, 1997) + "..." : output;
  return {
    embeds: [{
      title: `Automation: ${autoName}`,
      description: truncated || "(no output)",
      color,
      footer: { text: `Run ${runId} | ${status}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

function formatGenericPayload(autoName: string, output: string, status: string, runId: string): Record<string, unknown> {
  return {
    automation_id: runId,
    automation_name: autoName,
    status,
    output: output.slice(0, 10_000),
    timestamp: new Date().toISOString(),
  };
}

// ── Public API ──────────────────────────────────────────────────────

export async function deliverResult(
  auto: AutomationRow,
  output: string,
  status: "completed" | "failed",
  runId: string,
): Promise<void> {
  const method = auto.delivery_method ?? "none";
  if (method === "none") return;

  const target = parseTarget(auto.delivery_target_json);

  switch (method) {
    case "email": {
      const to = target.to || (await getUserEmail(auto.owner_id));
      if (!to) { console.warn(`[delivery] no email address for owner ${auto.owner_id}`); return; }
      const subject = status === "completed"
        ? `[Lab] Automation "${auto.name}" completed`
        : `[Lab] Automation "${auto.name}" failed`;
      await sendEmailViaResend(to, subject, output.slice(0, 50_000));
      break;
    }
    case "slack": {
      if (!target.webhook_url) { console.warn(`[delivery] slack delivery but no webhook_url`); return; }
      await sendWebhook(target.webhook_url, formatSlackPayload(auto.name, output, status, runId));
      break;
    }
    case "discord": {
      if (!target.webhook_url) { console.warn(`[delivery] discord delivery but no webhook_url`); return; }
      await sendWebhook(target.webhook_url, formatDiscordPayload(auto.name, output, status, runId));
      break;
    }
    case "sms":
    case "telegram": {
      if (!target.webhook_url) { console.warn(`[delivery] ${method} delivery but no webhook_url`); return; }
      await sendWebhook(target.webhook_url, formatGenericPayload(auto.name, output, status, runId));
      break;
    }
    default:
      console.warn(`[delivery] unknown delivery method: ${method}`);
  }
}

/**
 * Send failure notification to the automation owner.
 * This fires regardless of the delivery_method setting —
 * "even with delivery: none, failures email you."
 */
export async function notifyFailure(auto: AutomationRow, error: string, runId: string): Promise<void> {
  const email = await getUserEmail(auto.owner_id);
  if (!email) {
    console.warn(`[delivery] cannot notify failure — no email for owner ${auto.owner_id}`);
    return;
  }
  const subject = `[Lab] Automation "${auto.name}" failed`;
  const body = [
    `Automation: ${auto.name} (${auto.id})`,
    `Run ID: ${runId}`,
    `Schedule: ${auto.rrule ?? "unknown"}`,
    "",
    "Error:",
    error.slice(0, 10_000),
    "",
    `Time: ${new Date().toISOString()}`,
  ].join("\n");
  await sendEmailViaResend(email, subject, body);
}
