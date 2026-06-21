// AuraSearch AI — Agent API
// Phase 3.3: Full human-in-the-loop confirmation flow

type RiskLevel = "low" | "medium" | "high";

type PendingAction = {
  token: string;
  tool: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  description: string;
  timestamp: number;
};

const pendingStore = new Map<string, PendingAction>();

function generateToken(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ─── LLM ───────────────────────────────────────────────────────────────────
const LLM_URL = "https://opencode.ai/zen/v1/chat/completions";

async function callLLM(messages: { role: string; content: string }[], options?: { jsonMode?: boolean; maxTokens?: number }): Promise<string> {
  const OPENCODE_KEY = process.env.OPENCODE_API_KEY || "";
  const body: Record<string, unknown> = {
    model: "minimax-m3-free",
    messages,
    max_tokens: options?.maxTokens ?? 1500,
    temperature: 0.3,
  };
  if (options?.jsonMode) body.response_format = { type: "json_object" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (OPENCODE_KEY) headers["Authorization"] = `Bearer ${OPENCODE_KEY}`;
  const res = await fetch(LLM_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = blockMatch ? blockMatch[1].trim() : text.trim();
    return JSON.parse(jsonStr);
  } catch { return null; }
}

// ─── Tools ─────────────────────────────────────────────────────────────────
const TOOLS: Record<string, {
  name: string; description: string; riskLevel: RiskLevel;
  execute: (args: any) => Promise<any>;
}> = {
  web_search: {
    name: "web_search", description: "Search the web via DuckDuckGo. Returns title, url, snippet.", riskLevel: "low",
    execute: async (args: { query: string }) => {
      const q = encodeURIComponent(args.query);
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AuraSearch/1.0)" },
      });
      const html = await res.text();
      const results: { title: string; url: string; snippet: string }[] = [];
      const titleRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
      const snippetRegex = /class="result__snippet"[^>]*>(.*?)<\/p>/gi;
      let m: RegExpExecArray | null;
      while ((m = titleRegex.exec(html)) !== null && results.length < 8) {
        let url = m[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "");
        url = decodeURIComponent(url);
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        results.push({ title, url, snippet: "" });
      }
      let si = 0;
      while ((m = snippetRegex.exec(html)) !== null && si < results.length) {
        results[si].snippet = m[1].replace(/<[^>]+>/g, "").trim();
        si++;
      }
      return results.filter((r) => !r.url.includes("duckduckgo.com") && !r.url.includes("y.js"));
    },
  },
  calculator: {
    name: "calculator", description: "Evaluate a math expression. Input: expression string.", riskLevel: "low",
    execute: async (args: { expression: string }) => {
      try { const fn = new Function(`"use strict"; return (${args.expression})`); return { result: String(fn()) }; }
      catch { return { error: "Invalid expression" }; }
    },
  },
  fetch_webpage: {
    name: "fetch_webpage", description: "Fetch readable text from a public URL.", riskLevel: "low",
    execute: async (args: { url: string }) => {
      const res = await fetch(args.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AuraSearch/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "").replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
      return { url: args.url, content: text, length: text.length };
    },
  },
  send_message_draft: {
    name: "send_message_draft", description: "Draft a message for review. Requires user confirmation to send.", riskLevel: "medium",
    execute: async (args: { recipient: string; subject: string; body: string }) => ({
      status: "draft_ready",
      message: `Draft prepared for ${args.recipient}: "${args.subject}"`,
      draft: { to: args.recipient, subject: args.subject, body: args.body },
      note: "Requires user approval before sending.",
    }),
  },
};

// ─── Execute a confirmed action ────────────────────────────────────────────
async function executeConfirmedAction(pending: PendingAction): Promise<Record<string, unknown>> {
  const toolDef = TOOLS[pending.tool];
  if (!toolDef) return { type: "answer", message: `Unknown tool: ${pending.tool}`, status: "error" };
  try {
    const result = await toolDef.execute(pending.args);
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    const synthesisMessages = [
      { role: "system", content: `You are Aura. Synthesise the tool result into an answer. Cite sources [1], [2] etc. Keep concise. Today is ${new Date().toISOString().split("T")[0]}.` },
      { role: "user", content: `The user approved the action "${pending.description}".\nTool "${pending.tool}" returned: ${resultStr}\n\nSummarise what happened.` },
    ];
    const answer = await callLLM(synthesisMessages, { maxTokens: 600 });
    let sources: { title: string; url: string }[] = [];
    if (pending.tool === "web_search" && Array.isArray(result)) {
      sources = result.map((r: any) => ({ title: r.title, url: r.url }));
    }
    return { type: "answer", message: answer, sources, toolTrace: `Action executed after user approval`, status: "speaking" };
  } catch (err) {
    return { type: "answer", message: `Action failed: ${err instanceof Error ? err.message : "Unknown"}`, status: "error" };
  }
}

// ─── Intent / orchestration ────────────────────────────────────────────────
function detectIntent(input: string): { needsSearch: boolean; riskLevel: RiskLevel } {
  const lower = input.toLowerCase();
  const needsSearch = /https?:\/\/[^\s]+/.test(input) || [
    "search", "what", "who", "how", "why", "when", "where", "latest", "compare",
    "best", "top", "news", "find", "tell me about", "explain", "capital",
    "population", "weather", "current",
  ].some((k) => lower.includes(k)) || input.includes("?") || input.split(" ").length > 3;
  const risky = ["send", "email", "post", "tweet", "message", "book", "buy",
    "purchase", "order", "delete", "change password", "pay", "transfer",
    "subscribe", "unsubscribe", "register", "sign up"];
  const riskLevel: RiskLevel = risky.some((k) => lower.includes(k)) ? "high" : "low";
  return { needsSearch, riskLevel };
}

