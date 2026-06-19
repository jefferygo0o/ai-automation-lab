/**
 * Agent Runtime - iterative reasoning loop.
 *
 * For each user message:
 *   1. Load active agent (system, persona, skills, tools, MCP servers).
 *   2. Build chat context (history + dynamic tool spec).
 *   3. Send context to LLM provider (stream tokens).
 *   4. If tool calls are returned, execute each in the agent's sandbox,
 *      append results, and loop back to step 3.
 *   5. Persist final assistant message.
 *
 * Streaming tokens and tool events are emitted via the emit() callback.
 * A Run is opened at the start and closed on completion; tool invocations
 * are persisted as the agent executes them.
 */

import { toolRegistry, type Tool, type ToolContext, type ToolParameters, zodLikeToJsonSchema } from "../tools/registry.ts";
import { AgentStore } from "./registry.ts";
import { readAgentFile, writeAgentFile, readAgentConfig, AGENT_FILE_NAMES } from "./files.ts";
import { resolveSandboxOptions } from "./permissions.ts";
import { callLLM, type ChatMessage, type LLMResponse, type LLMConfig, type ToolSpec } from "../llm/provider.ts";
import { SecretStore } from "../secrets/store.ts";
import { ChatStore } from "../chats/index.ts";
import { createSandbox } from "../sandbox/index.ts";
import { mcpManager, McpStore } from "../mcp/client.ts";
import { Skills, type Skill } from "../skills/index.ts";
import { MemoryStore } from "../memory/index.ts";
import { recordHistory } from "./history.ts";
import { RunStore } from "../runs/index.ts";

