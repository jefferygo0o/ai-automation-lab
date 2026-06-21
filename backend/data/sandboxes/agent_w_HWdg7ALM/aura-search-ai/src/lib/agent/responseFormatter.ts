// ==========================================
// Response Formatter
// Formats agent responses with proper structure and citations.
// ==========================================

import { Source, PendingAction, ToolCall, AgentResponse, RiskLevel } from "@/lib/types";
import { deduplicateSources, appendSourceFootnotes } from "@/lib/utils/citations";

/**
 * Format the final response to the user.
 */
export function formatResponse(options: {
  text: string;
  sources?: Source[];
  action?: string;
  riskLevel?: RiskLevel;
  pendingAction?: PendingAction;
  toolCalls?: ToolCall[];
}): AgentResponse {
  const { text, sources = [], action, riskLevel, pendingAction, toolCalls } = options;

  // Append source footnotes if not already present
  let formattedText = text;
  if (sources.length > 0 && !text.includes("**Sources:**")) {
    formattedText = appendSourceFootnotes(text, sources);
  }

  return {
    response: formattedText,
    message: formattedText,
    sources: deduplicateSources(sources),
    action,
    riskLevel,
    pendingAction,
    toolCalls,
  };
}

/**
 * Format a greeting message.
 */
export function formatGreeting(): AgentResponse {
  return {
    response:
      "Hello! I'm Aura, your AI internet assistant. I can search the web, summarize articles, compare products, and help with online tasks. How can I help you today?",
    message:
      "Hello! I'm Aura, your AI internet assistant. I can search the web, summarize articles, compare products, and help with online tasks. How can I help you today?",
    sources: [],
  };
}

/**
 * Format an error response.
 */
export function formatError(error: string): AgentResponse {
  return {
    response: `I encountered an error: ${error}. Please try again or rephrase your request.`,
    message: `I encountered an error: ${error}. Please try again or rephrase your request.`,
    sources: [],
    error,
  };
}

/**
 * Format a confirmation request.
 */
export function formatConfirmationRequest(
  action: string,
  description: string,
  riskLevel: RiskLevel,
  details: Record<string, any> = {}
): AgentResponse {
  const id = `confirm_${Date.now()}`;

  return {
    response: `⚠️ **Confirmation Required**\n\n${description}\n\nPlease confirm that I should proceed.`,
    message: `⚠️ **Confirmation Required**\n\n${description}\n\nPlease confirm that I should proceed.`,
    sources: [],
    riskLevel,
    pendingAction: {
      id,
      action,
      description,
      riskLevel,
      details,
    },
  };
}

/**
 * Format a status update (shown during processing).
 */
export function formatStatus(status: string): string {
  return `_${status}_`;
}
