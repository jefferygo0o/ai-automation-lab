// ==========================================
// Ollama LLM Provider
// Connects to local Ollama instance via the OpenAI-compatible API.
// ==========================================

import { LLMProvider, LLMResponse, LLMOptions } from "@/lib/types";
import { config } from "@/lib/utils/env";

export const ollamaProvider: LLMProvider = {
  name: "ollama",

  async generate(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = config.ollamaBaseUrl.replace(/\/$/, "");
    const model = options?.model || config.ollamaModel || "llama3.1";

    const url = `${baseUrl}/v1/chat/completions`;

    const messages: any[] = [{ role: "user", content: prompt }];

    const body = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Ollama API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();

      const text =
        data.choices?.[0]?.message?.content || data.response || "";

      return {
        text,
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
        throw new Error(
          "Ollama connection timeout. Make sure Ollama is running (ollama serve)."
        );
      }
      throw error;
    }
  },
};
