// ==========================================
// Tool Registry - Main Entry Point
// Re-exports everything from the registry in types.ts
// ==========================================

// Import all tools to trigger self-registration
import "./webSearchTool";
import "./fetchWebpageTool";
import "./summarizePageTool";
import "./calculatorTool";
import "./weatherTool";
import "./browserTool";

export {
  registerTool,
  getTool,
  getAllTools,
  getToolNames,
  executeToolByName,
  getToolRiskLevel,
} from "./types";

export type { ToolDefinition, ToolResult } from "./types";
