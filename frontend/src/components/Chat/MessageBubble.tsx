import React, { useMemo } from "react";
import { Bot, User, Wrench } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import MarkdownContent from "../MarkdownContent";
import { ToolCallCard } from "./ToolCallCard";
import { ToolGroup } from "./ToolGroup";
import ThinkingBlock from "../ThinkingBlock";
import type { Message, ToolInvocation } from "../../api";

interface MessageBubbleProps {
  message: Message;
  streaming?: boolean;
  agentName?: string;
  toolInvocations?: ToolInvocation[];
  isLast?: boolean;
  liveThinking?: string;
  allRunTools?: ToolInvocation[];
  /** When true, this is the last assistant message in its run — render the
   *  "Worked N steps" group instead of individual tool rows. */
  isLastAssistantOfRun?: boolean;
}

function parseCompletedThinking(content: string): string[] {
  const out: string[] = [];
  const re = /<thinking>([\s\S]*?)<\/thinking>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}
function stripThinking(content: string): string {
  return content
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * One chat message, rendered as a Zo/Claude-style bubble:
 *
 *   ┌──────────────────────────────────────┐
 *   │ [U] you                          2m │  ← header (avatar + role + meta)
 *   │                                      │
 *   │   What's the weather in Tokyo?       │  ← bubble body (markdown)
 *   └──────────────────────────────────────┘
 *
 *   ┌──────────────────────────────────────┐
 *   │ [A] Sonnet                       2m │
 *   │   ▾ read_file ✓ ok    142ms          │  ← inline tool cards
 *   │   ▸ search_web ✓ ok     89ms         │
 *   │   Today in Tokyo it's 22°C…          │
 *   └──────────────────────────────────────┘
 */
const MessageBubble = React.memo(function MessageBubble({
  message,
  streaming,
  agentName,
  toolInvocations,
  isLast,
  liveThinking,
  allRunTools,
  isLastAssistantOfRun,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isStreamingMessage = isLast && streaming && !isUser && !isTool;

  const toolCalls = useMemo(
    () => (message.toolCalls as Array<{ name: string; args?: any; id?: string }>) ?? [],
    [message.toolCalls]
  );

  // Filter live tools that belong to this message's run. Be lenient: if the
  // message has no runId (e.g. optimistic insert that hasn't been persisted
  // yet, or older chat history), still surface any tool that matches the
  // tool-call names already on the message — this guarantees the user sees a
  // "ok" / "error" status as soon as the SSE settles, instead of the row
  // being stuck on "running" forever.
  const relatedTools = useMemo(() => {
    if (!toolInvocations || toolInvocations.length === 0) return [];
    if (message.runId) {
      const byRun = toolInvocations.filter((t) => t.runId === message.runId);
      if (byRun.length > 0) return byRun;
    }
    // No runId on the message — fall back to intersecting by tool name with
    // the message's declared toolCalls (most recent run only).
    const names = new Set(toolCalls.map((tc) => tc.name));
    if (names.size === 0) return [];
    return toolInvocations.filter((t) => names.has(t.toolName));
  }, [toolInvocations, message.runId, toolCalls]);

  const runTools = useMemo(() => {
    if (!toolInvocations || toolInvocations.length === 0) return [];
    if (message.runId) {
      const byRun = toolInvocations.filter((t) => t.runId === message.runId);
      if (byRun.length > 0) return byRun;
    }
    // No runId on the message — fall back to intersecting by tool name with
    // the message's declared toolCalls (most recent run only).
    const names = new Set(toolCalls.map((tc) => tc.name));
    if (names.size === 0) return [];
    return toolInvocations.filter((t) => names.has(t.toolName));
  }, [toolInvocations, message.runId, toolCalls]);

  // When a single assistant turn uses ≥ 5 tools, collapse them into a single
  // "Worked N steps" summary row that expands on click (see ToolGroup). Below
  // 5 we still render individual rows so short tool sequences stay readable.
  const useGroup = runTools.length >= 5;

  // Pending tool cards that are still in `message.toolCalls` should be hidden
  // if a settled `ToolInvocation` with the same name has already arrived via
  // the SSE stream — otherwise we render the same call twice (once as
  // "running" forever, once as "ok" after the result lands).
  const completedToolNames = useMemo(() => {
    const s = new Set<string>();
    for (const t of relatedTools) s.add(t.toolName);
    return s;
  }, [relatedTools]);

  const pendingToolCalls = useMemo(
    () => toolCalls.filter((tc) => !completedToolNames.has(tc.name)),
    [toolCalls, completedToolNames],
  );

  const completedThinking = useMemo(
    () => (isUser ? [] : parseCompletedThinking(message.content ?? "")),
    [isUser, message.content]
  );

  const visibleContent = useMemo(
    () => stripThinking(message.content ?? ""),
    [message.content]
  );

  const hasLiveThinking =
    !isUser &&
    isLast &&
    streaming &&
    typeof liveThinking === "string" &&
    liveThinking.length > 0;

  const timestamp = useMemo(() => {
    const ts = message.createdAt;
    if (!ts) return "";
    const d = new Date(typeof ts === "number" ? ts : Date.parse(ts));
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "now";
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [message.createdAt]);

  // Tool messages carry raw tool output as a string. The user does NOT want to
  // see these in the chat — the tool row above already shows ✓ ok / error. We
  // simply hide them so the stream of events reads as one assistant turn.
  if (isTool) return null;

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-1 py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
        isUser && "flex-row-reverse"
      )}
      data-role={message.role}
    >
      {/* ─── Avatar ─── */}
      <div className="shrink-0 pt-0.5">
        <div
          className={cn(
            "w-7 h-7 rounded-full grid place-items-center border transition-colors",
            isUser
              ? "bg-paper-100 border-line text-ink-700"
              : "bg-paper-50 border-line text-ink-700"
          )}
        >
          {isUser ? (
            <User className="w-3.5 h-3.5 stroke-[1.75]" />
          ) : (
            <Bot className="w-3.5 h-3.5 stroke-[1.75]" />
          )}
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className={cn("flex-1 min-w-0 space-y-1.5", isUser && "flex flex-col items-end")}>
        {/* Header: name + timestamp + meta */}
        <div
          className={cn(
            "flex items-center gap-2 text-2xs font-mono",
            isUser && "flex-row-reverse"
          )}
        >
          <span className="font-semibold tracking-tight text-ink-900">
            {isUser ? "You" : agentName ?? "Agent"}
          </span>
          <span className="text-ink-400 tabular-nums">{timestamp}</span>
          {isStreamingMessage && (
            <Badge variant="info" size="sm" className="gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse" />
              streaming
            </Badge>
          )}
          {message.runId && !isUser && (
            <span className="text-ink-300 truncate max-w-[120px]" title={message.runId}>
              · {message.runId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* ─── Tool calls stack (from message.toolCalls) ─── */}
        {pendingToolCalls.length > 0 && (
          <div className="w-full max-w-2xl space-y-1">
            {pendingToolCalls.map((tc, i) => (
              <ToolCallCard
                key={`${tc.id ?? i}`}
                name={tc.name}
                args={tc.args}
                status="pending"
              />
            ))}
          </div>
        )}

        {/* ─── Live tool invocations from SSE (have results) ─── */}
        {runTools.length > 0 && useGroup && isLastAssistantOfRun && (
          <ToolGroup tools={runTools} className="w-full max-w-2xl" />
        )}
        {runTools.length > 0 && !(useGroup && isLastAssistantOfRun) && (
          <div className="w-full max-w-2xl space-y-0.5">
            {runTools.map((t) => (
              <ToolCallCard
                key={t.id}
                name={t.toolName}
                args={t.arguments}
                result={t.result}
                status={t.status}
                error={t.error}
                durationMs={t.durationMs}
              />
            ))}
          </div>
        )}

        {/* ─── Live in-stream thinking ─── */}
        {hasLiveThinking && (
          <ThinkingBlock content={liveThinking!} live className="w-full max-w-2xl" />
        )}

        {/* ─── Completed thinking blocks (collapsed by default) ─── */}
        {completedThinking.map((block, i) => (
          <ThinkingBlock
            key={`think-${i}`}
            content={block}
            live={false}
            className="w-full max-w-2xl"
          />
        ))}

        {/* ─── Message body (markdown) ─── */}
        {visibleContent.length > 0 && (
          <div
            className={cn(
              "rounded-sm px-3.5 py-2.5 text-sm leading-relaxed border max-w-full overflow-hidden",
              isUser
                ? "bg-paper-100 text-ink-900 border-line-soft"
                : "bg-paper-50 text-ink-900 border-line"
            )}
          >
            <MarkdownContent content={visibleContent} />
            {isStreamingMessage && (
              <span className="inline-block w-1.5 h-3.5 bg-ink-700 ml-0.5 align-middle animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {/* If we're streaming and haven't received any content yet, show a thin indicator */}
        {isStreamingMessage && visibleContent.length === 0 && !hasLiveThinking && pendingToolCalls.length === 0 && relatedTools.length === 0 && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="think-dot" />
            <span className="think-dot" />
            <span className="think-dot" />
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;