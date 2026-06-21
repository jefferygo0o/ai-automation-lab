/**
 * AuraSearch AI - Agent Orchestrator
 *
 * The main orchestrator that:
 * 1. Receives user message
 * 2. Classifies intent
 * 3. Assesses risk
 * 4. Uses tools when needed
 * 5. Generates response via LLM
 * 6. Returns structured result
 */

import type { Message, Source, AgentResponse, PendingAction, ToolCall } from "@/lib/types";
import { classifyIntent } from "./intentClassifier";
import { buildAgentPrompt } from "./promptBuilder";
import { classifyRiskFromMessage, needsConfirmation, getConfirmationMessage } from "./riskClassifier";
import { formatResponse, formatError, formatConfirmationRequest } from "./responseFormatter";
import { generateResponse } from "@/lib/llm";
import { searchWeb } from "@/lib/search";
import { actionLogger } from "@/lib/safety/actionLogger";
import { memoryStore } from "@/lib/memory/memoryStore";
import { deduplicateSources } from "@/lib/utils/citations";
import { generatePlan, executePlan, formatPlanForUser } from "./taskPlanner";
import type { TaskPlan, PlanStep } from "./taskPlanner";

// Import tools so they register themselves
import "@/lib/tools/init";
import { getTool, executeToolByName } from "@/lib/tools/types";

export interface OrchestratorInput {
  message: string;
  history?: Message[];
  confirmationId?: string;
  confirmed?: boolean;
}

/**
 * Main agent entry point
 * Called by the API route
 */
export async function processMessage(input: OrchestratorInput): Promise<AgentResponse> {
  const { message, history = [], confirmationId, confirmed } = input;

  try {
    // Handle confirmation responses
    if (confirmed && confirmationId) {
      actionLogger.complete(confirmationId, "User confirmed");
      return formatResponse({
        text: "Action confirmed! Let me proceed with that.",
      });
    }

    // Log the incoming message
    actionLogger.plan(
      "process_message",
      `Processing user message: "${message.slice(0, 100)}..."`,
      "low"
    );

    // Store user message in memory
    memoryStore.add({
      type: "conversation",
      key: "user",
      value: message,
    });

    // Classify intent
    const intent = classifyIntent(message);
    console.log(`[Agent] Intent: ${intent.intent} (confidence: ${intent.confidence})`);

    // Classify risk
    const riskLevel = classifyRiskFromMessage(message);

    // If risk requires confirmation, ask first
    if (needsConfirmation(riskLevel)) {
      const confirmId = actionLogger.plan(
        "request_confirmation",
        message.slice(0, 200),
        riskLevel,
        { originalMessage: message }
      );
      actionLogger.pendingApproval(confirmId);

      return formatConfirmationRequest(
        message,
        getConfirmationMessage(riskLevel, message),
        riskLevel,
        { originalMessage: message }
      );
    }

    // Route based on intent
    switch (intent.intent) {
      case "perform_calculation":
        return handleCalculation(message, history);

      case "check_weather":
        return handleWeather(message, history);

      case "summarize_url":
        return handleSummarizeUrl(message, intent.url || "", history);

      case "browser_action":
        return handleBrowserAction(message, history);

      case "web_search":
      case "factual_question":
      case "compare_products":
      case "general_conversation":
      default:
        // For short conversational messages, try LLM first
        if (intent.intent === "general_conversation" && message.split(" ").length <= 4) {
          return handleConversation(message, history);
        }
        // For everything else, search + LLM
        return handleSearchQuery(message, history, intent.searchQuery);
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Agent] Fatal error:", errorMsg);
    return formatError(errorMsg);
  }
}

// Alias for backward compatibility
export const runAgent = processMessage;

/**
 * Handle a web search query with LLM response
 */
