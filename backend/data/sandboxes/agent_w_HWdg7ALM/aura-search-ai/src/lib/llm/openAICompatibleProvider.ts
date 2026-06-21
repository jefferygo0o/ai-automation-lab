// ==========================================
// OpenAI-Compatible LLM Provider
// Works with OpenAI, Groq, Together, LM Studio, etc.
// ==========================================

import { LLMProvider, LLMResponse, LLMOptions } from "@/lib/types";
import { config } from "@/lib/utils/env";

export const openAICompatibleProvider: LLMProvider = {
  name: "openai-compatible",

  async generate(
    prompt: string,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const baseUrl = config.openaiBaseUrl.replace(/\/$/, "");
    const apiKey = config.openaiApiKey;
    const model = options?.model || config.openaiModel || "gpt-3.5-turbo";

    const url = `${baseUrl}/chat/completions`;

    const messages: any[] = [];

    if (options?.system) {
      messages.push({ role: "system", content: options.system });
    }

    messages.push({ role: "user", content: prompt });

    const body = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `OpenAI-compatible API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();

      return {
        text: data.choices?.[0]?.message?.content || "",
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : undefined,
      };
    } catch (error: any) {
      if (
        error.name === "AbortError" ||
        error.name === "TimeoutError" ||
        error.code === "UND_ERR_CONNECT_TIMEOUT"
      ) {
        throw new Error("API connection timeout. Check your endpoint URL.");
      }
      throw error;
    }
  },
};
