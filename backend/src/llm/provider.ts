/**
 * LLM Provider Abstraction.
 *
 * All providers speak OpenAI-compatible /chat/completions format with optional
 * tool calling. We treat the wire format as the contract; the "provider" is
 * really just (baseUrl, apiKey, model) configuration.
 *
 * Anthropic is supported via a thin adapter that converts Anthropic-style
 * messages into the OpenAI-compatible envelope on the way in, and back on the
 * way out.
 */

export interface LLMConfig {
  provider: string;            // "openai" | "groq" | "anthropic" | "ollama" | "custom"
  baseUrl: string;             // e.g. https://api.openai.com/v1
  apiKey: string;              // plaintext, decrypted from vault at runtime
  model: string;               // e.g. gpt-4o-mini, llama-3.1-70b, claude-3-5-sonnet
  temperature?: number;        // 0..2, default 0.7
  maxTokens?: number;          // default 2048
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, any>;  // JSON Schema
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  name?: string;
}

export interface LLMRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | { name: string };
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  /**
   * Per-chunk callback invoked as the upstream SSE stream is consumed.
   * Used by the runtime to forward content deltas to the client as
   * `event: token` events instead of waiting for the full response.
   */
  onChunk?: (chunk: StreamChunk) => void;
}

export interface LLMResponse {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  raw?: unknown;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /**
   * Accumulated model reasoning ("thinking" / "chain-of-thought") when the
   * provider surfaces it as a structured field (e.g. OpenAI/DeepSeek
   * `reasoning_content`). Providers that only emit reasoning inline via
   * `<thinking>` tags leave this undefined.
   */
  reasoning?: string;
}

export interface StreamChunk {
  type: "content" | "thinking" | "tool_call" | "done" | "error";
  content?: string;
  /**
   * For `type: "thinking"` chunks this holds the reasoning delta; for
   * `type: "content"` it holds the visible-message delta.
   */
  toolCall?: { id: string; name: string; arguments: string };
  finishReason?: LLMResponse["finishReason"];
  usage?: LLMResponse["usage"];
  error?: string;
}

export interface StreamHandle {
  on(event: "chunk", cb: (c: StreamChunk) => void): StreamHandle;
  on(event: "end", cb: () => void): StreamHandle;
  close(): void;
}

// ─── SSE processing helper ───
interface SseProcessCtx {
  content: string;
  reasoning: string;
  toolCallAcc: Map<number, { id: string; name: string; args: string }>;
  finishReason: LLMResponse["finishReason"];
  usage: LLMResponse["usage"] | undefined;
  onChunk: (c: StreamChunk) => void;
}

/**
 * Strip accumulated-prefix from streaming deltas.
 * The API may send the FULL accumulated text in each chunk.
 * If delta starts with prev, return only the new suffix.
 */
function dedupeDelta(prev: string, delta: string): string {
  if (!prev) return delta;
  if (delta.startsWith(prev)) return delta.slice(prev.length);
  // Partial overlap — trim common prefix
  let overlap = 0;
  const maxLen = Math.min(prev.length, delta.length);
  while (overlap < maxLen && prev[overlap] === delta[overlap]) overlap++;
  return delta.slice(overlap);
}

function processSseLine(rawLine: string, ctx: SseProcessCtx): void {
  const line = rawLine.trim();
  if (!line || !line.startsWith("data:")) return;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return;
  try {
    const json = JSON.parse(payload);
    const delta = parseDelta(json);
    if (delta.reasoning) {
      // The opencode.ai API sends the FULL accumulated reasoning
      // in each chunk. Strip any overlap with previously accumulated content.
      const deduped = dedupeDelta(ctx.reasoning, delta.reasoning);
      if (deduped) {
        ctx.reasoning += deduped;
        ctx.onChunk({ type: "thinking", content: deduped });
      }
    }
    if (delta.content !== undefined && delta.content !== null && delta.content !== "") {
      const deduped = dedupeDelta(ctx.content, delta.content);
      if (deduped) {
        ctx.content += deduped;
        ctx.onChunk({ type: "content", content: deduped });
      }
    }
    if (delta.toolCalls) {
      for (const tc of delta.toolCalls) {
        const idx = tc.index ?? 0;
        const existing = ctx.toolCallAcc.get(idx) ?? { id: tc.id ?? "", name: tc.name ?? "", args: "" };
        const nameWas = existing.name;
        if (tc.id) existing.id = tc.id;
        if (tc.name) existing.name = tc.name;
        if (tc.arguments) existing.args += tc.arguments;
        ctx.toolCallAcc.set(idx, existing);
        // Emit tool_call when the name first becomes known. Some providers
        // send the id in one delta and the name in the next — using `isNew`
        // alone misses the window. Track via the name transition instead.
        ctx.onChunk({ type: "tool_call", id: existing.id, name: existing.name, arguments: existing.args });
      }
    }
    if (delta.finishReason) ctx.finishReason = delta.finishReason as LLMResponse["finishReason"];
    if (delta.usage) ctx.usage = delta.usage;
  } catch {
    // ignore malformed chunk
  }
}

