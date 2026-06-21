// ==========================================
// LLM Provider Factory
// ==========================================

import { LLMProvider, LLMResponse, LLMOptions } from "@/lib/types";
import { config } from "@/lib/utils/env";
import { ollamaProvider } from "./ollamaProvider";
import { openAICompatibleProvider } from "./openAICompatibleProvider";

export function getLLMProvider(): LLMProvider {
  switch (config.activeLlmProvider) {
    case "openai":
      if (config.openaiApiKey) return openAICompatibleProvider;
    case "ollama":
    default:
      return ollamaProvider;
  }
}

export async function generateResponse(
  prompt: string,
  options?: LLMOptions
): Promise<LLMResponse> {
  const provider = getLLMProvider();
  return provider.generate(prompt, options);
}

export { ollamaProvider } from "./ollamaProvider";
export { openAICompatibleProvider } from "./openAICompatibleProvider";
