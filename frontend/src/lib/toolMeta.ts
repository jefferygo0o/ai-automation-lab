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
  Image as ImageIcon,
  Video,
  Mic,
  Search,
  Clock,
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
  | "image"
  | "video"
  | "audio"
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
    verb: "creating",
    verbPast: "created",
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
  // lab_* tools (backend's file/sandbox tools)
  lab_read_file: {
    icon: FileText,
    verb: "reading",
    verbPast: "read",
    kind: "read",
    tone: TONE_READ,
  },
  lab_write_file: {
    icon: FilePlus2,
    verb: "creating",
    verbPast: "created",
    kind: "write",
    tone: TONE_WRITE,
  },
  lab_edit_file: {
    icon: FileEdit,
    verb: "editing",
    verbPast: "edited",
    kind: "edit",
    tone: TONE_EDIT,
  },
  lab_edit_file_llm: {
    icon: FileEdit,
    verb: "editing",
    verbPast: "edited",
    kind: "edit",
    tone: TONE_EDIT,
  },
  lab_copy_file: {
    icon: FilePlus2,
    verb: "copying",
    verbPast: "copied",
    kind: "write",
    tone: TONE_WRITE,
  },
  lab_list_directory: {
    icon: FolderOpen,
    verb: "listing",
    verbPast: "listed",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_grep_search: {
    icon: ListChecks,
    verb: "searching",
    verbPast: "searched",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_bash: {
    icon: Terminal,
    verb: "running",
    verbPast: "ran",
    kind: "exec",
    tone: TONE_EXEC,
  },
  lab_run_sequential_cmds: {
    icon: Terminal,
    verb: "running",
    verbPast: "ran",
    kind: "exec",
    tone: TONE_EXEC,
  },
  lab_run_parallel_cmds: {
    icon: Terminal,
    verb: "running",
    verbPast: "ran",
    kind: "exec",
    tone: TONE_EXEC,
  },
  lab_generate_image: {
    icon: ImageIcon,
    verb: "generating image",
    verbPast: "generated image",
    kind: "image",
    tone: TONE_WRITE,
  },
  lab_edit_image: {
    icon: ImageIcon,
    verb: "editing image",
    verbPast: "edited image",
    kind: "image",
    tone: TONE_EDIT,
  },
  lab_generate_video: {
    icon: Video,
    verb: "generating video",
    verbPast: "generated video",
    kind: "video",
    tone: TONE_WRITE,
  },
  lab_transcribe_audio: {
    icon: Mic,
    verb: "transcribing audio",
    verbPast: "transcribed audio",
    kind: "audio",
    tone: TONE_HTTP,
  },
  lab_transcribe_video: {
    icon: Video,
    verb: "transcribing video",
    verbPast: "transcribed video",
    kind: "video",
    tone: TONE_HTTP,
  },
  // skill_tools
  list_skills: {
    icon: ListChecks,
    verb: "listing",
    verbPast: "listed",
    kind: "list",
    tone: TONE_LIST,
  },
  read_skill: {
    icon: FileText,
    verb: "reading",
    verbPast: "read",
    kind: "read",
    tone: TONE_READ,
  },
  run_skill: {
    icon: Settings2,
    verb: "running",
    verbPast: "ran",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  propose_plan: {
    icon: FileText,
    verb: "planning",
    verbPast: "planned",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  wait_for_approval: {
    icon: Clock,
    verb: "waiting",
    verbPast: "waited",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  // lab web/search tools
  lab_read_webpage: {
    icon: Globe,
    verb: "reading",
    verbPast: "read",
    kind: "read",
    tone: TONE_READ,
  },
  lab_save_webpage: {
    icon: Globe,
    verb: "saving",
    verbPast: "saved",
    kind: "write",
    tone: TONE_WRITE,
  },
  lab_web_search: {
    icon: Search,
    verb: "searching",
    verbPast: "searched",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_web_research: {
    icon: Search,
    verb: "researching",
    verbPast: "researched",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_maps_search: {
    icon: Globe,
    verb: "searching maps",
    verbPast: "searched maps",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_x_search: {
    icon: Search,
    verb: "searching",
    verbPast: "searched",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_image_search: {
    icon: ImageIcon,
    verb: "searching images",
    verbPast: "searched images",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_find_similar_links: {
    icon: Search,
    verb: "finding similar",
    verbPast: "found similar",
    kind: "list",
    tone: TONE_LIST,
  },
  lab_open_webpage: {
    icon: Globe,
    verb: "opening browser",
    verbPast: "opened browser",
    kind: "http",
    tone: TONE_HTTP,
  },
  lab_view_webpage: {
    icon: Globe,
    verb: "viewing",
    verbPast: "viewed",
    kind: "http",
    tone: TONE_HTTP,
  },
  lab_use_webpage: {
    icon: Globe,
    verb: "interacting",
    verbPast: "interacted",
    kind: "http",
    tone: TONE_HTTP,
  },
  lab_generate_d2_diagram: {
    icon: ImageIcon,
    verb: "generating diagram",
    verbPast: "generated diagram",
    kind: "image",
    tone: TONE_WRITE,
  },
  lab_check_dependencies: {
    icon: ListChecks,
    verb: "checking deps",
    verbPast: "checked deps",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  lab_install_dependency: {
    icon: Terminal,
    verb: "installing",
    verbPast: "installed",
    kind: "exec",
    tone: TONE_EXEC,
  },
  // lab management tools
  manage_skills: {
    icon: ListChecks,
    verb: "managing skills",
    verbPast: "managed skills",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  manage_automations: {
    icon: Settings2,
    verb: "managing automations",
    verbPast: "managed automations",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  manage_mcp_servers: {
    icon: Plug,
    verb: "managing MCP",
    verbPast: "managed MCP",
    kind: "mcp",
    tone: TONE_MCP,
  },
  browser_navigate: {
    icon: Globe,
    verb: "navigating",
    verbPast: "navigated",
    kind: "http",
    tone: TONE_HTTP,
  },
  browser_screenshot: {
    icon: ImageIcon,
    verb: "screenshotting",
    verbPast: "screenshotted",
    kind: "image",
    tone: TONE_HTTP,
  },
  web_search: {
    icon: Search,
    verb: "searching",
    verbPast: "searched",
    kind: "list",
    tone: TONE_LIST,
  },
  // webspace tools
  manage_webspace: {
    icon: Globe,
    verb: "managing webspace",
    verbPast: "managed webspace",
    kind: "generic",
    tone: TONE_GENERIC,
  },
  fetch_webspace_route: {
    icon: Globe,
    verb: "fetching route",
    verbPast: "fetched route",
    kind: "http",
    tone: TONE_HTTP,
  },
  // integration tools
  list_integrations: {
    icon: Plug,
    verb: "listing integrations",
    verbPast: "listed integrations",
    kind: "list",
    tone: TONE_LIST,
  },
  use_integration: {
    icon: Plug,
    verb: "using integration",
    verbPast: "used integration",
    kind: "mcp",
    tone: TONE_MCP,
  },
  get_integration_actions: {
    icon: ListChecks,
    verb: "getting actions",
    verbPast: "got actions",
    kind: "mcp-list",
    tone: TONE_MCP,
  },
  manage_integrations: {
    icon: Plug,
    verb: "managing integrations",
    verbPast: "managed integrations",
    kind: "mcp",
    tone: TONE_MCP,
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
    const p = typeof a.path === "string" ? a.path
      : typeof a.target_file === "string" ? a.target_file
      : typeof a.file === "string" ? a.file
      : null;
    if (p) return p;
    if (meta_kind === "list" && typeof a.source === "string") return a.source;
    return null;
  }
  if (meta_kind === "delete") {
    const p = typeof a.path === "string" ? a.path
      : typeof a.target_file === "string" ? a.target_file
      : typeof a.file === "string" ? a.file
      : null;
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

/**
 * Extract a readable "preview" string from a tool's result (used after the
 * tool has finished). Mirrors the shape used by the lab_* tools so the chat
 * panel can show the file contents in the expanded span.
 *
 *   { content: [{ type: "text", text: "..." }] }  → text
 *   { content: "..." }                              → content
 *   string                                          → string
 */
export function getToolPreview(
  result: unknown,
  name?: string,
  args?: Record<string, unknown> | null
): string | null {
  // For write/edit tools the user actually wants to see the file content
  // they wrote/edited, not the tool's "wrote /path (N chars)" confirmation.
  // Fall back to the args the call was made with first.
  if (name === "write_file" || name === "lab_write_file") {
    const argContent = typeof args?.content === "string" ? args.content : null;
    if (argContent !== null) return argContent;
  }
  if (name === "edit_file" || name === "lab_edit_file") {
    const ops = Array.isArray(args?.operations) ? (args!.operations as unknown[]) : null;
    if (ops && ops.length > 0) {
      const out: string[] = [];
      for (const op of ops) {
        if (!op || typeof op !== "object") continue;
        const o = op as Record<string, unknown>;
        const opName = typeof o.op === "string" ? o.op : "?";
        out.push(`# ${opName}`);
        const oldText = typeof o.old_text === "string" ? o.old_text : "";
        const newText = typeof o.new_text === "string" ? o.new_text : "";
        if (oldText) out.push("- " + oldText.split("\n").join("\n- "));
        if (newText) out.push("+ " + newText.split("\n").join("\n+ "));
      }
      return out.join("\n");
    }
  }

  if (result == null) return null;
  if (typeof result === "string") return result;
  if (typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.content)) {
    const parts: string[] = [];
    for (const c of r.content) {
      if (c && typeof c === "object") {
        const t = (c as Record<string, unknown>).text;
        if (typeof t === "string") parts.push(t);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  if (typeof r.content === "string") return r.content;
  return null;
}

/**
 * Compute a "live" line-count badge from the tool's arguments (used while
 * the tool is still pending, before the result is available).
 *
 *   write_file / lab_write_file   → args.content    line count
 *   edit_file / lab_edit_file     → args.operations → +added / −removed
 *
 * Returns null when the tool name isn't a write/edit or args aren't usable.
 */
export interface LiveLineCounts {
  /** lines being added (writes, edit additions, appends) */
  added: number;
  /** lines being removed (edit deletions, replacements) */
  removed: number;
  /** total content lines for pure writes (no remove count) */
  total?: number;
}

export function getLiveLineCounts(
  name: string,
  args: Record<string, unknown> | null | undefined,
): LiveLineCounts | null {
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "write_file" || name === "lab_write_file") {
    if (typeof a.content !== "string") return null;
    const total = a.content.length === 0 ? 0 : a.content.split("\n").length;
    return { added: total, removed: 0, total };
  }
  if (name === "edit_file" || name === "lab_edit_file") {
    if (!Array.isArray(a.operations)) return null;
    let added = 0;
    let removed = 0;
    for (const op of a.operations) {
      if (!op || typeof op !== "object") continue;
      const o = op as Record<string, unknown>;
      const newText = typeof o.new_text === "string" ? o.new_text : "";
      const oldText = typeof o.old_text === "string" ? o.old_text : "";
      const newLines = newText.length === 0 ? 0 : newText.split("\n").length;
      const oldLines = oldText.length === 0 ? 0 : oldText.split("\n").length;
      switch (o.op) {
        case "replace_block":
          added += newLines;
          removed += oldLines;
          break;
        case "insert_after":
        case "insert_before":
          added += newLines;
          break;
        case "delete_block":
          removed += oldLines;
          break;
        case "append_line":
          added += newLines;
          break;
      }
    }
    return { added, removed };
  }
  return null;
}

/**
 * Build a live preview from the tool's *arguments* (used while the tool is
 * still pending). For write tools this is the content being written; for
 * edit tools this is a diff-like summary of each operation.
 */
export function getLivePreview(
  name: string,
  args: Record<string, unknown> | null | undefined,
): string | null {
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "write_file" || name === "lab_write_file") {
    return typeof a.content === "string" ? a.content : null;
  }
  if (name === "edit_file" || name === "lab_edit_file") {
    if (!Array.isArray(a.operations)) return null;
    const out: string[] = [];
    for (const op of a.operations) {
      if (!op || typeof op !== "object") continue;
      const o = op as Record<string, unknown>;
      const opName = typeof o.op === "string" ? o.op : "?";
      const oldText = typeof o.old_text === "string" ? o.old_text : "";
      const newText = typeof o.new_text === "string" ? o.new_text : "";
      out.push(`# ${opName}`);
      if (oldText) {
        out.push("- " + oldText.split("\n").join("\n- "));
      }
      if (newText) {
        out.push("+ " + newText.split("\n").join("\n+ "));
      }
    }
    return out.join("\n");
  }
  return null;
}

export interface ToolMediaItem {
  path: string;
  mime: string;
  kind: "image" | "video" | "audio";
  alt?: string;
}

/**
 * Extract the `media` array from a tool result. Tools can attach
 *   { content: [...], media: [{ path, mime, kind, alt? }] }
 * so the chat panel can render inline previews without re-running the tool.
 */
export function getToolMedia(result: unknown): ToolMediaItem[] | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const m = r.media;
  if (!Array.isArray(m) || m.length === 0) return null;
  const out: ToolMediaItem[] = [];
  for (const item of m) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    const p = typeof i.path === "string" ? i.path : null;
    const mime = typeof i.mime === "string" ? i.mime : null;
    const kind = i.kind === "image" || i.kind === "video" || i.kind === "audio" ? i.kind : null;
    if (!p || !mime || !kind) continue;
    out.push({ path: p, mime, kind, alt: typeof i.alt === "string" ? i.alt : undefined });
  }
  return out.length > 0 ? out : null;
}
