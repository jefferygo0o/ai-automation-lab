/**
 * Skill-related tools.
 *
 * The runtime's system prompt already injects the skills index into the
 * agent's prompt, so the LLM knows what skills are available by name.
 * These tools let the agent read, list, and execute skills.
 */

import { toolRegistry, type ToolContext } from "./registry.ts";
import { Skills, type Skill } from "../skills/index.ts";
import { Approvals } from "../approvals/index.ts";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

function renderSkillIndex(skills: Skill[]): string {
  if (!skills.length) return "(no skills installed)";
  return skills
    .map((s) => {
      const inputs = s.inputs?.length ? ` | inputs: ${s.inputs.map((i) => `\`${i.name}\``).join(", ")}` : "";
      const mcp = s.mcp_required?.length ? ` | mcp: ${s.mcp_required.join(", ")}` : "";
      const tag = s.source === "builtin" ? " [built-in]" : "";
      return `- \`${s.id}\`${tag}: ${s.name} — ${s.description}${inputs}${mcp}`;
    })
    .join("\n");
}

// list_skills
toolRegistry.register({
  name: "list_skills",
  description:
    "List every skill available to this agent, with ids, descriptions, inputs, and required MCP servers. Use this when you need to decide which skill fits a task.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, _ctx) {
    return text(renderSkillIndex(Skills.list()));
  },
});

// read_skill
toolRegistry.register({
  name: "read_skill",
  description:
    "Load the full procedure (markdown body) of a skill by its id. The body is a designed, tested procedure — follow it. Use list_skills first if you don't know the id.",
  parameters: {
    skillId: { type: "string", description: "skill id (e.g. 'web-research')", required: true },
  },
  defaultPermission: "always",
  async execute(args, _ctx) {
    const s = Skills.read(args.skillId);
    if (!s) return err(`skill not found: ${args.skillId}`);
    const fm = [
      `id: ${s.id}`,
      `name: ${s.name}`,
      `description: ${s.description}`,
      s.mcp_required?.length ? `mcp_required: ${s.mcp_required.join(", ")}` : "",
      s.inputs?.length ? `inputs: ${s.inputs.map((i) => `- ${i.name} (${i.type ?? "any"}): ${i.description}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    return text(`---\n${fm}\n---\n\n${s.body}`);
  },
});

// run_skill
toolRegistry.register({
  name: "run_skill",
  description:
    "Execute a named skill. The skill body is treated as a procedure: read it (or use read_skill) and follow its steps. Pass any declared inputs as JSON.",
  parameters: {
    skillId: { type: "string", description: "skill id", required: true },
    inputs: { type: "object", description: "named inputs declared in the skill frontmatter", properties: {}, required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const s = Skills.read(args.skillId);
    if (!s) return err(`skill not found: ${args.skillId}`);

    // Validate required inputs
    const missing: string[] = [];
    for (const inp of s.inputs ?? []) {
      if (inp.required && !(args.inputs && Object.prototype.hasOwnProperty.call(args.inputs, inp.name))) {
        missing.push(inp.name);
      }
    }
    if (missing.length) return err(`missing required inputs: ${missing.join(", ")}`);

    // Check required MCP servers
    for (const mcp of s.mcp_required ?? []) {
      const servers = ctx.mcp.listServers();
      if (!servers.find((sv) => sv.name === mcp && sv.status === "ready")) {
        return err(`skill requires MCP server not connected: ${mcp}`);
      }
    }

    const inputsJson = args.inputs ? JSON.stringify(args.inputs, null, 2) : "{}";
    return text(
      `## Running skill: ${s.name} (id=\`${s.id}\`)\n\n### Procedure\n${s.body}\n\n### Inputs\n\`\`\`json\n${inputsJson}\n\`\`\`\n\nFollow the steps above. Use the tool calls the procedure specifies.`,
    );
  },
});

// propose_plan — writes a plan AND creates a pending approval that the user
// must resolve before the agent can continue.
toolRegistry.register({
  name: "propose_plan",
  description:
    "Write a multi-step plan for the user to review BEFORE you execute it. Creates a pending approval request; the user must approve it before the agent can proceed.",
  parameters: {
    plan: { type: "string", description: "the plan text (markdown)", required: true },
    risks: { type: "string", description: "optional risk callouts", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.plan) return err("plan is required");
    try {
      const id = Approvals.create({
        ownerId: ctx.ownerId,
        chatId: ctx.chatId,
        runId: ctx.runId,
        type: "plan",
        summary: args.plan.slice(0, 200),
        payload: { plan: args.plan, risks: args.risks },
      });
      return text(`## Plan proposed for review\n\n${args.plan}\n\n${args.risks ? `### Risks\n${args.risks}\n` : ""}\n\n(approval id: ${id} — waiting for user to approve in the UI before continuing)`);
    } catch (e: any) {
      return err(`failed to create approval: ${e?.message ?? String(e)}`);
    }
  },
});

// wait_for_approval
toolRegistry.register({
  name: "wait_for_approval",
  description:
    "Pause execution until the user explicitly approves the pending plan or tool call. Returns once the user has approved, denied, or 5 minutes have elapsed (auto-deny).",
  parameters: {
    reason: { type: "string", description: "short human-readable description of what needs approval", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    try {
      const id = Approvals.create({
        ownerId: ctx.ownerId,
        chatId: ctx.chatId,
        runId: ctx.runId,
        type: "action",
        summary: args.reason,
        payload: { reason: args.reason },
      });
      return text(`Approval requested: ${args.reason}\n(approval id: ${id} — waiting for user to approve in the UI before continuing)`);
    } catch (e: any) {
      return err(`failed to create approval: ${e?.message ?? String(e)}`);
    }
  },
});
