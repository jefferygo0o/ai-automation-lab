import { useState } from "react";
import { ChevronRight, Check, AlertCircle, Clock } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";
import { cn } from "../../lib/utils";
import { getToolMeta } from "../../lib/toolMeta";
import type { ToolInvocation } from "../../api";
import { ToolCallCard } from "./ToolCallCard";

interface ToolGroupProps {
  tools: ToolInvocation[];
  className?: string;
}

/**
 * Compact summary row for a long sequence of tool calls (≥ 5).
 *
 *   ▶ Worked 8 steps · read_file, write_file, edit_file …            ✓
 *
 * Clicking expands to the individual `ToolCallCard` rows. The summary is
 * the same row that `MessageBubble` renders inline — there is no card chrome,
 * just a single line. Renders nothing if fewer than 5 tools.
 */
export function ToolGroup({ tools, className }: ToolGroupProps) {
  const [open, setOpen] = useState(false);
  if (tools.length < 5) return null;

  const okCount = tools.filter(
    (t) => t.status === "ok" || t.status === "success",
  ).length;
  const errCount = tools.filter((t) => t.status === "error").length;
  const pendingCount = tools.length - okCount - errCount;

  // De-duplicated list of tool names with a short count per name.
  const seen = new Map<string, number>();
  for (const t of tools) seen.set(t.toolName, (seen.get(t.toolName) ?? 0) + 1);
  const toolNames = Array.from(seen.entries()).slice(0, 4);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("group", className)}
      data-tool-group
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-1.5 py-1 text-left rounded-sm",
            "hover:bg-paper-100/60 transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
          )}
        >
          <ChevronRight
            className={cn(
              "w-3 h-3 stroke-[2] text-ink-400 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="text-xs font-semibold text-ink-900 tracking-tight shrink-0">
            Worked {tools.length} steps
          </span>
          <span className="text-xs text-ink-500 font-mono truncate min-w-0">
            {toolNames.map(([n, c], i) => (
              <span key={n}>
                {i > 0 && <span className="text-ink-300">, </span>}
                {n}
                {c > 1 && <span className="text-ink-400"> ×{c}</span>}
              </span>
            ))}
            {toolNames.length < seen.size && (
              <span className="text-ink-400">…</span>
            )}
          </span>

          <span className="ml-auto flex items-center gap-2 shrink-0">
            {errCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-2xs font-mono font-medium text-err">
                <AlertCircle className="w-3 h-3 stroke-[2]" />
                {errCount} failed
              </span>
            ) : pendingCount > 0 ? (
              <span className="w-2 h-2 rounded-full bg-ink-400 shrink-0" />
            ) : (
              <Check className="w-3 h-3 stroke-[2.25] text-ok shrink-0" />
            )}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
        <div className="pl-4 pr-1.5 py-1 space-y-0.5">
          {tools.map((t) => (
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
      </CollapsibleContent>
    </Collapsible>
  );
}