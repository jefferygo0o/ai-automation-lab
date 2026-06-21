/**
 * Tool metadata for the chat panel.
 *
 * Maps a tool name (as emitted by the backend runtime) to:
 *   - icon:    lucide-react component to show in the side chat panel row
 *   - verb:    present-participle verb used while the tool is running
 *              (e.g. "running", "writing")
 *   - verbPast: past tense used once the tool has finished
 *              (e.g. "ran", "wrote", "edited")
 *   - kind:    coarse bucket used to decide what info to show next to the verb
 *              (path, "from <path>", command, METHOD url, etc.)
 *   - palette: tone colour class for the icon background
 *
 * Tools not in this map fall back to the "generic" entry so the chat panel
 * never crashes on an unknown tool.
 */
import {
  FileText,
  FilePlus2,
  FileEdit,
  FileMinus2,
  FolderOpen,
  Terminal,
  Globe,
  Plug,
  ListChecks,
  Brain,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export type ToolKind =
  | "read"
  | "write"
  | "edit"
  | "delete"
  | "list"
  | "exec"
  | "http"
  | "mcp"
  | "mcp-list"
  | "memory"
  | "agent"
  | "generic";

export interface ToolMeta {
  icon: LucideIcon;
  /** Verb shown while running. Default: "running". */
  verb: string;
  /** Verb shown after the tool has finished. Default: "ran". */
  verbPast: string;
  kind: ToolKind;
  /** Tailwind classes for the icon tile background + text colour. */
  tone: string;
}

const TONE_READ = "bg-paper-100 text-ink-600";
const TONE_WRITE = "bg-emerald-50 text-emerald-700 border border-emerald-200/60";
const TONE_EDIT = "bg-amber-50 text-amber-700 border border-amber-200/60";
const TONE_DELETE = "bg-red-50 text-red-700 border border-red-200/60";
const TONE_LIST = "bg-paper-100 text-ink-600";
const TONE_EXEC = "bg-slate-100 text-slate-700 border border-slate-200/60";
const TONE_HTTP = "bg-sky-50 text-sky-700 border border-sky-200/60";
const TONE_MCP = "bg-violet-50 text-violet-700 border border-violet-200/60";
const TONE_MEMORY = "bg-purple-50 text-purple-700 border border-purple-200/60";
const TONE_AGENT = "bg-indigo-50 text-indigo-700 border border-indigo-200/60";
const TONE_GENERIC = "bg-paper-100 text-ink-600";

export const TOOL_META: Record<string, ToolMeta> = {
  read_file: {
    icon: FileText,
    verb: "reading",
    verbPast: "read",
    kind: "read",
    tone: TONE_READ,
  },
  write_file: {
    icon: FilePlus2,
    verb: "writing",
    verbPast: "wrote",
    kind: "write",
    tone: TONE_WRITE,
  },
  list_files: {
    icon: FolderOpen,
    verb: "listing",
    verbPast: "listed",
    kind: "list",
    tone: TONE_LIST,
  },
  execute_command: {
    icon: Terminal,
    verb: "running",
    verbPast: "ran",
    kind: "exec",
    tone: TONE_EXEC,
  },
  http_request: {
    icon: Globe,
    verb: "fetching",
    verbPast: "fetched",
    kind: "http",
    tone: TONE_HTTP,
  },
  call_mcp_tool: {
    icon: Plug,
    verb: "calling",
    verbPast: "called",
    kind: "mcp",
    tone: TONE_MCP,
  },
  list_mcp_tools: {
    icon: ListChecks,
    verb: "listing",
    verbPast: "listed",
    kind: "mcp-list",
    tone: TONE_MCP,
  },
  update_memory: {
    icon: Brain,
    verb: "remembering",
    verbPast: "remembered",
    kind: "memory",
    tone: TONE_MEMORY,
  },
  read_memory: {
    icon: Brain,
    verb: "reading",
    verbPast: "read",
    kind: "memory",
    tone: TONE_MEMORY,
  },
  delete_memory: {
    icon: FileMinus2,
    verb: "deleting",
    verbPast: "deleted",
    kind: "delete",
    tone: TONE_DELETE,
  },
  update_agent_file: {
    icon: Settings2,
    verb: "editing",
    verbPast: "edited",
    kind: "agent",
    tone: TONE_AGENT,
  },
  edit_file: {
    icon: FileEdit,
    verb: "editing",
    verbPast: "edited",
    kind: "edit",
    tone: TONE_EDIT,
  },
};

export const FALLBACK_META: ToolMeta = {
  icon: Settings2,
  verb: "running",
  verbPast: "ran",
  kind: "generic",
  tone: TONE_GENERIC,
};

export function getToolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? { ...FALLBACK_META, icon: FALLBACK_META.icon };
}

