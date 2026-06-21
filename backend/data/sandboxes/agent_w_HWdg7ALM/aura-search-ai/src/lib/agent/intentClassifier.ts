// ==========================================
// Intent Classifier - Determines what the user wants
// ==========================================

export type Intent =
  | "general_conversation"
  | "factual_question"
  | "web_search"
  | "summarize_url"
  | "compare_products"
  | "perform_calculation"
  | "check_weather"
  | "browser_action"
  | "confirmation_response"
  | "unknown";

export interface IntentResult {
  intent: Intent;
  confidence: number;
  searchQuery?: string;
  url?: string;
}

export function classifyIntent(message: string): IntentResult {
  const lower = message.toLowerCase().trim();

  // Check for confirmation response first
  if (
    lower.startsWith("confirm") ||
    lower.startsWith("yes") ||
    lower.startsWith("yeah") ||
    lower.startsWith("sure") ||
    lower.startsWith("go ahead") ||
    lower.startsWith("proceed") ||
    lower.startsWith("do it")
  ) {
    return { intent: "confirmation_response", confidence: 0.9 };
  }

  // Check for URL summarization
  const urlRegex = /https?:\/\/[^\s]+/;
  const urlMatch = message.match(urlRegex);
  if (urlMatch) {
    const hasSummarize =
      lower.includes("summarize") ||
      lower.includes("summarise") ||
      lower.includes("read this") ||
      lower.includes("what is") ||
      lower.includes("tell me about");
    return {
      intent: "summarize_url",
      confidence: hasSummarize ? 0.95 : 0.8,
      url: urlMatch[0],
      searchQuery: message.replace(urlRegex, "").trim(),
    };
  }

  // Check for math/calculation
  const mathPattern = /[\d\s]*[\+\-\*\/\%\^\(\)][\d\s]*/;
  if (
    mathPattern.test(message) &&
    (lower.includes("calculate") ||
      lower.includes("compute") ||
      lower.includes("solve") ||
      lower.includes("what is") ||
      lower.includes("=") ||
      /^[\d\s+\-*/().%^]+$/.test(message.replace(/\s/g, "")))
  ) {
    return { intent: "perform_calculation", confidence: 0.85 };
  }

  // Check for weather
  if (
    lower.includes("weather") ||
    lower.includes("temperature") ||
    (lower.includes("how") && lower.includes("outside")) ||
    (lower.includes("forecast")) ||
    (lower.includes("hot") || lower.includes("cold")) && lower.includes("outside")
  ) {
    return { intent: "check_weather", confidence: 0.85, searchQuery: message };
  }

  // Check for product comparison
  if (
    lower.includes("compare") ||
    lower.includes("vs") ||
    lower.includes("versus") ||
    lower.includes("or") && (lower.includes("better") || lower.includes("difference"))
  ) {
    return { intent: "compare_products", confidence: 0.8, searchQuery: message };
  }

  // Check for browser automation actions
  if (
    lower.includes("navigate to") ||
    lower.includes("go to") ||
    lower.includes("open website") ||
    lower.includes("take screenshot") ||
    lower.includes("click on") ||
    lower.includes("fill in") ||
    lower.includes("submit form")
  ) {
    return { intent: "browser_action", confidence: 0.75, searchQuery: message };
  }

  // Check if it looks like a factual question or web search
  const questionWords = ["what", "who", "where", "when", "why", "how", "which", "is", "are", "do", "does", "did", "can", "could", "would", "will"];
  const isQuestion = questionWords.some((w) => lower.startsWith(w)) || lower.includes("?");
  const isSearchIntent =
    lower.includes("search") ||
    lower.includes("find") ||
    lower.includes("look up") ||
    lower.includes("google") ||
    lower.includes("research") ||
    lower.includes("tell me about") ||
    lower.includes("i want to know") ||
    lower.includes("information about") ||
    lower.includes("news about") ||
    lower.includes("latest");

  if (isQuestion || isSearchIntent) {
    return {
      intent: "web_search",
      confidence: isSearchIntent ? 0.9 : 0.7,
      searchQuery: message,
    };
  }

  // Simple greeting / conversation
  const greetings = ["hi", "hello", "hey", "sup", "yo", "good morning", "good afternoon", "good evening", "howdy"];
  if (greetings.some((g) => lower.includes(g)) && message.split(" ").length < 5) {
    return { intent: "general_conversation", confidence: 0.9 };
  }

  // Default to web search for longer messages, conversation for short
  if (message.split(" ").length > 3) {
    return { intent: "web_search", confidence: 0.6, searchQuery: message };
  }

  return { intent: "general_conversation", confidence: 0.7 };
}
