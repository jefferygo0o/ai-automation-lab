import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { AgentStore } from "../agents/registry.ts";
import { getUserTimezone } from "../settings/user.ts";
import { AutomationScheduler } from "./scheduler.ts";
import { validateRRule } from "./rrule.ts";
import { toolRegistry, type ToolContext, type ToolParameters } from "../tools/registry.ts";

const DELIVERY_METHODS = ["none", "email", "sms", "telegram", "slack", "discord"];

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function error(value: string) {
  return { content: [{ type: "text" as const, text: value }], isError: true };
}

function parameterSet(includeId = false): ToolParameters {
  return {
    ...(includeId ? {
      automation_id: {
        type: "string",
        description: "Unique automation identifier",
        required: true,
      },
    } : {}),
    title: {
      type: "string",
      description: "Optional display title. If omitted when creating, it is derived from the instruction.",
      required: false,
    },
    rrule: {
      type: "string",
      description: "Bare RFC 5545 RRULE without DTSTART or TZID, using MINUTELY, HOURLY, DAILY, WEEKLY, MONTHLY, or YEARLY.",
      required: !includeId,
    },
    instruction: {
      type: "string",
      description: "Clear, actionable instruction sent to the current agent when the schedule fires.",
      required: !includeId,
    },
    delivery_method: {
      type: "string",
      description: "Optional result delivery method. Use none to clear delivery.",
      enum: DELIVERY_METHODS,
      required: false,
    },
    model: {
      type: "string",
      description: "Optional model ID override, including a user BYOK ID such as byok:<config_id>.",
      required: false,
    },
    active: {
      type: "string",
      description: "Resume or pause the automation. Only used when editing.",
      enum: ["true", "false"],
      required: false,
    },
  };
}

function titleFromInstruction(instruction: string): string {
  const firstLine = instruction.split(/\r?\n/, 1)[0].trim();
  const title = firstLine.replace(/\s+/g, " ");
  return title.length > 80 ? `${title.slice(0, 77)}...` : title || "Scheduled automation";
}

function normaliseDelivery(value: unknown): string {
  const method = value == null ? "none" : String(value).toLowerCase();
  if (!DELIVERY_METHODS.includes(method)) throw new Error(`delivery_method must be one of: ${DELIVERY_METHODS.join(", ")}`);
  return method;
}

function validateTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
  } catch {
    throw new Error(`invalid timezone: ${timezone}`);
  }
}

async function validateAgent(ownerId: string, agentId: string): Promise<void> {
  if (!(await AgentStore.get(agentId, ownerId))) throw new Error("current agent not found");
}

async function createAutomation(args: any, ctx: ToolContext) {
  const instruction = String(args.instruction ?? "").trim();
  if (!instruction) return error("instruction is required");
  const rrule = String(args.rrule ?? "").trim();
  const scheduleError = validateRRule(rrule);
  if (scheduleError) return error(scheduleError);
  const timezone = await getUserTimezone(ctx.ownerId);
  validateTimezone(timezone);
  await validateAgent(ctx.ownerId, ctx.agentId);
  const deliveryMethod = normaliseDelivery(args.delivery_method);
  const id = `auto_${nanoid()}`;
  const now = Date.now();
  const title = String(args.title ?? titleFromInstruction(instruction)).trim() || "Scheduled automation";
  await db.prepare(
    `INSERT INTO automations
      (id, owner_id, name, description, agent_id, rrule, prompt, active, enabled, timezone, delivery_method, delivery_target_json, model, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, ?, 1, 1, ?, ?, '{}', ?, ?, ?)`
  ).run(id, ctx.ownerId, title, ctx.agentId, rrule, instruction, timezone, deliveryMethod, args.model ? String(args.model) : null, now, now);
  return text(`Created automation ${id} (${title}) for current agent ${ctx.agentId}. Schedule: ${rrule}`);
}

