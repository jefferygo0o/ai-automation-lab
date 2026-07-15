/**
 * AgentConfigForm — reusable LLM provider configuration form.
 *
 * Used by:
 *   - AgentEditPage (when editing an agent's config.json)
 *   - SettingsPage → AI → "Add model" (creates a new agent with these settings)
 *
 * Props:
 *   initial: starting config values
 *   secrets: list of stored secret names (for the apiKeySecret dropdown)
 *   onChange: called whenever a field changes (parent owns state)
 *   onSubmit: called with the final ConfigFormData when the user clicks Save
 *   submitLabel: text on the submit button (default "Save")
 *   loading: shows a spinner on the submit button
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Save, Loader2 } from "lucide-react";
import type { SecretMeta } from "../api";

export interface ConfigFormData {
  provider: string;
  baseUrl: string;
  model: string;
  apiKeySecret: string;
  temperature: number;
  maxTokens: number;
}

export const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  groq: "https://api.groq.com/openai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  ollama: "http://localhost:11434",
};

export const PROVIDER_LIST = ["mock", "openai", "anthropic", "groq", "nvidia", "ollama", "custom"];

const DEFAULT_DATA: ConfigFormData = {
  provider: "mock",
  baseUrl: "",
  model: "",
  apiKeySecret: "",
  temperature: 0.7,
  maxTokens: 2048,
};

export default function AgentConfigForm({
  initial,
  secrets,
  onSubmit,
  submitLabel = "Save",
  loading = false,
  showCancel = false,
  onCancel,
  agentId,
  onSaved,
}: {
  initial?: Partial<ConfigFormData>;
  secrets: SecretMeta[];
  onSubmit: (data: ConfigFormData) => void | Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  showCancel?: boolean;
  onCancel?: () => void;
  agentId?: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [data, setData] = useState<ConfigFormData>({ ...DEFAULT_DATA, ...initial });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const onChangeRef = useRef<(d: ConfigFormData) => void>(undefined);
  onChangeRef.current = (d) => onSubmitRef.current?.(d);

  // If agentId is provided and onSubmit wasn't, default to updating agent config.
  const defaultSubmit = useCallback(async (d: ConfigFormData) => {
    if (!agentId) return;
    const { Agents } = await import('../api');
    await Agents.updateConfig(agentId, {
      provider: d.provider,
      baseUrl: d.baseUrl,
      apiKeySecret: d.apiKeySecret || null,
      model: d.model,
      temperature: d.temperature,
      maxTokens: d.maxTokens,
    });
  }, [agentId]);
  const effectiveSubmit = onSubmit ?? defaultSubmit;

  // Forward changes to parent via onChange callback if provided
  // (We use a ref to avoid loops in the auto-fetch useEffect below.)
  const onSubmitRef = useRef<(d: ConfigFormData) => void | Promise<void>>(undefined);
  onSubmitRef.current = effectiveSubmit;

  const update = <K extends keyof ConfigFormData>(field: K, value: ConfigFormData[K]) => {
    setData((p) => ({ ...p, [field]: value }));
  };

  const fetchProviderModels = useCallback(async (provider: string, baseUrl: string, apiKey: string) => {
    if (provider === "mock") {
      setAvailableModels(["mock"]);
      return;
    }
    let url = "";
    if (provider === "anthropic") {
      url = `${baseUrl.replace(/\/$/, "")}/v1/models`;
    } else if (provider === "ollama") {
      url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
    } else {
      url = `${baseUrl.replace(/\/$/, "")}/models`;
    }
    setLoadingModels(true);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (apiKey) {
        headers["authorization"] = `Bearer ${apiKey}`;
      } else if (provider === "anthropic") {
        headers["x-api-key"] = apiKey;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) { setAvailableModels([]); return; }
      const json = await res.json();
      let models: string[] = [];
      if (json.data && Array.isArray(json.data)) {
        models = json.data.map((m: any) => m.id || m.model || "").filter(Boolean);
      } else if (json.models && Array.isArray(json.models)) {
        models = json.models.map((m: any) => m.name || m.model || m.id || "").filter(Boolean);
      }
      models.sort();
      setAvailableModels(models);
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (data.provider === "mock") {
      setAvailableModels(["mock"]);
      return;
    }
    if (!data.baseUrl) return;
    const apiKey = data.apiKeySecret || "";
    fetchProviderModels(data.provider, data.baseUrl, apiKey);
  }, [data.provider, data.baseUrl, data.apiKeySecret, fetchProviderModels]);

  return (
    <div className="space-y-3">
      {/* Provider */}
      <div className="flex flex-col gap-1">
        <label className="label">Provider</label>
        <select
          className="input"
          value={data.provider}
          onChange={(e) => {
            const provider = e.target.value;
            const defaultUrl = PROVIDER_DEFAULTS[provider] || "";
            setData((p) => ({ ...p, provider, baseUrl: defaultUrl }));
          }}
        >
          {PROVIDER_LIST.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Base URL */}
      <div className="flex flex-col gap-1">
        <label className="label">Base URL</label>
        <input
          className="input font-mono"
          value={data.baseUrl}
          onChange={(e) => update("baseUrl", e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      {/* API Key Secret */}
      <div className="flex flex-col gap-1">
        <label className="label">API Key Secret</label>
        <select
          className="input"
          value={data.apiKeySecret}
          onChange={(e) => update("apiKeySecret", e.target.value)}
        >
          <option value="">(none — use env var)</option>
          {secrets.length === 0 && <option value="" disabled>— no secrets yet —</option>}
          {secrets.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div className="flex flex-col gap-1">
        <label className="label">Model</label>
        {data.provider === "mock" ? (
          <input
            className="input font-mono"
            value={data.model}
            onChange={(e) => update("model", e.target.value)}
            placeholder="mock"
          />
        ) : (
          <div className="relative">
            <select
              className="input pr-8"
              value={availableModels.includes(data.model) ? data.model : ""}
              onChange={(e) => update("model", e.target.value)}
            >
              {loadingModels && <option value="">Loading models…</option>}
              {!loadingModels && availableModels.length === 0 && (
                <option value="">(type model name below)</option>
              )}
              {!loadingModels && availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {loadingModels && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 className="w-3 h-3 animate-spin text-ink-400" />
              </span>
            )}
          </div>
        )}
        <input
          className="input font-mono mt-1"
          value={data.model}
          onChange={(e) => update("model", e.target.value)}
          placeholder={loadingModels ? "Loading…" : "Type a model name"}
        />
      </div>

      {/* Temperature + Max Tokens */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="label">Temperature</label>
          <input
            className="input"
            type="number" min={0} max={2} step={0.1}
            value={data.temperature}
            onChange={(e) => update("temperature", parseFloat(e.target.value) || 0.7)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Max Tokens</label>
          <input
            className="input"
            type="number" min={1} step={1}
            value={data.maxTokens}
            onChange={(e) => update("maxTokens", parseInt(e.target.value) || 2048)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {showCancel && onCancel && (
          <button type="button" onClick={onCancel} className="btn">Cancel</button>
        )}
        <button
          type="button"
          onClick={async () => {
            await onSubmitRef.current?.(data);
            await onSaved?.();
          }}
          disabled={loading || !data.model}
          className="btn btn-primary"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 stroke-[1.75]" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}