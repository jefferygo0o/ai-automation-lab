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
import { PersonaStore } from "../personas/store.ts";
import { RuleStore } from "../rules/store.ts";
import { recordHistory } from "./history.ts";
import { RunStore } from "../runs/index.ts";
import { Approvals } from "../approvals/index.ts";
import { AlwaysAllowStore } from "../approvals/always_allow.ts";
import { getToolCategory } from "../approvals/tool_categories.ts";

export type StreamEvent =
  | { type: "token"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_call"; name: string; args: any; toolCallId?: string }
  | { type: "tool_result"; name: string; result: any; ok: boolean; durationMs: number; error?: string; toolCallId?: string }
  | { type: "approval_requested"; approvalId: string; title: string; body: string; status: "pending" | "approved" | "rejected" | "expired" | "auto-approved"; toolName?: string }
  | { type: "message"; content: string; messageId?: string }
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
  emit: (e: StreamEvent) => void | Promise<void>,
  opts: RunOptions = {}
): Promise<void> {
  const start = Date.now();
  const chat = await ChatStore.get(chatId, ownerId);
  if (!chat) {
    emit({ type: "error", message: "chat not found" });
    emit({ type: "done" });
    return;
  }
  const activeAgentId = chat.activeAgentId ?? chat.agentId;
  const agent = await AgentStore.get(activeAgentId, ownerId);
  if (!agent) {
    emit({ type: "error", message: "agent not found" });
    emit({ type: "done" });
    return;
  }

  // Persist user message
  await ChatStore.addMessage(chatId, { role: "user", content: userMessage });

  // Open a Run so the UI can show live execution logs.
  const run = await RunStore.start(chatId, ownerId, activeAgentId);
  emit({ type: "run_started", runId: run.id });

  // Build tool spec from registry
  const builtinToolSpecs: ToolSpec[] = toolRegistry.all().map((t) => toolToSpec(t));

  // Add MCP tools (if any servers configured for this agent)
  const agentMcpServers = (await McpStore.list(ownerId)).filter((s) => s.enabled);
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

  const abort = opts.signal ?? new AbortController().signal;
  // No LLM-side timeout. Long-running models, multi-step tool chains, and
  // streamed responses can take well over 30s; cutting them off mid-stream
  // produces the "timed out" errors users were seeing. The user's manual
  // cancel signal (opts.signal) is still respected, and the keepalive ping
  // prevents idle-proxy disconnects.
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
      get: async (name: string): Promise<string | null> => SecretStore.get(ownerId, name),
    },
    mcp: {
      call: (server, tool, args) => mcpManager.callTool(server, tool, args, ownerId),
      listServers: () => mcpManager.listServers(),
    },
    abort,
    onLog,
    onApproval: (approval) => emit({ type: "approval_requested", ...approval, status: approval.status as "pending" | "approved" | "rejected" | "expired" | "auto-approved" }),
  };

  // Build system prompt from agent files
  const systemMd = readAgentFile(agent.id, "system.md") ?? "";
  const personaMd = readAgentFile(agent.id, "persona.md") ?? "";
  const skillsMd = readAgentFile(agent.id, "skills.md") ?? "";
  const toolsMd = readAgentFile(agent.id, "tools.md") ?? "";
  const memoryMd = readAgentFile(agent.id, "memory.md") ?? "";

  // Load user's active persona (Zo-style: a named identity overlay)
  const activePersona = await PersonaStore.getActive(ownerId);
  const personaOverlay = activePersona?.prompt?.trim()
    ? `\n\n# Active Persona: ${activePersona.name}\n${activePersona.prompt.trim()}\n`
    : "";

  // Load user's active rules (Zo-style: persistent behavioural constraints)
  const activeRules = await RuleStore.listEnabled(ownerId);
  const rulesBlock = activeRules.length > 0
    ? `\n\n# Active Rules (always-applied)\n${activeRules.map(r => `- ${r.instruction}`).join("\n")}\n`
    : "";

  let skillsBlock = skillsMd;
  // Inject bodies of any skills referenced in skills.md. Use owner-aware
  // lookup so user-owned skills (data/skills/users/{ownerId}/) are visible
  // alongside platform/global skills — previously Skills.read() only saw
  // the global + builtin directories and silently dropped user skills.
  const skillRefs = Array.from(skillsMd.matchAll(/`([a-z0-9-]+)`/gi))
    .map((m) => m[1])
    .filter((id): id is string => typeof id === "string");
  for (const id of new Set(skillRefs)) {
    const skill = Skills.readForOwner(id, ownerId);
    if (skill) skillsBlock += `\n\n---\n## Skill: ${skill.id}\n\n${skill.body}\n`;
  }
  const installed = Skills.listForOwner(ownerId);
  const skillsIndex = installed
    .map((s) => `- \`${s.id}\`: ${s.name} - ${s.description}`)
    .join("\n");
  if (skillsIndex) skillsBlock += `\n\n## Available skills (use run_skill \`<id>\`)\n${skillsIndex}\n`;

  const memItems = await MemoryStore.list(agent.id, ownerId, undefined, 20);
  const longTerm = memItems.map((m) => `- [${m.kind}] ${m.key}: ${m.value}`).join("\n");
  const longTermBlock = longTerm ? `\n\n## Long-term memory\n${longTerm}\n` : "";

  const toolListForPrompt = builtinToolSpecs.map((t) => `- \`${t.name}\``).join("\n") || "(none)";

  // The agent's user-authored system prompt is the primary voice; the lines
  // below are injected at runtime to keep multi-step automations running
  // until the user's full request is satisfied (rather than returning after
  // the first action).
  const RUNTIME_SYSTEM_TAIL = `\n\n# Runtime directives (from the lab)\n- You have an iterative tool-use loop. Keep calling tools until the user's request is fully complete. Do not stop after a single step.\n- Only return a final message when the task is done or you have clear, recoverable evidence it cannot be completed. If a tool fails, try alternatives, adjust parameters, or use a different tool — do not give up after the first error.\n- When the user says "do X, then Y, then Z" or "until everything is done", treat each as a mandatory checkpoint and keep going until all are done. A final assistant message means the whole task is finished.\n\n## 🛠️ Tool error recovery protocol\nWhen a tool returns an \`!ERROR!\` result:\n  1. Acknowledge the error briefly\n  2. Analyse what went wrong (e.g. invalid args, network issue, permission denied)\n  3. Try again with adjusted parameters OR use a different tool entirely\n  4. NEVER give up after one failure — retry at least 2-3 times with different approaches\n  5. Only stop after exhausting reasonable alternatives, then clearly explain why`;

  const systemPrompt = [
    systemMd.trim(),
    personaMd.trim() ? `\n\n# Persona\n${personaMd.trim()}\n` : "",
    personaOverlay,
    rulesBlock,
    skillsBlock.trim() ? `\n\n# Skills\n${skillsBlock.trim()}\n` : "",
    toolsMd.trim() ? `\n\n# Tool notes\n${toolsMd.trim()}\n` : "",
    memoryMd.trim() ? `\n\n# Notes (memory.md)\n${memoryMd.trim()}\n` : "",
    longTermBlock,
    `\n\n# Tools available\n${toolListForPrompt}\n`,
    `\n\n# Working directory\nYou have a sandboxed working directory at ${sandboxOpts.workdir!}. Use relative paths. All execute_command calls are isolated.\n`,
    RUNTIME_SYSTEM_TAIL,
  ].join("");

  // LLM config: use the agent's provider + secret-resolved API key
  const apiKey: string = cfg.provider === "mock"
    ? "mock-key"
    : await (cfg.apiKeySecret
        ? (await SecretStore.get(ownerId, cfg.apiKeySecret)) ?? process.env[cfg.apiKeySecret] ?? ""
        : Promise.resolve(process.env[`${cfg.provider.toUpperCase()}_API_KEY`] ?? ""));
  
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
    model: activePersona?.model || cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  };

  // History (includes the user message we just persisted)
  const history = await ChatStore.listMessages(chatId, ownerId);

  // Filter out orphaned tool responses that have no matching assistant
  // tool_call message in the history. These accumulate when a previous
  // run crashed before persisting the assistant message, and they cause
  // LLM provider errors because every tool message needs a preceding
  // assistant tool_call.
  const pendingToolCallIds = new Set<string>();
  const filteredHistory = history.filter((m) => {
    if (m.role === "assistant" && m.toolCalls) {
      for (const tc of (m.toolCalls as Array<{ id: string }>)) {
        if (tc.id) pendingToolCallIds.add(tc.id);
      }
      return true;
    }
    if (m.role === "tool" && m.toolCallId) {
      if (pendingToolCallIds.has(m.toolCallId)) {
        pendingToolCallIds.delete(m.toolCallId);
        return true;
      }
      // Drop orphaned tool response — no matching assistant tool_call
      return false;
    }
    return true;
  });
  if (filteredHistory.length !== history.length) {
    console.log("[runtime] filtered out", history.length - filteredHistory.length, "orphaned tool messages from history");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...filteredHistory.map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
      toolCalls: m.toolCalls as any,
      toolCallId: m.toolCallId ?? undefined,
      name: m.name ?? undefined,
    })),
  ];

  let totalPrompt = 0; // forces number type
  let totalCompletion = 0;

  const MAX_STEPS = 100;
  let runStatus: "completed" | "failed" | "cancelled" = "completed";
  let runError: string | undefined;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      console.log("[runtime] step=", step);
      if (abort.aborted) { runStatus = "cancelled"; break; }
      let resp: LLMResponse;
      try {
        console.log("[runtime] calling LLM...");
        resp = await callLLM(llmCfg, {
          messages,
          tools: builtinToolSpecs,
          temperature: llmCfg.temperature,
          maxTokens: llmCfg.maxTokens,
          stream: true,
          signal: abort,
          onChunk: (c) => {
            if (c.type === "content" && c.content) emit({ type: "token", delta: c.content });
            else if (c.type === "thinking" && c.content) emit({ type: "thinking", delta: c.content });
            else if (c.type === "tool_call" && c.toolCall) {
              // Relay tool call deltas live so the frontend can show
              // the tool card with progressively filling content.
              // Use safeJsonParse to format args as a string for transport.
              const argsStr = typeof c.toolCall.arguments === 'string' ? c.toolCall.arguments : JSON.stringify(c.toolCall.arguments ?? {});
              emit({ type: 'tool_call', name: c.toolCall.name, args: argsStr, toolCallId: c.toolCall.id });
            }
          },
        });
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

      // Streaming already delivered every content delta via onChunk above.
      // Do NOT re-emit the accumulated `resp.content` here — that would send
      // the full message a second time as one big chunk (the "content dump"
      // bug users were seeing).

      // Filter out empty-named tool calls BEFORE adding the assistant message.
      // Malformed streaming artifacts with empty names create malformed
      // assistant+tool message pairs that confuse providers.
      const validToolCalls = (resp.toolCalls ?? []).filter(
        (tc) => tc.name && typeof tc.name === "string" && tc.name.trim() !== ""
      );

      // Push the assistant message with tool calls into the messages array
      // BEFORE tool execution, so the next LLM call sees properly paired
      // tool_call + tool_result messages. Without this, tool results are
      // orphans that every provider rejects.
      if (validToolCalls.length > 0) {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: resp.content ?? "",
          toolCalls: validToolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
        };
        // Emit tool_call events FIRST so the frontend sees the tool card
      // immediately, before the DB write.
      for (const tc of validToolCalls) {
        let fnArgs: any = {};
        try { fnArgs = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : (tc.arguments ?? {}); } catch { fnArgs = {}; }
        await emit({ type: "tool_call", name: tc.name, args: fnArgs, toolCallId: tc.id });
      }
        messages.push(assistantMsg);
        // Persist to ChatStore so subsequent runs don't load orphaned tools
        ChatStore.addMessage(chatId, {
          role: "assistant",
          content: resp.content ?? "",
          toolCalls: validToolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          runId: run.id,
        });
      }

      for (const tc of validToolCalls) {
        let fnArgs: any = {};
        try {
          fnArgs = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : (tc.arguments ?? {});
        } catch (e) {
          fnArgs = { _parse_error: String(e), raw: tc.arguments };
        }
        const tool = toolRegistry.get(tc.name);
        if (!tool) {
          const result = { error: `unknown tool: ${tc.name}` };
          await emit({ type: "tool_result", name: tc.name, result, ok: false, durationMs: 0, error: String(result.error), toolCallId: tc.id });
          pushToolMessage(messages, chatId, tc, JSON.stringify(result), run.id);
          continue;
        }
        const perm = tool.defaultPermission;
        let result: any;
        let ok = true;
        const toolStart = Date.now();
        const inv = await RunStore.recordToolStart(run.id, tc.name, fnArgs, sandbox.id);
        if (perm === "never") {
          result = { error: `permission denied for tool ${tc.name}` };
          ok = false;
          await RunStore.recordToolFinish(inv.id, "denied", result, "denied by permission policy");
        } else if (perm === "ask") {
          // Check if this tool's action category has been always-allowed
          const actionCategory = getToolCategory(tc.name);
          const alwaysAllowed = actionCategory ? await AlwaysAllowStore.check(ownerId, actionCategory) : false;
          if (alwaysAllowed) {
            // Auto-approved — execute directly without prompting user
            const brokered = await toolRegistry.execute(tc.name, fnArgs, toolCtx);
            result = brokered.result;
            ok = brokered.ok;
            if (ok && result && typeof result === "object" && result.isError === true) ok = false;
            await RunStore.recordToolFinish(inv.id, ok ? "ok" : "error", result, ok ? null : String(result?.error ?? ""));
          } else {
            const approval = await Approvals.create({
              ownerId,
              chatId,
              runId: run.id,
              agentId: agent.id,
              kind: "tool",
              title: `Approve tool: ${tc.name}`,
              body: `The agent requested **${tc.name}** with these arguments:\n\n\`\`\`json\n${JSON.stringify(fnArgs, null, 2)}\n\`\`\``,
              payload: { tool: tc.name, args: fnArgs },
            });
            await emit({ type: "approval_requested", approvalId: approval.id, title: approval.title, body: approval.body, status: approval.status, toolName: tc.name });
            const decision = await Approvals.waitFor(approval.id, abort);
            if (decision.status !== "approved" && decision.status !== "auto-approved") {
              result = { error: `tool ${tc.name} was not approved`, approvalId: approval.id, status: decision.status };
              ok = false;
              await RunStore.recordToolFinish(inv.id, "denied", result, decision.response ?? decision.status);
            } else {
              const brokered = await toolRegistry.execute(tc.name, fnArgs, toolCtx);
              result = brokered.result;
              ok = brokered.ok;
              if (ok && result && typeof result === "object" && result.isError === true) ok = false;
              await RunStore.recordToolFinish(inv.id, ok ? "ok" : "error", result, ok ? null : String(result?.error ?? ""));
            }
          }
        } else {
          const brokered = await toolRegistry.execute(tc.name, fnArgs, toolCtx);
          result = brokered.result;
          ok = brokered.ok;
          if (ok && result && typeof result === "object" && result.isError === true) ok = false;
          await RunStore.recordToolFinish(inv.id, ok ? "ok" : "error", result, ok ? null : String(result?.error ?? ""));
        }
        const resultStr = normalizeToolResult(result, ok);
        const toolDuration = Date.now() - toolStart;
        await emit({ type: "tool_result", name: tc.name, result, ok, durationMs: toolDuration, error: ok ? undefined : String(result?.error ?? "failed"), toolCallId: tc.id });
        pushToolMessage(messages, chatId, tc, resultStr, run.id);
        onLog({ tool: tc.name, args: fnArgs, result: resultStr, ok, durationMs: toolDuration, at: toolStart });
        recordHistory(agent.id, tc.name, resultStr);
        await new Promise(r => setTimeout(r, 0));
      }

      // No tool calls = the LLM produced a text-only final response.
      // Persist it as an assistant message and stop looping — without this
      // the next iteration sees the same messages and generates the same
      // output, causing infinite repetition.
      if (validToolCalls.length === 0 && resp.content) {
        messages.push({ role: "assistant", content: resp.content });
        ChatStore.addMessage(chatId, {
          role: "assistant",
          content: resp.content,
          runId: run.id,
        });
        break;
      }
    }
  } catch (e: any) {
    console.log("[runtime] OUTER ERROR:", e);
    runStatus = "failed";
    runError = e?.message ?? String(e);
    emit({ type: "error", message: runError ?? "unknown error" });
  } finally {
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

/**
 * Normalise a tool execution result into a clean plain-text string suitable
 * for the `tool`-role message the LLM will see. The key rule: errors always
 * start with `!ERROR! ` so the LLM can immediately recognise failure and
 * continue rather than stopping.
 */
function normalizeToolResult(result: any, ok: boolean): string {
  // Already a string? If it's an error, prefix it; otherwise pass through.
  if (typeof result === "string") {
    if (!ok && !result.startsWith("!ERROR! ")) return `!ERROR! ${result}`;
    return result;
  }

  // Tool called `err()` internally — extract text from the content array.
  // err() returns: { content: [{ type: "text", text: "..." }], isError: true }
  if (result?.content && Array.isArray(result.content)) {
    const texts = result.content
      .filter((c: any) => c?.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text);
    if (texts.length > 0) {
      const joined = texts.join("\n");
      return ok ? joined : `!ERROR! ${joined}`;
    }
  }

  // Thrown errors from the runtime catch block: { error: "msg" }
  if (result?.error && typeof result.error === "string") {
    return `!ERROR! ${result.error}`;
  }

  // Fallback: JSON-serialise — but only the meaningful bits, not the full
  // content-array wrapper the tools return internally.
  if (typeof result === "object") {
    if (result.isError === true) ok = false;
    // Strip the transport wrapper if the inner text is extractable
    const inner = typeof result.text === "string" ? result.text
      : typeof result.message === "string" ? result.message
      : null;
    const body = inner ?? JSON.stringify(result);
    return ok ? body : `!ERROR! ${body}`;
  }

  // Unknown type — cast and prefix if error
  const str = String(result ?? "");
  return ok ? str : `!ERROR! ${str}`;
}

function toolToSpec(t: Tool): ToolSpec {
  // Use the registry's zodLikeToJsonSchema to produce a proper JSON Schema
  // with type: "object" at the root. OpenCode/DeepSeek rejects bare
  // parameter-object schemas.
  return { name: t.name, description: t.description, inputSchema: zodLikeToJsonSchema(t.parameters) as any };
}
