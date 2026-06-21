// ==========================================
// Environment Variable Configuration
// All secrets come from server-side env vars only.
// No API keys are ever exposed to the frontend.
// ==========================================

export function getEnv(key: string, defaultValue: string = ""): string {
  if (typeof process === "undefined") return defaultValue;
  return process.env[key] || defaultValue;
}

export const config = {
  // LLM - Ollama
  ollamaBaseUrl: getEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
  ollamaModel: getEnv("OLLAMA_MODEL", "llama3.1"),

  // LLM - OpenAI Compatible
  openaiApiKey: getEnv("OPENAI_API_KEY", ""),
  openaiBaseUrl: getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
  openaiModel: getEnv("OPENAI_MODEL", "gpt-3.5-turbo"),

  // LLM - Gemini
  geminiApiKey: getEnv("GEMINI_API_KEY", ""),

  // Search Providers
  braveApiKey: getEnv("BRAVE_SEARCH_API_KEY", ""),
  tavilyApiKey: getEnv("TAVILY_API_KEY", ""),
  searxngBaseUrl: getEnv("SEARXNG_BASE_URL", ""),

  // Weather
  openweatherApiKey: getEnv("OPENWEATHER_API_KEY", ""),

  // Feature flags
  memoryEnabled: getEnv("MEMORY_ENABLED", "true") === "true",
  enableBrowserAutomation: getEnv("ENABLE_BROWSER_AUTOMATION", "false") === "true",

  // Get active LLM provider
  get activeLlmProvider(): string {
    if (this.openaiApiKey) return "openai";
    if (this.geminiApiKey) return "gemini";
    return "ollama"; // default fallback
  },

  // Get active search provider
  get activeSearchProvider(): string {
    if (this.braveApiKey) return "brave";
    if (this.tavilyApiKey) return "tavily";
    if (this.searxngBaseUrl) return "searxng";
    return "duckduckgo"; // default free option
  },
};

export function validateConfig(): string[] {
  const warnings: string[] = [];

  if (!config.ollamaBaseUrl && !config.openaiApiKey && !config.geminiApiKey) {
    warnings.push(
      "No LLM configured. Set OLLAMA_BASE_URL or OPENAI_API_KEY in .env.local"
    );
  }

  return warnings;
}
