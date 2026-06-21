// ==========================================
// Prompt Builder - Constructs prompts for the LLM
// ==========================================

import type { Message, Source } from "@/lib/types";

interface BuildPromptOptions {
  systemPrompt?: string;
  userMessage: string;
  conversationHistory?: Message[];
  searchResults?: Source[];
  pageContent?: string;
  toolResults?: string;
  memoryContext?: string;
}

export function buildAgentPrompt(options: BuildPromptOptions): string {
  const {
    userMessage,
    conversationHistory = [],
    searchResults,
    pageContent,
    toolResults,
    memoryContext,
  } = options;

  const parts: string[] = [];

  // System prompt
  parts.push(`You are AuraSearch AI, an advanced AI internet assistant with an animated face interface.
You help users by searching the web, reading webpages, summarizing information, and performing safe online tasks.

## Core Rules:
1. Be helpful, accurate, and concise.
2. When citing web sources, use numbered citations like [1], [2], etc.
3. Always include source URLs when providing factual information from the web.
4. If you're uncertain, say so.
5. Never claim to have completed an action unless you actually did.
6. Keep responses clear and well-structured.
7. Use markdown formatting when helpful (tables, lists, etc.).
8. Ask clarifying questions when the user's request is ambiguous.
9. After answering, suggest a helpful follow-up when appropriate.
10. You can perform calculations and answer from your knowledge too.`);

  // Conversation history
  if (conversationHistory.length > 0) {
    parts.push("\n## Recent Conversation Context:");
    const recentHistory = conversationHistory.slice(-6);
    for (const msg of recentHistory) {
      const prefix = msg.role === "user" ? "User" : "Assistant";
      if (msg.content) {
        parts.push(`${prefix}: ${msg.content.slice(0, 500)}`);
      }
    }
  }

  // Memory context
  if (memoryContext) {
    parts.push(`\n## Remembered Context:\n${memoryContext}`);
  }

  // Search results
  if (searchResults && searchResults.length > 0) {
    parts.push("\n## Web Search Results:");
    searchResults.forEach((result, i) => {
      parts.push(
        `[${i + 1}] ${result.title}\n    URL: ${result.url}\n    Snippet: ${result.snippet}\n    Source: ${result.source}`
      );
    });
    parts.push(
      "\nUse the above search results to answer the user's question. Cite sources using [1], [2], etc."
    );
  }

  // Page content
  if (pageContent) {
    const truncated = pageContent.slice(0, 6000);
    parts.push(`\n## Page Content:\n${truncated}`);
  }

  // Tool results
  if (toolResults) {
    parts.push(`\n## Tool Results:\n${toolResults}`);
  }

  // User message
  parts.push(`\n## User Request:\n${userMessage}`);

  parts.push("\n## Response:\nProvide your answer. If you used web sources, cite them with [1], [2] etc. at the relevant points, and list the sources at the end.");

  return parts.join("\n");
}
