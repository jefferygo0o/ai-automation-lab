import React, { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { cn } from "../lib/utils";

interface ThinkingBlockProps {
  /** The thinking content to display. */
  content: string;
  /**
   * True while the model is still streaming. When true the row is
   * force-expanded with a right-chevron rotated to point down; when false
   * the row auto-collapses to a right-chevron and the user can re-open it
   * manually.
   */
  live: boolean;
  className?: string;
}

/**
 * Side-chat-panel row for the agent's reasoning.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ▼ 🧠 thinking   streaming…                   │   ← live (forced open)
 *   │   …thinking tokens stream here…              │
 *   └──────────────────────────────────────────────┘
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ▶ 🧠 thinking                  312 chars     │   ← settled (collapsed)
 *   └──────────────────────────────────────────────┘
 *
 * Click anywhere on the header (when settled) to toggle the content span
 * underneath. The label and Brain icon never change — only the chevron
 * rotates and the span opens/closes.
 */
export default function ThinkingBlock({
  content,
  live,
  className = "",
}: ThinkingBlockProps) {
  const [userExpanded, setUserExpanded] = useState(false);

  const expanded = live || userExpanded;

  // If live and empty, show a subtle placeholder so the row is still
  // visible as "the agent is thinking…".
  const body =
    content.trim().length === 0 && live ? "…" : content;

  return (
    <div
      className={cn(
        "rounded-md border bg-yellow-50/40 border-l-2 border-l-yellow-400",
        className,
      )}
      data-thinking-block={live ? "live" : "settled"}
    >
      <button
        type="button"
        onClick={() => !live && setUserExpanded((v) => !v)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 text-xs text-ink-700",
          "hover:bg-yellow-100/50 transition-colors rounded-md select-none",
          live ? "cursor-default" : "cursor-pointer",
        )}
        aria-expanded={expanded}
        aria-label="Toggle thinking details"
        data-thinking-row
      >
        {/* Right chevron — rotates to point down when expanded */}
        <ChevronRight
          className={cn(
            "w-3 h-3 stroke-[2] text-ink-500 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <Brain className="w-3 h-3 stroke-[1.75] text-yellow-700 shrink-0" />
        <span className="font-bold tracking-tight text-ink-900">thinking</span>

        {live && body !== "…" && (
          <span className="ml-1 text-2xs italic text-ink-500 truncate min-w-0 hidden sm:inline-block">
            {body.slice(-60)}
          </span>
        )}

        {live && (
          <span className="ml-auto text-2xs italic text-ink-400 font-mono">
            streaming…
          </span>
        )}
        {!live && (
          <span className="ml-auto text-2xs text-ink-400 font-mono tabular-nums">
            {content.length} chars
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 pt-0.5">
          <div className="text-xs text-ink-700 leading-relaxed whitespace-pre-wrap font-mono">
            {body}
            {live && body !== "…" && (
              <span className="inline-block w-1 h-3 bg-yellow-500 ml-0.5 align-middle animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
