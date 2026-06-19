/**
 * Mock LLM provider.
 *
 * Returns deterministic, tool-using responses so the entire stack is
 * testable without an API key. Useful for:
 *   - local development without spending tokens
 *   - CI / smoke tests
 *   - demos of the agent loop
 *
 * Heuristics (applied to the most recent user message):
 *   - "list files" / "what's in"     -> calls list_files
 *   - "read <name>.md"               -> calls read_file
 *   - "run <command>"                -> calls execute_command
 *   - "fetch <url>" / "GET <url>"    -> calls http_request
 *   - "remember ..." / "note ..."    -> calls update_memory
 *   - "use skill <id>"               -> calls run_skill with the id
 *   - "what skills"                  -> calls list_skills
 *   - "plan: ..."                    -> calls propose_plan
 *   - else                           -> plain text reply
 *
 * Loop guard: if the most recent message is a tool result, the mock
 * returns a text reply summarising the latest tool output rather than
 * triggering another tool call. This prevents runaway loops on the
 * mock-only path.
 */

import { callLLM, type LLMConfig, type LLMRequest, type LLMResponse, type ChatMessage } from "./provider.ts";

let counter = 0;
function callId() {
  counter = (counter + 1) % 1_000_000;
  return `call_mock_${counter}`;
}

function lastUser(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.content) return m.content;
  }
  return "";
}

function lastToolResult(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "tool" && m.content) return m.content;
  }
  return null;
}

function decideTool(prompt: string, availableToolNames: string[]): { name: string; args: Record<string, any> } | null {
  const p = prompt.toLowerCase();
  const has = (name: string) => availableToolNames.includes(name);

  if (has("run_skill") && /(?:use|run|execute)\s+skill\s+[`"]?([a-z0-9-]+)/i.test(prompt)) {
    const m = prompt.match(/(?:use|run|execute)\s+skill\s+[`"]?([a-z0-9-]+)/i);
    return { name: "run_skill", args: { skillId: m?.[1] ?? "demo" } };
  }
  if (has("list_skills") && /\b(what|list|show)\s+skills\b/i.test(prompt)) {
    return { name: "list_skills", args: {} };
  }
  if (has("propose_plan") && /\bplan[:\s]/i.test(prompt)) {
    return { name: "propose_plan", args: { plan: prompt.replace(/^.*?plan[:\s]*/i, "").trim() } };
  }
  if (has("list_files") && /\b(list|show)\b.*\b(files|directory|dir)\b/i.test(prompt)) {
    return { name: "list_files", args: { path: "." } };
  }
  if (has("read_file") && /\bread\s+([\w./-]+\.md)\b/i.test(prompt)) {
    const m = prompt.match(/\bread\s+([\w./-]+\.md)\b/i);
    return { name: "read_file", args: { path: m?.[1] ?? "system.md" } };
  }
  if (has("execute_command") && /\b(run|exec(?:ute)?)\s+[`"]?([^\s`"]+)/i.test(prompt)) {
    const m = prompt.match(/\b(?:run|exec(?:ute)?)\s+[`"]?([^\s`"]+)(.*)$/i);
    const cmd = m?.[1] ?? "ls";
    const rest = (m?.[2] ?? "").trim();
    const args = rest ? rest.split(/\s+/) : [];
    return { name: "execute_command", args: { command: cmd, args } };
  }
  if (has("http_request") && /\b(GET|POST|PUT|PATCH|DELETE|fetch)\s+https?:\/\//i.test(prompt)) {
    const m = prompt.match(/\b(GET|POST|PUT|PATCH|DELETE|fetch)\s+(https?:\/\/\S+)/i);
    return { name: "http_request", args: { method: (m?.[1] ?? "GET").toUpperCase() === "FETCH" ? "GET" : (m?.[1] ?? "GET").toUpperCase(), url: m?.[2] ?? "" } };
  }
  if (has("update_memory") && /^(remember|note[:\s])/i.test(prompt.trim())) {
    const content = prompt.replace(/^(remember|note[:\s]+)/i, "").trim();
    return { name: "update_memory", args: { kind: "fact", key: "note", value: content } };
  }
  return null;
}

export async function callMockLLM(cfg: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  const lastMsg = req.messages[req.messages.length - 1];

  if (lastMsg && lastMsg.role === "tool") {
    const text = lastToolResult(req.messages) ?? "(no content)";
    // Yield to event loop so SSE can flush tokens incrementally.
    await new Promise((r) => setImmediate(r));
    return {
      content: `I have the tool result. Summary:\n\n\`\`\`\n${text.slice(0, 2000)}\n\`\`\``,
      toolCalls: [],
      finishReason: "stop",
    };
  }

  const userMsg = lastUser(req.messages);
  const available = (req.tools ?? []).map((t) => t.name);
  const tool = decideTool(userMsg, available);

  if (tool) {
    return {
      content: "",
      toolCalls: [{ id: callId(), name: tool.name, arguments: JSON.stringify(tool.args) }],
      finishReason: "tool_calls",
    };
  }

  // Plain text reply
  const reply = [
    "I'm the mock LLM. Here's what I see:",
    "",
    `> ${userMsg || "(empty)"}`,
    "",
    "Available tools:",
    ...(req.tools ?? []).map((t) => `  - ${t.name}`),
    "",
    "Try prompts like:",
    "  - list files",
    "  - read system.md",
    "  - run ls -la",
    "  - GET https://example.com",
    "  - remember the user prefers dark mode",
    "  - use skill web-research",
    "  - plan: scrape the top 10 results",
  ].join("\n");

  return { content: reply, toolCalls: [], finishReason: "stop" };
}

/** Dispatch helper: routes to mock or real provider. */
export async function callAnyLLM(cfg: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  if (cfg.provider === "mock") return callMockLLM(cfg, req);
  return callLLM(cfg, req);
}