/**
 * Public entry: streamChat makes exactly one LLM call and emits chunks
 * to the provided callback. The runtime iterates until the model returns
 * finishReason="stop" with no tool calls.
 */
export async function streamChat(
  cfg: LLMConfig,
  req: LLMRequest,
  onChunk: (c: StreamChunk) => void,
): Promise<LLMResponse> {
  const url = buildChatUrl(cfg);
  const body = buildRequestBody(cfg, req, true);
  const headers = buildHeaders(cfg);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    onChunk({ type: "error", error: `${res.status} ${res.statusText}: ${text.slice(0, 800)}` });
    return { content: "", toolCalls: [], finishReason: "error" };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onChunk({ type: "error", error: "no response body" });
    return { content: "", toolCalls: [], finishReason: "error" };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  // Accumulate tool calls by index across streaming chunks
  // Each OpenAI streaming tool-call delta has an `index` field.
  const toolCallAcc = new Map<number, { id: string; name: string; args: string }>();
  let finishReason: LLMResponse["finishReason"] = "stop";
  let usage: LLMResponse["usage"] | undefined;

  const sseCtx: SseProcessCtx = {
    get content() { return content; },
    set content(v: string) { content = v; },
    get reasoning() { return reasoning; },
    set reasoning(v: string) { reasoning = v; },
    toolCallAcc,
    get finishReason() { return finishReason; },
    set finishReason(v: LLMResponse["finishReason"]) { finishReason = v; },
    get usage() { return usage; },
    set usage(v: LLMResponse["usage"] | undefined) { usage = v; },
    onChunk,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      processSseLine(raw, sseCtx);
    }
  }

  // 🐛 FIX: Process any leftover buffer that wasn't followed by a newline.
  // The while loop slices at "\n" boundaries; the final chunk may contain a
  // complete SSE line without a trailing "\n" — that data was silently lost,
  // which caused the last tokens of the AI response to be dropped mid-sentence.
  if (buffer.trim()) {
    processSseLine(buffer.trim(), sseCtx);
  }

  // Build final tool call list from accumulator
  const toolCalls: { id: string; name: string; arguments: string }[] = [];
  const entries = Array.from(toolCallAcc.entries());
  for (const [idx, tc] of entries) {
    if (!tc.name) continue; // skip entries where the model never settled on a name
    // Sanitize arguments — ensure valid JSON
    let args = tc.args;
    try { JSON.parse(args); } catch { args = "{}"; }
    toolCalls.push({ id: tc.id || `call_${idx}_${Date.now()}`, name: tc.name, arguments: args });
  }

  onChunk({ type: "done", finishReason, usage });
  return { content, reasoning: reasoning || undefined, toolCalls, finishReason, usage };
}

/** Non-streaming call — convenience for non-interactive uses. */
export async function callLLM(cfg: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  // Route to mock provider when configured
  if (cfg.provider === "mock") {
    const { callMockLLM } = await import("./mock.ts");
    return callMockLLM(cfg, req);
  }
  if (req.stream) {
    return streamChat(cfg, req, req.onChunk ?? (() => {}));
  }
  const url = buildChatUrl(cfg);
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify(buildRequestBody(cfg, req, false)),
    signal: req.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { content: "", toolCalls: [], finishReason: "error", raw: t };
  }
  const json = await res.json() as any;
  const choice = json.choices?.[0];
  const toolCalls: LLMResponse["toolCalls"] = (choice?.message?.tool_calls ?? []).map((tc: any) => ({
    id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
    name: tc.function?.name ?? tc.name ?? "",
    arguments: tc.function?.arguments ?? tc.arguments ?? "{}",
  }));
  const reasoning: string | undefined =
    (typeof choice?.message?.reasoning_content === "string" && choice.message.reasoning_content) ||
    (typeof choice?.message?.reasoning === "string" && choice.message.reasoning) ||
    undefined;
  return {
    content: choice?.message?.content ?? "",
    reasoning,
    toolCalls,
    finishReason: (choice?.finish_reason as LLMResponse["finishReason"]) ?? "stop",
    raw: json,
    usage: json.usage,
  };
}

