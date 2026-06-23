import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  getToolMeta,
  getToolLabel,
  getLineDelta,
  getToolPreview,
  getLivePreview,
} from "../../lib/toolMeta";

/** Quick language detection for code previews. */
function detectLang(s: string): string | null {
  const t = s.trim();
  const lines = t.split("\n").filter((l) => l.trim().length > 0);
  if (/^[{[]/.test(t) && /\s*"/.test(t.slice(1, 3))) return "json";
  if (/\b(import\s+(type\s+)?\{|export\s+(default\s+)?(function|class|const)|<\w+[\s>])/.test(t))
    return "tsx";
  if (/\b(interface|type)\s+\w/.test(t) || /:\s*(string|number|boolean|void|any)\b/.test(t))
    return "ts";
  if (/\b(const|let|var|function|require|module\.exports)\b/.test(t)) return "js";
  if (/\b(def |class |import |from |print\()/.test(t)) return "python";
  if (/\b(fn |let mut|impl |struct |enum |trait )/.test(t)) return "rust";
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/im.test(t)) return "sql";
  if (/\b(package |func |import \(|type struct\b)/.test(t)) return "go";
  if (/^</.test(t) || /<\/\w+>/.test(t)) return "html";
  if (lines.every((l) => /^[#\$\w\-./]/.test(l) && !/[{}]/.test(l)) && lines.length > 2 && t.includes("$"))
    return "bash";
  if (/^[\w-]+:\s/.test(t) || /^\[[\w-]+]/.test(t)) return "yaml";
  if (/\{[\s\S]*\}/.test(t) && /[\w-]+\s*:/.test(t) && !t.includes("<")) return "css";
  return null;
}

/** Heuristic: does a string look like code rather than prose? */
function isCodeContent(s: string): boolean {
  if (s.length < 60) return false;
  const codePatterns = [
    /^(import|export|const|let|var|function|class|interface|type|def |fn |impl |pub )/m,
    /^(#include|package |namespace |use |require)/m,
    /[{};]/,
    /=>/,
    /:\s*(string|number|boolean|void|any|int|str|bool)\b/,
    /^(<!DOCTYPE|<html|<div|<span|<head|<body)/i,
    /^\s*[\/\*#].*$/m,
  ];
  return codePatterns.some((p) => p.test(s));
}

export interface ToolCallCardProps {
  name: string;
  args?: Record<string, unknown> | null;
  result?: unknown;
  status?: "pending" | "ok" | "success" | "error" | string;
  error?: string | null;
  durationMs?: number;
}

/**
 * Zo-style collapsible row for a single tool invocation.
 *
 *   ▶ ● Writing… write_file   /etc/hosts   +12   running   1.2s
 *   ▶ ✓ Wrote    write_file   /etc/hosts   +12   ok        142ms
 *
 * Single row, no card chrome. Clickable to toggle content preview.
 * While running the details are force-open; when done they auto-collapse
 * but stay user-togglable.
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
  const isSettled = !isPending;

  const [open, setOpen] = useState(false);

  const verbRaw = isPending ? meta.verb : meta.verbPast;
  const verb = verbRaw.charAt(0).toUpperCase() + verbRaw.slice(1);
  const verbLabel = verb;

  const label = getToolLabel(name, meta, args);
  const lineDelta = !isPending ? getLineDelta(result) : null;

  const argsCounts =
    meta.kind === "write" || meta.kind === "edit"
      ? (args as any)?.content?.toString().split("\n").length
      : null;

  const liveCounts = isPending
    ? null
    : lineDelta && (lineDelta.added > 0 || lineDelta.removed > 0)
      ? lineDelta
      : argsCounts;

  const isDelete = meta.kind === "delete";
  const labelText = label ? (isDelete ? `from ${label}` : label) : null;

  const contentId = `radix-${name}`;

  const hasResult =
    result && result !== "{}" && result !== "[]" && result !== '""';

  // Extract preview content
  const livePreview = isPending ? getLivePreview(name, args) : null;
  const toolPreview = !isPending ? getToolPreview(result, name, args) : null;
  const preview = livePreview ?? toolPreview ?? null;

  const fallbackDisplay = hasResult
    ? JSON.stringify(result, null, 2).slice(0, 4000)
    : null;
  const displayContent = preview ?? fallbackDisplay;

  const isCode = displayContent !== null && isCodeContent(displayContent);
  const lang = isCode ? detectLang(displayContent) : null;

  return (
    <div className="w-full min-w-0 space-y-0.5" data-tool-row={name} data-tool-status={status ?? "pending"}>
      <div data-state={open ? "open" : "closed"} data-slot="collapsible">
        <button
          type="button"
          aria-controls={contentId}
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          data-slot="collapsible-trigger"
          className="flex items-center gap-1.5 w-full min-h-7 px-2 py-0.5 cursor-pointer rounded-md hover:bg-muted/30 text-left"
          onClick={() => setOpen((p) => !p)}
        >
          <Icon size={16} className="shrink-0 text-muted-foreground/50" />
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={cn(
                "font-mono text-2xs font-semibold tracking-tight select-none",
                isSettled && status === "ok" && "text-ok",
                isSettled && status === "error" && "text-err",
                isPending && "text-ink-500",
                isPending && "shimmer-text"
              )}
            >
              {isPending ? "pending…" : verbLabel}
            </span>
            {liveCounts && (
              <span className="text-[10px] tabular-nums flex items-center gap-0.5">
                {liveCounts.added > 0 && <span className="text-open-foreground">+{liveCounts.added}</span>}
                {liveCounts.removed > 0 && <span className="text-muted-foreground">-{liveCounts.removed}</span>}
              </span>
            )}
            <ChevronRight
              size={14}
              className={`shrink-0 text-muted-foreground/50 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            />
          </span>
          <div className="flex items-center justify-end gap-1.5 pl-2 min-w-0 flex-1 [&_p]:my-0 [&_p]:whitespace-nowrap [&_p]:overflow-hidden [&_p]:text-ellipsis [&_code]:whitespace-nowrap">
            {label && (
              <span
                className="text-xs text-muted-foreground/50 font-mono truncate min-w-0 cursor-pointer hover:text-muted-foreground hover:underline transition-colors duration-150"
                role="button"
                tabIndex={0}
              >
                {labelText}
              </span>
            )}
          </div>
        </button>
        <div
          id={contentId}
          data-state={open ? "open" : "closed"}
          hidden={!open}
          data-slot="collapsible-content"
          className="overflow-hidden"
        >
          <div className="pl-7 pr-1.5 py-1.5 space-y-1.5">
            {!isError && displayContent !== null && (
              isCode ? (
                <div className="my-0 group">
                  {lang && (
                    <div className="flex items-center h-5 px-2.5 border border-b-0 border-line rounded-t-sm bg-paper-100 text-[10px] font-mono text-ink-400 uppercase tracking-wider">
                      {lang}
                    </div>
                  )}
                  <pre
                    className={`overflow-x-auto max-h-60 overflow-y-auto m-0 border border-line bg-paper-100 p-2.5 text-xs leading-relaxed text-ink-800 ${lang ? "rounded-t-none rounded-b-sm" : "rounded-sm"}`}
                  >
                    <code>{displayContent}</code>
                  </pre>
                </div>
              ) : preview !== null ? (
                <pre className="m-0 font-mono text-2xs whitespace-pre-wrap break-words text-ink-600 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto max-h-60 overflow-y-auto">
                  {displayContent}
                </pre>
              ) : hasResult ? (
                <pre className="m-0 font-mono text-2xs whitespace-pre-wrap break-words text-ink-600 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto max-h-60 overflow-y-auto">
                  {JSON.stringify(result, null, 2).slice(0, 4000)}
                </pre>
              ) : null
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
