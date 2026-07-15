/**
 * Tool registry. Each registered tool has:
 *   - name          unique id the LLM uses to call it
 *   - description   shown to the LLM
 *   - parameters    Zod-style JSON schema (OpenAI function calling format)
 *   - permission    default trust level
 *   - execute       the actual logic, given validated args + ToolContext
 */

import type { Sandbox } from "../sandbox/index.ts";
import { Audit } from "../audit/index.ts";
import { rateLimit, incrementHourly } from "../security/ratelimit.ts";

export type ToolPermission = "always" | "ask" | "never";

export type ToolParameters = Record<string, {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: unknown[];
  required?: boolean;
  items?: { type: string; enum?: unknown[]; properties?: ToolParameters };
  properties?: ToolParameters;
}>;

export interface ToolContext {
  agentId: string;
  ownerId: string;
  chatId: string;
  runId: string | null;
  sandbox: Sandbox | null;
  secrets: {
    get(name: string): string | null | Promise<string | null>;
  };
  mcp: {
    call(server: string, tool: string, args: unknown): Promise<unknown>;
    listServers(): Array<{ name: string; tools: string[]; status: string }>;
  };
  abort: AbortSignal;
  onLog: (entry: ToolLogEntry) => void;
  onApproval?: (approval: { approvalId: string; title: string; body: string; status: string }) => void | Promise<void>;
}

export interface ToolLogEntry {
  tool: string;
  args: unknown;
  result: string;
  ok: boolean;
  durationMs: number;
  at: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  defaultPermission: ToolPermission;
  execute(args: any, ctx: ToolContext): Promise<unknown>;
}

export interface ToolExecutionPolicy {
  allowed: boolean;
  permission: ToolPermission;
  reason?: string;
}

export interface ToolBrokerContext {
  tool: Tool;
  args: unknown;
  ctx: ToolContext;
  policy: ToolExecutionPolicy;
}

class Registry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  all(): Tool[] {
    return Array.from(this.tools.values());
  }

  toOpenAI(includeNames?: Set<string>) {
    return this.all()
      .filter((t) => !includeNames || includeNames.has(t.name))
      .map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: zodLikeToJsonSchema(t.parameters),
        },
      }));
  }

  async execute(name: string, args: unknown, ctx: ToolContext): Promise<{ result: unknown; ok: boolean; policy: ToolExecutionPolicy; durationMs: number }> {
    const tool = this.get(name);
    if (!tool) return { result: { error: `unknown tool: ${name}` }, ok: false, policy: { allowed: false, permission: "never", reason: "unknown tool" }, durationMs: 0 };
    const policy = await this.policy(tool, ctx);
    if (!policy.allowed) return { result: { error: policy.reason ?? "tool denied" }, ok: false, policy, durationMs: 0 };
    const started = Date.now();
    try {
      const result = await tool.execute(args, ctx);
      const ok = !(result && typeof result === "object" && (result as any).isError === true);
      await Audit.record({ ownerId: ctx.ownerId, actor: "agent", action: "tool.execute", targetId: name, targetType: "tool", metadata: { args, ok, runId: ctx.runId, durationMs: Date.now() - started } });
      return { result, ok, policy, durationMs: Date.now() - started };
    } catch (error: any) {
      const result = { error: error?.message ?? String(error) };
      await Audit.record({ ownerId: ctx.ownerId, actor: "agent", action: "tool.error", targetId: name, targetType: "tool", metadata: { runId: ctx.runId, error: result.error } });
      return { result, ok: false, policy, durationMs: Date.now() - started };
    }
  }

  async policy(tool: Tool, ctx: ToolContext): Promise<ToolExecutionPolicy> {
    const limit = rateLimit(`${ctx.ownerId}:tool:${tool.name}`);
    if (!limit.allowed) return { allowed: false, permission: tool.defaultPermission, reason: limit.reason };
    const hourly = await incrementHourly(ctx.ownerId);
    if (hourly > 5000) return { allowed: false, permission: tool.defaultPermission, reason: "hourly tool rate limit" };
    return { allowed: tool.defaultPermission !== "never", permission: tool.defaultPermission, reason: tool.defaultPermission === "never" ? "tool policy denies execution" : undefined };
  }
}

export function zodLikeToJsonSchema(params: ToolParameters): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    const prop: Record<string, unknown> = { type: v.type };
    if (v.description) prop.description = v.description;
    if (v.enum) prop.enum = v.enum;
    if (v.type === "array" && v.items) prop.items = v.items;
    if (v.type === "object") {
      if (v.properties && Object.keys(v.properties).length > 0) {
        // Recursive
        prop.properties = zodLikeToJsonSchema(v.properties);
      } else {
        prop.additionalProperties = true;
      }
    }
    properties[k] = prop;
    if (v.required) required.push(k);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export const toolRegistry = new Registry();

export type { Registry };