async function handleSearchQuery(
  message: string,
  history: Message[],
  query?: string
): Promise<AgentResponse> {
  const searchQuery = query || message;
  const sources: Source[] = [];

  // Search the web
  actionLogger.plan("web_search", `Searching for: "${searchQuery}"`, "low");
  let searchResults: Source[] = [];

  try {
    const results = await searchWeb(searchQuery, 6);
    searchResults = results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: r.source,
      publishedDate: r.publishedDate,
    }));
    sources.push(...searchResults);
    console.log(`[Agent] Found ${searchResults.length} results`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Search failed";
    console.error(`[Agent] Search error: ${msg}`);
    // Continue without search results
  }

  // Get memory context
  const recentMemory = memoryStore.search({ type: "conversation", limit: 5 });
  const memoryContext = recentMemory
    .map((m) => `[${m.type}] ${m.key}: ${m.value.slice(0, 200)}`)
    .join("\n");

  // Build prompt
  const prompt = buildAgentPrompt({
    userMessage: message,
    conversationHistory: history.slice(-6),
    searchResults: searchResults.length > 0 ? searchResults : undefined,
    memoryContext,
  });

  // Generate response
  try {
    const llmResponse = await generateResponse(prompt, {
      temperature: 0.7,
      maxTokens: 1024,
    });

    const responseText = llmResponse.text;

    // Store assistant response in memory
    memoryStore.add({
      type: "conversation",
      key: "assistant",
      value: responseText.slice(0, 500),
    });

    // Deduplicate sources
    const uniqueSources = deduplicateSources(sources);

    return formatResponse({
      text: responseText,
      sources: uniqueSources,
    });
  } catch (llmError: unknown) {
    const msg = llmError instanceof Error ? llmError.message : "LLM error";
    console.error(`[Agent] LLM error: ${msg}`);

    // Fallback: format search results directly
    if (searchResults.length > 0) {
      let fallback = `Here are the results I found for "${searchQuery}":\n\n`;
      searchResults.slice(0, 4).forEach((r, i) => {
        fallback += `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}\n\n`;
      });
      fallback += "\nWould you like me to read more details from any of these?";
      return formatResponse({ text: fallback, sources: searchResults });
    }

    // Ultimate fallback
    return formatResponse({
      text: `I tried to search for information about "${message}" but ran into a technical issue. Please try again or rephrase your question.`,
      sources: [],
    });
  }
}

/**
 * Handle purely conversational messages
 */
async function handleConversation(
  message: string,
  history: Message[]
): Promise<AgentResponse> {
  const lower = message.toLowerCase().trim();

  // Check for greetings
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)\b/.test(lower)) {
    memoryStore.add({ type: "conversation", key: "assistant", value: "Greeting response" });
    return formatResponse({
      text: "Hello! 👋 I'm Aura, your AI internet assistant. I can search the web, summarize articles, compare products, check weather, and more. What can I help you with?",
    });
  }

  if (lower.includes("thank")) {
    return formatResponse({
      text: "You're welcome! 😊 Let me know if there's anything else I can help you with.",
    });
  }

  if (lower.includes("how are you") || lower.includes("how's it going")) {
    return formatResponse({
      text: "I'm doing great, thanks for asking! I'm here and ready to help. What would you like to explore today?",
    });
  }

  if (lower.includes("who are you") || lower.includes("what are you") || lower.includes("tell me about yourself")) {
    return formatResponse({
      text: "I'm AuraSearch AI — an advanced internet assistant with an animated face. I can search the web, read and summarize webpages, compare products, check weather, perform calculations, and help with online tasks. I'm designed to be your AI companion for exploring the internet!",
    });
  }

  // Try LLM for other conversational messages
  const prompt = buildAgentPrompt({
    userMessage: message,
    conversationHistory: history.slice(-4),
  });

  try {
    const llmResponse = await generateResponse(prompt, {
      temperature: 0.8,
      maxTokens: 512,
    });
    return formatResponse({ text: llmResponse.text });
  } catch {
    return formatResponse({
      text: `I received your message: "${message}". I'm currently running with limited AI capabilities. Feel free to ask me to search the web or check something!`,
    });
  }
}

/**
 * Handle URL summarization
 */