async function handleRequest(input: string, conversation: { role: string; content: string }[]): Promise<Record<string, unknown>> {
  try {
    const intent = detectIntent(input);
    const sysMsg = `You are Aura, an AI web agent. Answer helpfully (2-4 sentences).
Today is ${new Date().toISOString().split("T")[0]}.
To use a tool, respond with JSON: {"tool":"tool_name","args":{...},"description":"what you're doing"}
Available tools: web_search (search web), calculator (math), fetch_webpage (read URL), send_message_draft (draft message).`;

    const planMessages = [{ role: "system", content: sysMsg }, { role: "user", content: input }];
    if (conversation.length > 0) {
      const recent = conversation.slice(-4);
      planMessages.splice(1, 0, { role: "system", content: `Recent: ${recent.map(m => `${m.role}: ${m.content}`).join(" | ")}` });
    }

    let planResponse: string;
    try { planResponse = await callLLM(planMessages, { maxTokens: 600 }); }
    catch (err) {
      if (intent.needsSearch) {
        const results = await TOOLS.web_search.execute({ query: input });
        if (Array.isArray(results) && results.length > 0) {
          const top = results.slice(0, 3);
          return { type: "answer", message: "I couldn't reach my AI model. Here's what I found from the web:\n" + top.map((r, i) => `\u2022 ${r.title} \u2014 ${r.snippet} [${i + 1}]`).join("\n"), sources: top.map(r => ({ title: r.title, url: r.url })), status: "speaking", llmError: true };
        }
      }
      return { type: "answer", message: `LLM unavailable: ${err instanceof Error ? err.message : "Unknown"}`, status: "error", llmError: true };
    }

    const json = safeJsonParse(planResponse);
    if (json && json.tool && typeof json.tool === "string" && TOOLS[json.tool]) {
      const toolName = json.tool;
      const toolArgs = (json.args || {}) as Record<string, unknown>;
      const toolDef = TOOLS[toolName];
      const description = (json.description as string) || toolDef.description;

      // Phase 3.3: MEDIUM / HIGH RISK => require confirmation
      if (toolDef.riskLevel === "medium" || toolDef.riskLevel === "high") {
        const token = generateToken();
        pendingStore.set(token, { token, tool: toolName, args: toolArgs, riskLevel: toolDef.riskLevel, description, timestamp: Date.now() });
        return { type: "confirmation_required", pendingToken: token, riskLevel: toolDef.riskLevel, tool: toolName, description, args: toolArgs, message: `I'd like to ${description}`, status: "waiting_for_confirmation" };
      }

      // LOW RISK => execute directly
      try {
        const result = await toolDef.execute(toolArgs);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);
        const synthesis = await callLLM([
          { role: "system", content: `You are Aura. Synthesise tool result into concise answer with citations. Today is ${new Date().toISOString().split("T")[0]}.` },
          { role: "user", content: `Q: ${input}\nTool (${toolName}): ${resultStr}\n\nAnswer with citations.` },
        ], { maxTokens: 800 });
        let sources: { title: string; url: string }[] = [];
        if (toolName === "web_search" && Array.isArray(result)) sources = result.map((r: any) => ({ title: r.title, url: r.url }));
        else if (result && typeof result === "object" && "url" in result) sources = [{ title: (result as any).url, url: (result as any).url }];
        return { type: "answer", message: synthesis, sources, toolTrace: `${toolName} done`, status: "speaking" };
      } catch (err) {
        return { type: "answer", message: `Tool ${toolName} failed: ${err instanceof Error ? err.message : "Unknown"}`, status: "error" };
      }
    }

    return { type: "answer", message: planResponse, sources: [], status: "speaking" };
  } catch (err) {
    return { type: "answer", message: `Error: ${err instanceof Error ? err.message : "Unknown"}`, status: "error" };
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────
export default async (c: { req: Request; env: Record<string, string | undefined> }) => {
  const method = c.req.method;
  try {
    if (method === "POST") {
      const body = await c.req.json() as Record<string, unknown>;

      // Confirm action
      if (body.action === "confirm" && typeof body.pendingToken === "string") {
        const pending = pendingStore.get(body.pendingToken);
        if (!pending) {
          return new Response(JSON.stringify({ error: "Token expired or invalid. Please ask again." }), { status: 404, headers: { "Content-Type": "application/json" } });
        }
        pendingStore.delete(body.pendingToken);
        const result = await executeConfirmedAction(pending);
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Deny action
      if (body.action === "deny" && typeof body.pendingToken === "string") {
        pendingStore.delete(body.pendingToken);
        return new Response(JSON.stringify({ type: "answer", message: "Action cancelled. Is there anything else I can help with?", status: "speaking" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Normal message
      if (!body.message) {
        return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const result = await handleRequest(body.message as string, (body.conversation || []) as { role: string; content: string }[]);
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "GET") {
      return new Response(JSON.stringify({ ok: true, provider: "opencode.ai", model: "minimax-m3-free", pendingTokens: pendingStore.size, availableTools: Object.keys(TOOLS), timestamp: new Date().toISOString() }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
