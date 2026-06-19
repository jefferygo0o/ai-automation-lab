import React from "react";
import { useState } from "react";
import { Bot, User, Wrench, Check, AlertCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import AvatarCircle from "./AvatarCircle";
import MarkdownContent from "./MarkdownContent";
import ThinkingIndicator from "./ThinkingIndicator";
import type { Message, ToolInvocation } from "../api";

interface ChatMessageProps {
  message: Message;
  streaming?: boolean;
  agentName?: string;
  toolInvocations?: ToolInvocation[];
  isLast?: boolean;
}

function ToolCallPill({ name, args, status, durationMs }: {
  name: string;
  args?: any;
  status?: string;
  durationMs?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOk = status === "ok" || status === "success";
  const isErr = status === "error";
  const isPending = !status || status === "pending";

  return (
    <div className={`mb-1 last:mb-0 ${
      isErr ? "bg-rose-50/60 border border-rose-200 rounded-sm" : ""
    }`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 text-2xs font-mono rounded-sm
          ${isErr ? "text-rose-700" : "text-ink-500"}
          hover:bg-paper-200/60 transition-colors w-full text-left`}
      >
        {expanded
          ? <ChevronDown className="w-2.5 h-2.5 stroke-[2] shrink-0" />
          : <ChevronRight className="w-2.5 h-2.5 stroke-[2] shrink-0" />}
        <span className="w-3 h-3 grid place-items-center shrink-0">
          {isPending ? (
            <Loader2 className="w-2.5 h-2.5 stroke-[2] animate-spin text-ink-300" />
          ) : isOk ? (
            <Check className="w-2.5 h-2.5 stroke-[2.5] text-ok" />
          ) : (
            <AlertCircle className="w-2.5 h-2.5 stroke-[2.5] text-err" />
          )}
        </span>
        <span className="font-medium">{name}</span>
        {args && Object.keys(args).length > 0 && (
          <span className="text-ink-300 truncate max-w-[140px] inline-block align-bottom">
            {JSON.stringify(args).slice(0, 60)}
          </span>
        )}
        {durationMs !== undefined && (
          <span className="ml-auto text-ink-300 tabular-nums">{durationMs}ms</span>
        )}
      </button>
      {expanded && args && Object.keys(args).length > 0 && (
        <pre className="text-2xs font-mono text-ink-400 overflow-x-auto whitespace-pre-wrap px-1.5 pb-1.5 pt-0.5 ml-5 border-l-2 border-line">
          {JSON.stringify(args, null, 2).slice(0, 1200)}
        </pre>
      )}
    </div>
  );
}

function ToolResultBlock({ tool }: { tool: ToolInvocation }) {
  const [expanded, setExpanded] = useState(false);
  const isOk = tool.status === "ok" || tool.status === "success";
  const isErr = tool.status === "error";

  // Don't show empty results
  const resultStr = JSON.stringify(tool.result, null, 2);
  if (!resultStr || resultStr === "{}" || resultStr === "[]" || resultStr === '""') return null;

  return (
    <div className="mb-1 last:mb-0 ml-5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 text-2xs font-mono rounded-sm text-ink-400 hover:bg-paper-200/60 transition-colors w-full text-left ${
          isErr ? "text-rose-600" : ""
        }`}
      >
        {expanded
          ? <ChevronDown className="w-2.5 h-2.5 stroke-[2] shrink-0" />
          : <ChevronRight className="w-2.5 h-2.5 stroke-[2] shrink-0" />}
        <span>result</span>
        <span className="text-ink-300">{resultStr.slice(0, 50)}{resultStr.length > 50 ? "…" : ""}</span>
        <span className="ml-auto text-ink-300">{tool.durationMs}ms</span>
      </button>
      {expanded && (
        <pre className={`text-2xs font-mono overflow-x-auto whitespace-pre-wrap px-2 py-1.5 ml-3 border-l-2 ${
          isErr ? "border-rose-200 bg-rose-50/40 text-rose-700" : "border-line text-ink-400"
        }`}>
          {resultStr.slice(0, 2000)}
        </pre>
      )}
    </div>
  );
}

const ChatMessage = React.memo(function ChatMessage({ message, streaming, agentName, toolInvocations, isLast }: ChatMessageProps) {
  const isUser = message.role === "user";
  const toolCalls = (message.toolCalls as Array<{ name: string; args?: any; id?: string }>) ?? [];
  const hasToolCalls = toolCalls.length > 0;
  const hasContent = message.content && message.content.length > 0;
  const isStreamingMessage = isLast && streaming && !isUser;

  // Tool invocations attached from the sidebar live-run
  const relatedTools = toolInvocations?.filter((t) => t.runId === message.runId) ?? [];

  return (
    <div className={`flex gap-3 max-w-3xl ${isUser ? "flex-row-reverse ml-auto" : ""}`}>
      {/* Avatar */}
      <AvatarCircle role={isUser ? "user" : "assistant"} />

      {/* Body */}
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {/* Header: role label + optional run ID */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xs uppercase tracking-wider text-ink-400 font-mono">
            {isUser ? "you" : agentName ?? "agent"}
          </span>
          {message.runId && (
            <span className="text-2xs font-mono text-ink-300">· {message.runId.slice(0, 8)}</span>
          )}
          {isStreamingMessage && (
            <span className="text-2xs text-ink-300 italic">streaming…</span>
          )}
        </div>

        {/* Tool calls inline (from message.toolCalls) */}
        {hasToolCalls && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {toolCalls.map((tc, i) => (
              <ToolCallPill key={i} name={tc.name} args={tc.args} />
            ))}
          </div>
        )}

        {/* Live tool invocations (from SSE stream) */}
        {relatedTools.length > 0 && (
          <div className="mb-1.5">
            {relatedTools.map((t) => (
              <div key={t.id}>
                <ToolCallPill
                  name={t.toolName}
                  args={t.arguments}
                  status={t.status}
                  durationMs={t.durationMs}
                />
                <ToolResultBlock tool={t} />
              </div>
            ))}
          </div>
        )}

        {/* Message content */}
        {hasContent && (
          <div className={`bubble ${isUser ? "bubble-user" : "bubble-assistant"} inline-block text-left max-w-full`}>
            <MarkdownContent content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;