async function editAutomation(args: any, ctx: ToolContext) {
  const id = String(args.automation_id ?? "").trim();
  if (!id) return error("automation_id is required");
  const row = await db.prepare("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(id, ctx.ownerId) as any;
  if (!row) return error("automation not found");
  const sets: string[] = [];
  const values: unknown[] = [];
  if (args.title !== undefined) {
    const title = String(args.title).trim();
    if (!title) return error("title cannot be empty");
    sets.push("name = ?");
    values.push(title);
  }
  if (args.instruction !== undefined) {
    const instruction = String(args.instruction).trim();
    if (!instruction) return error("instruction cannot be empty");
    sets.push("prompt = ?");
    values.push(instruction);
  }
  if (args.rrule !== undefined) {
    const rrule = String(args.rrule).trim();
    const scheduleError = validateRRule(rrule);
    if (scheduleError) return error(scheduleError);
    sets.push("rrule = ?");
    values.push(rrule);
  }
  if (args.delivery_method !== undefined) {
    sets.push("delivery_method = ?");
    values.push(normaliseDelivery(args.delivery_method));
  }
  if (args.model !== undefined) {
    sets.push("model = ?");
    values.push(args.model ? String(args.model) : null);
  }
  if (args.active !== undefined) {
    if (args.active !== "true" && args.active !== "false") return error("active must be the string true or false");
    const active = args.active === "true" ? 1 : 0;
    sets.push("active = ?", "enabled = ?");
    values.push(active, active);
  }
  if (!sets.length) return error("nothing to update");
  sets.push("updated_at = ?");
  values.push(Date.now(), id, ctx.ownerId);
  await db.prepare(`UPDATE automations SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...values);
  return text(`Updated automation ${id}`);
}

async function listAutomations(ctx: ToolContext) {
  const rows = await db.prepare(
    "SELECT id, name, agent_id, rrule, prompt, active, enabled, last_run_at, last_error, delivery_method, model FROM automations WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(ctx.ownerId) as any[];
  if (!rows.length) return text("(no automations)");
  return text(rows.map((row) => {
    const state = row.active !== 0 && row.enabled !== 0 ? "ACTIVE" : "PAUSED";
    const instruction = String(row.prompt ?? "").replace(/\s+/g, " ");
    const summary = instruction.length > 120 ? `${instruction.slice(0, 117)}...` : instruction;
    return `- ${row.id}: ${row.name} [${state}] agent=${row.agent_id ?? "none"} schedule=${row.rrule} delivery=${row.delivery_method ?? "none"}${row.model ? ` model=${row.model}` : ""}\n  ${summary}`;
  }).join("\n"));
}

async function getAutomation(args: any, ctx: ToolContext) {
  const id = String(args.automation_id ?? "").trim();
  if (!id) return error("automation_id is required");
  const row = await db.prepare("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(id, ctx.ownerId) as any;
  if (!row) return error("automation not found");
  const nextRunAt = row.active !== 0
    ? (await import("./scheduler.ts")).getNextRun(row)
    : null;
  return text(JSON.stringify({
    automation_id: row.id,
    title: row.name,
    instruction: row.prompt,
    rrule: row.rrule,
    agent_id: row.agent_id,
    active: row.active !== 0,
    delivery_method: row.delivery_method ?? "none",
    model: row.model ?? null,
    timezone: row.timezone ?? "UTC",
    next_run_at: nextRunAt,
    last_run_at: row.last_run_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }, null, 2));
}

async function deleteAutomation(args: any, ctx: ToolContext) {
  const id = String(args.automation_id ?? "").trim();
  if (!id) return error("automation_id is required");
  const result = await db.prepare("DELETE FROM automations WHERE id = ? AND owner_id = ?").run(id, ctx.ownerId);
  return text(result.changes ? `Deleted automation ${id}` : "automation not found");
}

function registerAutomationTool(name: string, description: string, parameters: ToolParameters, permission: "always" | "ask") {
  toolRegistry.register({
    name,
    description,
    parameters,
    defaultPermission: permission,
    async execute(args, ctx) {
      try {
        if (name === "create_automation" || name === "create_agent") return createAutomation(args, ctx);
        if (name === "edit_automation" || name === "edit_agent") return editAutomation(args, ctx);
        if (name === "list_automations" || name === "list_agents") return listAutomations(ctx);
        if (name === "get_automation") return getAutomation(args, ctx);
        return deleteAutomation(args, ctx);
      } catch (cause: any) {
        return error(cause?.message ?? String(cause));
      }
    },
  });
}

registerAutomationTool(
  "create_automation",
  "Create an automation that runs an AI task on a schedule. The runner is the current Lab agent with all the same tools. Schedules use bare RFC 5545 RRULE syntax. For schedules more often than hourly, obtain user confirmation before calling this tool.",
  parameterSet(),
  "ask",
);
registerAutomationTool(
  "edit_automation",
  "Edit an existing scheduled automation's title, instruction, RRULE, delivery method, model, or active status.",
  parameterSet(true),
  "ask",
);
registerAutomationTool(
  "delete_automation",
  "Delete an existing scheduled automation owned by the current user.",
  { automation_id: { type: "string", description: "Unique automation identifier", required: true } },
  "ask",
);
registerAutomationTool(
  "list_automations",
  "List the current user's scheduled automations with truncated instructions.",
  {},
  "always",
);
registerAutomationTool(
  "get_automation",
  "Get complete details for one scheduled automation, including its full instruction.",
  { automation_id: { type: "string", description: "Unique automation identifier", required: true } },
  "always",
);
registerAutomationTool("create_agent", "Alias of create_automation. Create a scheduled task for the current Lab agent.", parameterSet(), "ask");
registerAutomationTool("edit_agent", "Alias of edit_automation. Edit a scheduled task.", parameterSet(true), "ask");
registerAutomationTool("delete_agent", "Alias of delete_automation. Delete a scheduled task.", { automation_id: { type: "string", description: "Unique automation identifier", required: true } }, "ask");
registerAutomationTool("list_agents", "Alias of list_automations. List scheduled tasks.", {}, "always");