/**
 * Build the "right side" label for a tool row.
 *
 *   read_file              → "/etc/hosts"
 *   write_file             → "/etc/hosts"
 *   delete_* (or kind=delete) → "/etc/hosts"   (prefixed "from" by caller)
 *   execute_command        → "ls -la /tmp"
 *   http_request           → "GET https://api.example.com/v1/…"
 *   call_mcp_tool          → "gmail.send_message"
 *   list_files             → "/etc"
 *   update_agent_file      → "persona.md"
 *   edit_file              → "/etc/hosts"
 *
 * Returns null when no useful label can be derived (the row will fall back
 * to showing the tool name only).
 */
export function getToolLabel(
  name: string,
  meta: ToolMeta,
  args: Record<string, unknown> | null | undefined,
): string | null {
  const a = (args ?? {}) as Record<string, unknown>;
  const meta_kind = meta.kind;

  if (meta_kind === "read" || meta_kind === "write" || meta_kind === "edit" || meta_kind === "list") {
    const p = typeof a.path === "string" ? a.path : null;
    if (p) return p;
    if (meta_kind === "list" && typeof a.source === "string") return a.source;
    return null;
  }
  if (meta_kind === "delete") {
    const p = typeof a.path === "string" ? a.path : null;
    return p;
  }
  if (meta_kind === "exec") {
    const cmd = typeof a.command === "string" ? a.command : null;
    const argv = Array.isArray(a.args) ? (a.args as unknown[]).map(String) : [];
    if (cmd) return [cmd, ...argv].join(" ").trim();
    return null;
  }
  if (meta_kind === "http") {
    const url = typeof a.url === "string" ? a.url : null;
    const method = typeof a.method === "string" ? a.method.toUpperCase() : "GET";
    return url ? `${method} ${url}` : null;
  }
  if (meta_kind === "mcp") {
    const server = typeof a.server === "string" ? a.server : null;
    const tool = typeof a.tool === "string" ? a.tool : null;
    if (server && tool) return `${server}.${tool}`;
    if (server) return server;
    return null;
  }
  if (meta_kind === "agent") {
    const f = typeof a.file === "string" ? a.file : null;
    return f;
  }
  if (meta_kind === "memory") {
    if (name === "update_memory") {
      const k = typeof a.key === "string" ? a.key : null;
      return k;
    }
    return null;
  }
  // generic — show the tool name
  return null;
}

/**
 * Try to derive a "+N −M" line-count pair from a tool result.
 *
 * Recognised shapes:
 *   { linesAdded: N, linesRemoved: M }
 *   { added: N, removed: M }
 *   { diff: { additions: N, deletions: M } }
 *   { additions: N, deletions: M }
 *   { stats: { added: N, removed: M } }
 */
export interface LineDelta {
  added: number;
  removed: number;
}

export function getLineDelta(result: unknown): LineDelta | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const flat =
    (typeof r.linesAdded === "number" && typeof r.linesRemoved === "number"
      ? { added: r.linesAdded, removed: r.linesRemoved }
      : null) ??
    (typeof r.added === "number" && typeof r.removed === "number"
      ? { added: r.added, removed: r.removed }
      : null) ??
    (typeof r.additions === "number" && typeof r.deletions === "number"
      ? { added: r.additions, removed: r.deletions }
      : null);
  if (flat) return flat;

  for (const k of ["diff", "stats", "summary"]) {
    const inner = r[k];
    if (inner && typeof inner === "object") {
      const i = inner as Record<string, unknown>;
      if (typeof i.additions === "number" && typeof i.deletions === "number") {
        return { added: i.additions, removed: i.deletions };
      }
      if (typeof i.added === "number" && typeof i.removed === "number") {
        return { added: i.added, removed: i.removed };
      }
    }
  }
  return null;
}