async function handleSummarizeUrl(
  message: string,
  url: string,
  history: Message[]
): Promise<AgentResponse> {
  actionLogger.plan("summarize_url", `Fetching URL: ${url}`, "low");

  const fetchTool = getTool("fetchWebpageTool");
  if (!fetchTool) {
    return formatError("Webpage fetch tool is not available.");
  }

  try {
    const result = await fetchTool.execute({ url, maxLength: 8000 });

    if (!result.success) {
      return formatError(result.error || "Failed to fetch the webpage.");
    }

    const pageData = result.data;
    const prompt = buildAgentPrompt({
      userMessage: message || `Summarize this page: ${url}`,
      conversationHistory: history.slice(-4),
      pageContent: `Title: ${pageData.title}\n\nContent:\n${pageData.content || pageData.textContent || ""}`,
    });

    try {
      const llmResponse = await generateResponse(prompt, {
        temperature: 0.5,
        maxTokens: 800,
      });

      const sources: Source[] = [{
        title: pageData.title || url,
        url: url,
        snippet: (pageData.excerpt || pageData.content || "").slice(0, 300),
        source: "webpage",
      }];

      return formatResponse({ text: llmResponse.text, sources });
    } catch {
      const fallback = `**${pageData.title}**\n\n${(pageData.content || pageData.textContent || "No content available.").slice(0, 2000)}...\n\nSource: ${url}`;
      return formatResponse({
        text: fallback,
        sources: [{ title: pageData.title || url, url, snippet: "", source: "webpage" }],
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return formatError(`Failed to fetch the webpage: ${msg}`);
  }
}

/**
 * Handle calculation requests
 */
async function handleCalculation(
  message: string,
  history: Message[]
): Promise<AgentResponse> {
  const calcTool = getTool("calculatorTool");
  if (!calcTool) {
    return formatError("Calculator tool is not available.");
  }

  const cleaned = message.replace(/calculate|compute|solve|what is|equals|the answer|=/gi, "").trim();

  try {
    const result = await calcTool.execute({ expression: cleaned });

    if (result.success) {
      return formatResponse({
        text: `**Calculation Result:**\n\n${result.data?.expression || cleaned} = **${result.data?.result || "?"}**`,
      });
    }

    // Try LLM for word problems
    const prompt = buildAgentPrompt({
      userMessage: message,
      conversationHistory: history.slice(-2),
    });

    const llmResponse = await generateResponse(prompt, { temperature: 0.3, maxTokens: 500 });
    return formatResponse({ text: llmResponse.text });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Calculation error";
    return formatError(`Could not perform the calculation: ${msg}`);
  }
}

/**
 * Handle weather requests
 */
async function handleWeather(
  message: string,
  _history: Message[]
): Promise<AgentResponse> {
  const weatherTool = getTool("weatherTool");
  if (weatherTool) {
    try {
      const cleaned = message
        .toLowerCase()
        .replace(/weather|temperature|in|for|forecast|how|is|the|what|check|like|outside|hot|cold/gi, "")
        .trim();

      if (!cleaned) {
        return formatResponse({
          text: "Which city would you like to check the weather for? Please let me know the location.",
        });
      }

      const result = await weatherTool.execute({ location: cleaned });
      if (result.success && result.data) {
        const w = result.data;
        return formatResponse({
          text: `**Weather in ${w.location}${w.country ? `, ${w.country}` : ""}**\n\n🌡️ **${w.temperature?.current || w.temperature}**°C\n☁️ ${w.conditions || "N/A"}\n💧 Humidity: ${w.humidity || "N/A"}%\n💨 Wind: ${w.windSpeed || "N/A"} m/s`,
        });
      }
    } catch {
      // Fall through to web search
    }
  }

  return handleSearchQuery(message, [], message);
}

/**
 * Handle browser automation requests (Phase 3 — fully implemented)
 * Uses the real Playwright browser automation tool.
 */
async function handleBrowserAction(
  message: string,
  history: Message[]
): Promise<AgentResponse> {
  const lower = message.toLowerCase();
  let action = "open";
  let url = "";
  let selector = "";
  let value = "";

  // Parse the user's request to determine browser action

  // Check for screenshot
  if (lower.includes("screenshot") || lower.includes("capture")) {
    action = "screenshot";
  }
  // Check for click
  else if (lower.includes("click") || lower.includes("press") || lower.includes("tap")) {
    action = "click";
    // Try to extract what to click on
    const clickMatch = message.match(/(?:click|press|tap)\s+(?:on\s+)?["']?(.+?)["']?\s*(?:button|link|element)?/i);
    if (clickMatch) {
      selector = clickMatch[1].trim();
    }
  }
  // Check for fill form
  else if (lower.includes("fill") || lower.includes("type") || lower.includes("enter")) {
    action = "fillForm";
  }
  // Check for list links
  else if (lower.includes("link") || lower.includes("list")) {
    action = "listLinks";
  }
  // Default: open / navigate
  else {
    action = "open";
  }

  // Extract URL
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    url = urlMatch[0];
  } else {
    // Try to extract a domain-like pattern
    const domainMatch = message.match(/(?:to|at|open|visit|navigate to)\s+(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (domainMatch) {
      url = `https://${domainMatch[2]}`;
    }
  }

  // If extracting from fill form, get the value
  if (action === "fillForm") {
    const valueMatch = message.match(/(?:with|as|value|text|")([^"]{1,100})"/);
    if (valueMatch) {
      value = valueMatch[1];
    }
    if (!selector) {
      const fieldMatch = message.match(/(?:into|in|field|input|box)\s+["']?(.+?)["']?(?:\s+with|\s+as|$)/i);
      if (fieldMatch) {
        selector = fieldMatch[1].trim();
      }
    }
  }

  // Use the task planner for complex requests
  const plan = generatePlan(message);

  // If the plan has multiple steps, present the plan to the user
  if (plan.steps.length > 1) {
    return formatResponse({
      text: `I've created a plan to help with that. Here's what I'll do:\n\n${formatPlanForUser(plan)}\n\nBrowser actions require confirmation. Would you like me to proceed?`,
      action: "task_plan",
      riskLevel: "medium",
    });
  }

  // Single-step: use the browser tool directly
  const browserTool = getTool("browserAutomation");
  if (!browserTool) {
    return formatResponse({
      text: "⚠️ Browser automation tool is not available. Make sure Playwright is installed.\n\nIn the meantime, I can:\n✅ Search the web\n✅ Read and summarize webpages\n✅ Perform calculations\n✅ Check weather",
    });
  }

  try {
    const toolInput: Record<string, any> = { action };

    // Add parameters based on action
    if (action === "open" || action === "read" || action === "listLinks" || action === "screenshot") {
      if (url) toolInput.url = url;
    }

    if (action === "click") {
      if (url) toolInput.url = url;
      // Use a reasonable default selector if none provided
      toolInput.selector = selector || "a, button";
    }

    if (action === "fillForm") {
      if (url) toolInput.url = url;
      toolInput.selector = selector || "input, textarea";
      toolInput.value = value || "text";
    }

    const result = await browserTool.execute(toolInput);

    if (!result.success) {
      return formatResponse({
        text: `I tried to perform that browser action but ran into an issue: ${result.error || "Unknown error"}\n\n**Note:** Browser automation requires Chromium to be properly installed. You can still use my search and webpage reading features in the meantime.`,
        sources: result.sources,
      });
    }

    // Format the response based on action type
    let responseText = "";

    if (action === "screenshot") {
      responseText = `📸 **Screenshot captured!**\n\n`;
      if (result.data?.url) {
        responseText += `Page: ${result.data.url}\n\n`;
      }
      if (result.data?.imageDataUri) {
        // For frontend rendering, include a markdown image
        responseText += `![Screenshot](${result.data.imageDataUri})`;
      }
      responseText += `\n\nThe screenshot has been captured. Would you like me to read the content of this page?`;
    } else if (action === "open" || action === "read") {
      const data = result.data || {};
      responseText = `**${data.title || "Page loaded"}**\n\n`;
      responseText += `${(data.textContent || "No readable content found.").slice(0, 3000)}`;
      if (data.textContent && data.textContent.length > 3000) {
        responseText += `\n\n_Content truncated. Showing first 3000 characters._`;
      }
      if (data.links && data.links.length > 0) {
        responseText += `\n\n**Links found:** ${data.links.length}`;
      }
      responseText += `\n\nSource: ${data.url || url}`;
    } else if (action === "listLinks") {
      const data = result.data || {};
      responseText = `**Links on ${data.title || data.url || "page"}**:\n\n`;
      if (data.links && data.links.length > 0) {
        data.links.slice(0, 30).forEach((link: any, i: number) => {
          responseText += `${i + 1}. [${link.text || "Link ${i+1}"}](${link.href})\n`;
        });
        if (data.links.length > 30) {
          responseText += `\n... and ${data.links.length - 30} more links`;
        }
      } else {
        responseText += "No links found on this page.";
      }
    } else if (action === "click") {
      responseText = `✅ **Clicked element!**\n\n`;
      if (result.data?.newUrl) {
        responseText += `Navigated to: ${result.data.newUrl}\n\n`;
      }
      const content = result.data?.pageContent || "";
      responseText += content.slice(0, 2000);
    } else if (action === "fillForm") {
      responseText = `✅ **Form field filled!**\n\n`;
      responseText += `Field: \`${selector}\`\nValue: "${value || "text"}"`;
    } else {
      responseText = "Browser action completed.";
    }

    return formatResponse({
      text: responseText,
      sources: result.sources,
      action: "browser_action",
      riskLevel: "medium",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Browser automation failed";
    console.error("[Agent] Browser error:", msg);

    return formatResponse({
      text: `⚠️ Browser automation encountered an issue: ${msg}\n\nI can still help with search, webpage reading, and other features. What would you like to do?`,
    });
  }
}
