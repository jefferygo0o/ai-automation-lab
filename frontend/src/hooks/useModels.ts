import { useState, useEffect } from "react";
import { api } from "../api/client";

export interface ModelPreset {
  id: string;
  provider: string;
  model: string;
  label: string;
  baseUrl?: string;
  apiKeySecret?: string | null;
  icon?: React.ReactNode;
}

/**
 * Fetches available models from the backend. Falls back to defaults
 * if the API endpoint is unavailable (e.g. during development).
 */
export function useModels() {
  const [models, setModels] = useState<ModelPreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ models: Array<{ id: string; name?: string; label?: string; provider: string; model: string; baseUrl?: string; apiKeySecret?: string | null }> }>("/api/models")
      .then((data) => {
        const mapped = (data.models ?? []).map((m) => ({
          id: m.id,
          provider: m.provider,
          model: m.model,
          label: m.label ?? m.name ?? m.id,
          baseUrl: m.baseUrl,
          apiKeySecret: m.apiKeySecret,
        }));
        setModels(mapped);
      })
      .catch(() => {
        // Fallback to default presets if endpoint fails
        setModels([
          { id: "mock", provider: "mock", model: "mock", label: "Mock LLM" },
          { id: "openai/gpt-4.1-mini", provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
          { id: "openai/gpt-4.1", provider: "openai", model: "gpt-4.1", label: "GPT-4.1" },
          { id: "openai/o3-mini", provider: "openai", model: "o3-mini", label: "o3-mini" },
          { id: "anthropic/claude-sonnet-4-20250514", provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
          { id: "anthropic/claude-3-5-haiku", provider: "anthropic", model: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { models, loading };
}
