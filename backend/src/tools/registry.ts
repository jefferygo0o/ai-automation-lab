/**
 * Tool registry. Each registered tool has:
 *   - name          unique id the LLM uses to call it
 *   - description   shown to the LLM
 *   - parameters    Zod-style JSON schema (OpenAI function calling format)
 *   - permission    default trust level
 *   - execute       the actual logic, given validated args + ToolContext
 */

import type { Sandbox } from "../sandbox/index.ts";

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
