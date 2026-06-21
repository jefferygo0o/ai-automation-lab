// ==========================================
// Tool System - Registry & Types
// ==========================================

import { ToolDefinition, ToolResult } from "@/lib/types";

export type { ToolDefinition, ToolResult } from "@/lib/types";

const toolRegistry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values());
}

export function getToolNames(): string[] {
  return Array.from(toolRegistry.keys());
}

export async function executeToolByName(
  name: string,
  input: any
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: "${name}". Available tools: ${getToolNames().join(", ")}`,
    };
  }
  return tool.execute(input);
}

export function getToolRiskLevel(name: string): "low" | "medium" | "high" {
  const tool = getTool(name);
  return tool?.riskLevel || "low";
}