export type StreamEvent =
  | { type: "token"; delta: string }
  | { type: "tool_call"; name: string; args: any }
  | { type: "tool_result"; name: string; result: any; ok: boolean }
  | { type: "message"; content: string }
  | { type: "run_started"; runId: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface RunOptions {
  signal?: AbortSignal;
  onLog?: (entry: { tool: string; args: unknown; result: string; ok: boolean; durationMs: number; at: number }) => void;
}

export async function runAgentTurn(
  ownerId: string,
  chatId: string,
  userMessage: string,
  emit: (e: StreamEvent) => void,
  opts: RunOptions = {}
): Promise<void> {
  const start = Date.now();
  const chat = ChatStore.get(chatId, ownerId);
  if (!chat) {
    emit({ type: "error", message: "chat not found" });
    emit({ type: "done" });
    return;
  }
  const activeAgentId = chat.activeAgentId ?? chat.agentId;
  const agent = AgentStore.get(activeAgentId, ownerId);
  if (!agent) {
    emit({ type: "error", message: "agent not found" });
    emit({ type: "done" });
    return;
  }

  // Persist user message
  ChatStore.addMessage(chatId, { role: "user", content: userMessage });

  // Open a Run so the UI can show live execution logs.
  const run = RunStore.start(chatId, ownerId, activeAgentId);
  emit({ type: "run_started", runId: run.id });

  // Build tool spec from registry
  const builtinToolSpecs: ToolSpec[] = toolRegistry.all().map((t) => toolToSpec(t));

  // Add MCP tools (if any servers configured for this agent)
  const agentMcpServers = McpStore.list().filter((s) => s.enabled);
  if (agentMcpServers.length) {
    for (const cfg of agentMcpServers) {
      try { await mcpManager.startServer({ name: cfg.name, command: cfg.command, args: cfg.args, env: cfg.env }); }
      catch (e) { console.warn("[runtime] failed to start mcp server", cfg.name, e); }
    }
  }

  // Load agent config + sandbox
  const cfg = readAgentConfig(agent.id);
  const sandboxOpts = resolveSandboxOptions(agent);
  const sandbox = createSandbox(sandboxOpts);

  const ac = new AbortController();
  const timeoutMs = 30_000;
  const timeout = setTimeout(() => ac.abort(new Error("LLM request timed out")), timeoutMs);
  const abort = opts.signal ? AbortSignal.any?.([opts.signal, ac.signal]) ?? opts.signal : ac.signal;
  const onLog: ToolContext["onLog"] = (entry) => {
    opts.onLog?.(entry);
  };

  const toolCtx: ToolContext = {
    agentId: agent.id,
    ownerId,
    chatId,
    runId: run.id,
    sandbox,
    secrets: {
      get: (name) => SecretStore.get(ownerId, name),
    },
    mcp: {
      call: (server, tool, args) => mcpManager.callTool(server, tool, args),
      listServers: () => mcpManager.listServers(),
    },
    abort,
    onLog,
  };

  // Build system prompt from agent files
  const systemMd = readAgentFile(agent.id, "system.md") ?? "";
  const personaMd = readAgentFile(agent.id, "persona.md") ?? "";
  const skillsMd = readAgentFile(agent.id, "skills.md") ?? "";
  const toolsMd = readAgentFile(agent.id, "tools.md") ?? "";
  const memoryMd = readAgentFile(agent.id, "memory.md") ?? "";

  let skillsBlock = skillsMd;
  // Inject bodies of any skills referenced in skills.md
  const skillRefs = Array.from(skillsMd.matchAll(/`([a-z0-9-]+)`/gi))
    .map((m) => m[1])
    .filter((id): id is string => typeof id === "string");
  for (const id of new Set(skillRefs)) {
    const body = Skills.read(id);
    if (body) skillsBlock += `\n\n---\n## Skill: ${id}\n\n${body.body}\n`;
  }
  const installed = Skills.list();
  const skillsIndex = installed
    .map((s) => `- \`${s.id}\`: ${s.name} - ${s.description}`)
    .join("\n");
  if (skillsIndex) skillsBlock += `\n\n## Available skills (use run_skill \`<id>\`)\n${skillsIndex}\n`;

  const longTerm = MemoryStore.list(agent.id, ownerId, undefined, 20)
    .map((m) => `- [${m.kind}] ${m.key}: ${m.value}`)
    .join("\n");
  const longTermBlock = longTerm ? `\n\n## Long-term memory\n${longTerm}\n` : "";

  const toolListForPrompt = builtinToolSpecs.map((t) => `- \`${t.name}\``).join("\n") || "(none)";

  const systemPrompt = [
    systemMd.trim(),
    personaMd.trim() ? `\n\n# Persona\n${personaMd.trim()}\n` : "",
    skillsBlock.trim() ? `\n\n# Skills\n${skillsBlock.trim()}\n` : "",
    toolsMd.trim() ? `\n\n# Tool notes\n${toolsMd.trim()}\n` : "",
    memoryMd.trim() ? `\n\n# Notes (memory.md)\n${memoryMd.trim()}\n` : "",
    longTermBlock,
    `\n\n# Tools available\n${toolListForPrompt}\n`,
    `\n\n# Working directory\nYou have a sandboxed working directory at ${sandboxOpts.workdir}. Use relative paths. All execute_command calls are isolated.\n`,
  ].join("");

  // LLM config: use the agent's provider + secret-resolved API key
  const apiKey = cfg.provider === "mock"
    ? "mock-key"
    : (cfg.apiKeySecret
        ? (SecretStore.get(ownerId, cfg.apiKeySecret) ?? process.env[cfg.apiKeySecret] ?? "")
        : (process.env[`${cfg.provider.toUpperCase()}_API_KEY`] ?? ""));
  
  // Fail fast if no API key — don't make a doomed HTTP call
  if (cfg.provider !== "mock" && !apiKey) {
    console.log("[runtime] no API key resolved for", cfg.apiKeySecret || cfg.provider.toUpperCase() + "_API_KEY");
    throw new Error(
      `API key not configured. Go to Settings → Secrets, ` +
      `add a secret named \`${cfg.apiKeySecret || cfg.provider.toUpperCase() + "_API_KEY"}\` ` +
      `with your API key, then try again.`
    );
  }
  
  console.log("[runtime] LLM config baseUrl=%s model=%s hasKey=%s", cfg.baseUrl, cfg.model, apiKey ? "yes (" + apiKey.slice(0, 8) + "..." + apiKey.slice(-4) + ")" : "no");
  
  const llmCfg: LLMConfig = {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  };

  // History (includes the user message we just persisted)
  const history = ChatStore.listMessages(chatId, ownerId);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
      toolCalls: m.toolCalls as any,
      toolCallId: m.toolCallId ?? undefined,
      name: m.name ?? undefined,
    })),
  ];

  let totalPrompt = 0; // forces number type
  let totalCompletion = 0;

  const MAX_STEPS = 12;
  let runStatus: "completed" | "failed" | "cancelled" = "completed";
  let runError: string | undefined;

  // Keep-alive interval to prevent proxy/browser timeout during long operations
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  function startKeepalive() {
    stopKeepalive();
    keepaliveInterval = setInterval(() => {
      emit({ type: "keepalive" as any, delta: "" });
    }, 10_000);
  }
  function stopKeepalive() {
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
  }

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      console.log("[runtime] step=", step);
      if (abort.aborted) { runStatus = "cancelled"; break; }
      let resp: LLMResponse;
      try {
        console.log("[runtime] calling LLM...");
        startKeepalive();
        try {
          resp = await callLLM(llmCfg, {
            messages,
            tools: builtinToolSpecs,
            temperature: llmCfg.temperature,
            maxTokens: llmCfg.maxTokens,
            stream: true,
            signal: abort,
          });
        } finally {
          stopKeepalive();
        }
        if (resp.usage) {
          totalPrompt += resp.usage.promptTokens ?? 0;
          totalCompletion += resp.usage.completionTokens ?? 0;
        }
      } catch (e: any) {
        console.log("[runtime] LLM ERROR in catch:", e?.message ?? String(e));
        runStatus = "failed";
        runError = `LLM call failed: ${e?.message ?? String(e)}`;
        emit({ type: "error", message: runError ?? "unknown error" });
        break;
      }

      // Handle LLM provider errors cleanly (e.g. missing API key)
      if (resp.finishReason === "error" && !resp.content && (!resp.toolCalls || resp.toolCalls.length === 0)) {
        const raw = typeof resp.raw === "string" ? resp.raw : JSON.stringify(resp.raw ?? "");
        console.log("[runtime] LLM provider error raw:", raw.slice(0, 500));
        
        // Diagnose message structure - verify tool call/tool response pairs
        const toolCallMsgs = messages.filter(m => m.role === "assistant" && m.toolCalls?.length);
        const toolResponseMsgs = messages.filter(m => m.role === "tool");
        const tcCount = toolCallMsgs.reduce((s, m) => s + (m.toolCalls?.length ?? 0), 0);
        console.log(`[runtime] MSG DIAG: ${messages.length} msgs, ${tcCount} tool calls, ${toolResponseMsgs.length} tool responses`);
        toolCallMsgs.forEach((m, i) => {
          const ids = m.toolCalls?.map((tc: any) => tc.id) ?? [];
          const tool_resps = messages.filter(msg => msg.role === "tool" && ids.includes(msg.toolCallId ?? ""));
          console.log(`  assistant_tc[${i}]: ${ids.length} calls (${ids.join(",")}), matched ${tool_resps.length} tool responses`);
        });
        
        const isAuthError = raw.includes("401") || raw.includes("403") || raw.includes("auth") || raw.includes("unauthorized") || raw.includes("API key") || raw.includes("api_key");
        const msg = isAuthError
          ? `API key not configured. Go to Settings → Secrets, add a secret named \`${cfg.apiKeySecret || cfg.provider.toUpperCase() + "_API_KEY"}\` with your API key, then try again.`
          : `LLM call failed: ${raw.slice(0, 200) || "check provider config"}`;
        emit({ type: "error", message: msg });
        runStatus = "failed";
        runError = msg;
        break;
      }

      if (resp.content) {
        emit({ type: "token", delta: resp.content });
      }

      if (!resp.toolCalls || resp.toolCalls.length === 0) {
        ChatStore.addMessage(chatId, { role: "assistant", content: resp.content, runId: run.id });
        emit({ type: "message", content: resp.content });
        break;
      }

      // Append assistant message with tool calls
      ChatStore.addMessage(chatId, {
        role: "assistant",
        content: resp.content,
        toolCalls: resp.toolCalls as any,
        runId: run.id,
      });
      messages.push({ role: "assistant", content: resp.content, toolCalls: resp.toolCalls });
      for (const tc of resp.toolCalls) emit({ type: "tool_call", name: tc.name, args: tc.arguments });

      for (const tc of resp.toolCalls) {
        // Skip tool calls with empty names — these are malformed streaming artifacts
        if (!tc.name || typeof tc.name !== "string" || tc.name.trim() === "") {
          console.log("[runtime] skipping tool call with empty name");
          continue;
        }
        let fnArgs: any = {};
        try {
          fnArgs = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : (tc.arguments ?? {});
        } catch (e) {
          fnArgs = { _parse_error: String(e), raw: tc.arguments };
        }
        const tool = toolRegistry.get(tc.name);
        if (!tool) {
          const result = { error: `unknown tool: ${tc.name}` };
          emit({ type: "tool_result", name: tc.name, result, ok: false });
          pushToolMessage(messages, chatId, tc, JSON.stringify(result), run.id);
          continue;
        }
        const perm = tool.defaultPermission;
        let result: any;
        let ok = true;
        const toolStart = Date.now();
        const inv = RunStore.recordToolStart(run.id, tc.name, fnArgs, sandbox.id);
        if (perm === "never") {
          result = { error: `permission denied for tool ${tc.name}` };
          ok = false;
          RunStore.recordToolFinish(inv.id, "denied", result, "denied by permission policy");
        } else {
          try {
            result = await tool.execute(fnArgs, toolCtx);
          } catch (e: any) {
            result = { error: e?.message ?? String(e) };
            ok = false;
          }
          RunStore.recordToolFinish(inv.id, ok ? "ok" : "error", result, ok ? null : String(result?.error ?? ""));
        }
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);
        emit({ type: "tool_result", name: tc.name, result, ok });
        pushToolMessage(messages, chatId, tc, resultStr, run.id);
        onLog({ tool: tc.name, args: fnArgs, result: resultStr, ok, durationMs: Date.now() - toolStart, at: toolStart });
        recordHistory(agent.id, tc.name, resultStr);
      }
    }
  } catch (e: any) {
    console.log("[runtime] OUTER ERROR:", e);
    runStatus = "failed";
    runError = e?.message ?? String(e);
    emit({ type: "error", message: runError ?? "unknown error" });
  } finally {
    stopKeepalive();
    clearTimeout(timeout);
    // Sandbox persists intentionally — agent files created during conversation
    // (e.g. instructions.txt, scripts, data) must survive for the user to
    // browse and reuse. The sandbox is cleaned up when the agent is deleted.
    // try { sandbox.cleanup(); } catch {}
    // Wrap DB ops in try-catch so a failure here cannot skip `emit("done")`
    try {
      RunStore.complete(run.id, {
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion,
      });
    } catch (dbErr) {
      console.error("[runtime] RunStore.complete failed:", dbErr);
    }
    if (runStatus === "failed" || runStatus === "cancelled") {
      try {
        RunStore.fail(run.id, runError ?? runStatus);
      } catch (dbErr) {
        console.error("[runtime] RunStore.fail failed:", dbErr);
      }
    }
  }

  emit({ type: "done" });
}

function pushToolMessage(
  messages: ChatMessage[],
  chatId: string,
  tc: { id: string; name: string },
  content: string,
  runId: string
) {
  messages.push({ role: "tool", content, toolCallId: tc.id, name: tc.name });
  ChatStore.addMessage(chatId, { role: "tool", content, toolCallId: tc.id, name: tc.name, runId });
}

function toolToSpec(t: Tool): ToolSpec {
  // Use the registry's zodLikeToJsonSchema to produce a proper JSON Schema
  // with type: "object" at the root. OpenCode/DeepSeek rejects bare
  // parameter-object schemas.
  return { name: t.name, description: t.description, inputSchema: zodLikeToJsonSchema(t.parameters) as any };
}
