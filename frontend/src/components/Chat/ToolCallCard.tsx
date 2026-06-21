import { useState } from "react";
import {
  Check,
  AlertCircle,
  ChevronRight,
  Clock,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";
import { cn } from "../../lib/utils";
import {
  getToolMeta,
  getToolLabel,
  getLineDelta,
} from "../../lib/toolMeta";

export interface ToolCallCardProps {
  name: string;
  args?: Record<string, unknown> | null;
  result?: unknown;
  status?: "pending" | "ok" | "success" | "error" | string;
  error?: string | null;
  durationMs?: number;
}

/**
 * Plain chat-row for a single tool invocation.
 *
 *   ▶ reading read_file   /etc/hosts            ⏱ 142ms
 *   ▼ ran    write_file  /etc/hosts   +12 −0    ✓        142ms
 *
 * No card chrome — just a single row inside the assistant's message body.
 * The whole row is clickable and toggles a small details body (args / result
 * / error) below. While running, the details are force-open; once the tool
 * settles, the row auto-collapses but stays user-togglable.
 *
 * Verbs are capitalised ("Reading", "Read", "Wrote" …) so the first letter
 * is always uppercase.
 */
export function ToolCallCard({
  name,
  args,
  result,
  status,
  error,
  durationMs,
}: ToolCallCardProps) {
  const meta = getToolMeta(name);
  const Icon = meta.icon;
  const isPending = !status || status === "pending";
  const isError = status === "error";

  const [open, setOpen] = useState(isPending);
  const [prevPending, setPrevPending] = useState(isPending);
  if (prevPending && !isPending && open) setOpen(false);
  if (prevPending !== isPending) setPrevPending(isPending);

  const verbRaw = isPending ? meta.verb : meta.verbPast;
  const verb = verbRaw.charAt(0).toUpperCase() + verbRaw.slice(1);

  const label = getToolLabel(name, meta, args);
  const lineDelta = !isPending ? getLineDelta(result) : null;

  const isDelete = meta.kind === "delete";
  const labelText = label ? (isDelete ? `from ${label}` : label) : null;

  const argCount = args && typeof args === "object" ? Object.keys(args).length : 0;
  const hasArgs = argCount > 0;
  const resultStr = (() => {
    if (result === undefined || result === null) return "";
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  })();
  const hasResult =
    resultStr && resultStr !== "{}" && resultStr !== "[]" && resultStr !== '""';

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group rounded-sm transition-colors",
        isPending && "bg-paper-100/40",
      )}
      data-tool-row={name}
      data-tool-status={status ?? "pending"}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-1.5 py-1 text-left",
            "hover:bg-paper-100/60 rounded-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
          )}
          aria-label={`${verb} ${name}${label ? ` ${label}` : ""}`}
        >
          <ChevronRight
            className={cn(
              "w-3 h-3 stroke-[2] text-ink-400 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />

          {/* Status dot: a pulsing paper-300 dot while pending, a check when ok,
              an alert when error. NO spinning circle. */}
          {isPending ? (
            <span
              className="w-2 h-2 rounded-full bg-ink-400 shrink-0"
              aria-hidden="true"
            />
          ) : isError ? (
            <AlertCircle className="w-3 h-3 stroke-[2] text-err shrink-0" />
          ) : (
            <Check className="w-3 h-3 stroke-[2.25] text-ok shrink-0" />
          )}

          {/* Icon (small, muted) */}
          <Icon className="w-3 h-3 stroke-[1.75] text-ink-500 shrink-0" />

          {/* Verb (capitalised, bold) */}
          <span className="text-xs font-semibold text-ink-900 tracking-tight shrink-0">
            {verb}
          </span>

          {/* Tool name */}
          <span className="font-mono text-xs text-ink-700 shrink-0">{name}</span>

          {/* Right-aligned label */}
          {labelText && (
            <span
              className={cn(
                "text-xs font-mono truncate min-w-0 hidden sm:inline-block",
                isDelete ? "text-red-700/80" : "text-ink-500",
              )}
              title={labelText}
            >
              {labelText}
            </span>
          )}

          {/* Spacer */}
          <span className="ml-auto flex items-center gap-2 shrink-0">
            {lineDelta && (lineDelta.added > 0 || lineDelta.removed > 0) && (
              <span
                className="inline-flex items-center gap-1 text-2xs font-mono tabular-nums"
                title={`+${lineDelta.added} lines added, −${lineDelta.removed} lines removed`}
              >
                <span className="text-emerald-700">+{lineDelta.added}</span>
                <span className="text-red-600">−{lineDelta.removed}</span>
              </span>
            )}
            {isPending && (
              <span className="text-2xs text-ink-400 font-mono">
                running
              </span>
            )}
            {isError && (
              <span className="text-2xs text-err font-mono font-medium">
                error
              </span>
            )}
            {!isPending && !isError && (
              <span className="text-2xs text-ok font-mono font-medium">ok</span>
            )}
            {durationMs !== undefined && (
              <span className="inline-flex items-center gap-1 text-2xs text-ink-400 font-mono tabular-nums">
                <Clock className="w-2.5 h-2.5 stroke-[2]" />
                {durationMs}ms
              </span>
            )}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
        <div className="pl-7 pr-1.5 py-1.5 space-y-1.5">
          {hasArgs && (
            <details className="text-2xs">
              <summary className="cursor-pointer text-ink-400 font-mono uppercase tracking-wider select-none hover:text-ink-700">
                arguments · {argCount}
              </summary>
              <pre className="mt-1 font-mono text-2xs text-ink-700 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                {(() => {
                  try {
                    return JSON.stringify(args, null, 2).slice(0, 4000);
                  } catch {
                    return String(args);
                  }
                })()}
              </pre>
            </details>
          )}

          {isError && error && (
            <div>
              <div className="text-2xs font-mono uppercase tracking-wider text-err mb-0.5">
                error
              </div>
              <pre className="text-2xs font-mono text-err bg-err/5 border border-err/20 rounded-sm px-2 py-1.5 overflow-x-auto whitespace-pre-wrap">
                {error.slice(0, 2000)}
              </pre>
            </div>
          )}

          {!isError && hasResult && (
            <details>
              <summary className="cursor-pointer text-2xs font-mono uppercase tracking-wider text-ink-400 select-none hover:text-ink-700">
                result · {resultStr.length} chars
              </summary>
              <pre className="mt-1 text-2xs font-mono text-ink-800 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
                {resultStr.slice(0, 8000)}
              </pre>
            </details>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
