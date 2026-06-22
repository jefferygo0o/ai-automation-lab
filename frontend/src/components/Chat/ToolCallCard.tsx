import { useState } from "react";
import { ChevronRight } from "lucide-react";
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

  const [open, setOpen] = useState(isPending);
  const [prevPending, setPrevPending] = useState(isPending);
  if (prevPending && !isPending && open) setOpen(false);
  if (prevPending !== isPending) setPrevPending(isPending);

  const verbRaw = isPending ? meta.verb : meta.verbPast;
  const verb = verbRaw.charAt(0).toUpperCase() + verbRaw.slice(1);

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

  const kindNoun = ({
    read: "file",
    write: "file",
    edit: "file",
    delete: "file",
    list: "files",
    exec: "bash",
    http: "http",
    mcp: "mcp",
    "mcp-list": "mcp",
    memory: "memory",
    agent: "agent",
    image: "image",
    video: "video",
    audio: "audio",
    generic: "tool",
  } as Record<string, string>)[meta.kind] ?? "tool";

  const contentId = `radix-${name}`;

  const hasResult =
    result && result !== "{}" && result !== "[]" && result !== '""';

  return (
    <div className="w-full min-w-0 space-y-0.5" data-tool-row={name} data-tool-status={status ?? "pending"}>
      <div data-state={open ? "open" : "closed"} data-slot="collapsible">
        <div
          type="button"
          aria-controls={contentId}
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          data-slot="collapsible-trigger"
        >
          <div
            className="grid grid-cols-1 gap-1 w-full"
            style={{ "--tool-min-width": "100px", "--tool-icon-size": "16px" } as React.CSSProperties}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 w-full min-h-7 px-2 py-0.5 cursor-pointer rounded-md hover:bg-muted/30 text-left"
              onClick={() => setOpen((p) => !p)}
            >
              <Icon size={16} className="shrink-0 text-muted-foreground/50" />
              <span className="flex items-center gap-1.5 min-w-(--tool-min-width) flex-shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  {verb} {kindNoun}
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
          </div>
        </div>
        <div
          id={contentId}
          data-state={open ? "open" : "closed"}
          hidden={!open}
          data-slot="collapsible-content"
          className="overflow-hidden"
          style={{}}
        >
          <div className="pl-7 pr-1.5 py-1.5 space-y-1.5">
            {/* Content / result preview */}
            {!isError && hasResult && (
              <pre className="m-0 font-mono text-2xs whitespace-pre-wrap break-words text-ink-600 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto max-h-60 overflow-y-auto">
                {JSON.stringify(result, null, 2).slice(0, 4000)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