// --- internals ---

function buildChatUrl(cfg: LLMConfig): string {
  const base = cfg.baseUrl.replace(/\/$/, "");
  if (cfg.provider === "anthropic") {
    return `${base}/v1/messages`;
  }
  return `${base}/chat/completions`;
}

function buildHeaders(cfg: LLMConfig): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (cfg.provider === "anthropic") {
    h["x-api-key"] = cfg.apiKey;
    h["anthropic-version"] = "2023-06-01";
  } else {
    h["authorization"] = `Bearer ${cfg.apiKey}`;
  }
  return h;
}

function buildRequestBody(cfg: LLMConfig, req: LLMRequest, stream: boolean): any {
  if (cfg.provider === "anthropic") {
    return buildAnthropicBody(cfg, req, stream);
  }
  const messages: any[] = req.messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content, name: m.name };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => {
          const args = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {});
          return { id: tc.id, type: "function", function: { name: tc.name, arguments: args } };
        }),
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: any = {
    model: cfg.model,
    messages,
    temperature: req.temperature ?? cfg.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? cfg.maxTokens ?? 2048,
    stream,
  };
  if (req.tools && req.tools.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
    body.tool_choice = req.toolChoice ?? "auto";
  }
  return body;
}

function buildAnthropicBody(cfg: LLMConfig, req: LLMRequest, stream: boolean): any {
  const systemMsg = req.messages.find((m) => m.role === "system");
  const restMsgs = req.messages.filter((m) => m.role !== "system");
  const messages = restMsgs.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      return {
        role: "assistant",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.toolCalls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: safeJsonParse(tc.arguments),
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
  const body: any = {
    model: cfg.model,
    system: systemMsg?.content ?? "",
    messages,
    max_tokens: req.maxTokens ?? cfg.maxTokens ?? 2048,
    temperature: req.temperature ?? cfg.temperature ?? 0.7,
    stream,
  };
  if (req.tools && req.tools.length) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }
  return body;
}

function parseDelta(json: any): {
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{ index: number; id: string; name: string; arguments: string }>;
  finishReason?: string;
  usage?: LLMResponse["usage"];
} {
  // OpenAI streaming
  if (json.choices) {
    const c = json.choices[0];
    // DeepSeek/OpenAI/GLM: surface reasoning as `reasoning_content` on the
    // delta, distinct from `content` (the visible answer). Some providers
    // also use the older `reasoning` field — accept both.
    // IMPORTANT: A single delta may contain BOTH reasoning and content
    // (e.g. when the model transitions from thinking to answering in the
    // same chunk). We must collect ALL fields, not return on the first match.
    const r: string | undefined =
      (typeof c?.delta?.reasoning_content === "string" && c.delta.reasoning_content) ||
      (typeof c?.delta?.reasoning === "string" && c.delta.reasoning) ||
      undefined;
    if (c?.delta?.content !== undefined) {
      return { reasoning: r, content: c.delta.content as string };
    }
    if (r) return { reasoning: r };
    if (c?.delta?.tool_calls) {
      const calls: Array<{ index: number; id: string; name: string; arguments: string }> = [];
      for (const tc of c.delta.tool_calls) {
        calls.push({
          index: tc.index ?? 0,
          id: tc.id ?? "",
          name: tc.function?.name ?? "",
          arguments: tc.function?.arguments ?? "",
        });
      }
      return { toolCalls: calls };
    }
    if (c?.finish_reason) return { finishReason: c.finish_reason };
    if (json.usage) return { usage: json.usage };
  }
  // Anthropic streaming (event types in stream)
  if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
    return { content: json.delta.text };
  }
  if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
    return {
      toolCalls: [{
        index: 0,
        id: json.content_block.id,
        name: json.content_block.name,
        arguments: "{}",
      }],
    };
  }
  if (json.type === "content_block_delta" && json.delta?.type === "input_json_delta") {
    return {
      toolCalls: [{ index: 0, id: "", name: "", arguments: json.delta.partial_json ?? "" }],
    };
  }
  if (json.type === "message_delta" && json.delta?.stop_reason) {
    return { finishReason: json.delta.stop_reason };
  }
  if (json.type === "message_start" && json.message?.usage) {
    return { usage: json.message.usage };
  }
  return {};
}

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}
