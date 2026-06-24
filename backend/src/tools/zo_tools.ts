/**
 * Zo System Tools — direct access to Zo Computer's runtime capabilities
 * for the agent. These tools wrap the Zo HTTP API so the agent can
 * manipulate its own computer just like the user does in chat.
 *
 * Tools included:
 *   - File tools:    read_file, write_file, edit_file, edit_file_llm,
 *                    copy_file, list_directory, grep_search
 *   - Commands:      bash, run_sequential_cmds, run_parallel_cmds
 *   - Web search:    web_search, web_research, maps_search, x_search,
 *                    image_search, find_similar_links
 *   - Web pages:     read_webpage, save_webpage, open_webpage,
 *                    view_webpage, use_webpage, transcribe_audio,
 *                    transcribe_video
 *   - Media:         generate_image, edit_image, generate_video,
 *                    generate_d2_diagram
 *
 * All tools require the `zo_api_key` secret to be configured. Set it in
 * the Secrets page as `zo_api_key` and the agent can use them.
 */

import { toolRegistry, type ToolContext, type ToolParameters } from "./registry.ts";
import { SecretStore } from "../secrets/store.ts";
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, isAbsolute, resolve } from "node:path";
import { tmpdir } from "node:os";

const ZO_API_BASE = "https://api.zo.computer/v1";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

/** Get the Zo API key from the user's secrets. */
async function getZoKey(ctx: ToolContext): Promise<string | null> {
  const key = await SecretStore.get(ctx.ownerId, "zo_api_key");
  if (!key) {
    return null;
  }
  return key;
}

/** Call a Zo API endpoint. Returns parsed JSON or text. */
async function zoFetch(
  ctx: ToolContext,
  path: string,
  body: any,
  options: { signal?: AbortSignal } = {},
): Promise<{ ok: boolean; status: number; data: any; text?: string }> {
  const key = getZoKey(ctx);
  if (!key) {
    return {
      ok: false,
      status: 401,
      data: null,
      text:
        "Zo API key not configured. Add a secret named `zo_api_key` in Settings → Secrets.",
    };
  }
  try {
    const res = await fetch(`${ZO_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal ?? ctx.abort,
    });
    const text_ = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text_);
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text: text_ };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, text: e?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------------
// PATH HELPERS
// ---------------------------------------------------------------------------

/**
 * Resolve a user-supplied path. If absolute, use as-is. Otherwise treat
 * as relative to the agent's sandbox workdir.
 */
function resolveForSandbox(ctx: ToolContext, p: string): string {
  if (!p) throw new Error("path is required");
  if (isAbsolute(p)) return resolve(p);
  if (!ctx.sandbox) return resolve(p);
  return ctx.sandbox.resolveSafe(p);
}

function saveToSandbox(ctx: ToolContext, absPath: string, content: string | Buffer) {
  const sbox = ctx.sandbox;
  if (!sbox) throw new Error("sandbox is required to save files");
  // Re-anchor into the sandbox workdir
  const workdir = sbox.workdir;
  let rel: string;
  if (absPath.startsWith(workdir)) {
    rel = absPath.slice(workdir.length).replace(/^\/+/, "");
  } else {
    rel = absPath.replace(/^\/+/, "");
  }
  sbox.writeFile(rel, typeof content === "string" ? content : content.toString("utf8"));
  return rel;
}

// ---------------------------------------------------------------------------
// FILE TOOLS
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "zo_read_file",
  description:
    "Read a file from the agent's filesystem. ALWAYS call this before assuming a file's contents. " +
    "Supports text, images, PDFs, EPUBs, and office documents (docx, xlsx).",
  parameters: {
    target_file: { type: "string", description: "absolute path to the file", required: true },
    start_line: { type: "number", description: "1-indexed line to start from (omit to read from beginning)", required: false },
    end_line: { type: "number", description: "1-indexed line to end at (omit to read to end)", required: false },
    read_entire_file: { type: "boolean", description: "set true to ignore line limits", required: false },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    try {
      const abs = resolveForSandbox(ctx, args.target_file);
      if (!existsSync(abs)) {
        return err(`file not found: ${abs}`);
      }
      const stat = statSync(abs);
      // For very small files or explicit read_entire_file, return whole content
      if (args.read_entire_file || stat.size < 8192) {
        const content = readFileSync(abs, "utf8");
        return text(content);
      }
      // Otherwise use line range
      const lines = readFileSync(abs, "utf8").split(/\r?\n/);
      const start = Math.max(0, (args.start_line ?? 1) - 1);
      const end = Math.min(lines.length, args.end_line ?? lines.length);
      const chunk = lines.slice(start, end).join("\n");
      const header = `[lines ${start + 1}-${end} of ${lines.length}]\n`;
      return text(header + chunk);
    } catch (e: any) {
      return err(`read_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_write_file",
  description:
    "Write content to a file. Creates parent directories if needed. " +
    "Omit content to create an empty file. To make surgical edits, use edit_file instead.",
  parameters: {
    target_file: { type: "string", description: "absolute path to the file", required: true },
    content: { type: "string", description: "full file contents to write", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    if (args.content === undefined) return err("content is required");
    try {
      const abs = resolveForSandbox(ctx, args.target_file);
      if (ctx.sandbox) {
        saveToSandbox(ctx, abs, args.content);
      } else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, args.content, "utf8");
      }
      return text(`wrote ${abs} (${args.content.length} chars)`);
    } catch (e: any) {
      return err(`write_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_edit_file",
  description:
    "Make surgical edits to a file using deterministic operations. Each operation " +
    "replaces, inserts, or deletes a block of text. Use this for small targeted changes; " +
    "for larger rewrites, use write_file instead.",
  parameters: {
    target_file: { type: "string", description: "absolute path to the file", required: true },
    operations: {
      type: "array",
      description: "list of edit operations",
      required: true,
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["replace_block", "insert_after", "insert_before", "delete_block", "append_line"] },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
      },
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    if (!Array.isArray(args.operations) || args.operations.length === 0) {
      return err("operations must be a non-empty array");
    }
    try {
      const abs = resolveForSandbox(ctx, args.target_file);
      let content = existsSync(abs) ? readFileSync(abs, "utf8") : "";
      let applied = 0;
      for (const op of args.operations) {
        if (op.op === "replace_block") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) {
            return err(`replace_block: old_text not found`);
          }
          content = content.replace(op.old_text, op.new_text ?? "");
        } else if (op.op === "insert_after") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) {
            return err(`insert_after: anchor text not found`);
          }
          content = content.replace(op.old_text, op.old_text + "\n" + (op.new_text ?? ""));
        } else if (op.op === "insert_before") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) {
            return err(`insert_before: anchor text not found`);
          }
          content = content.replace(op.old_text, (op.new_text ?? "") + "\n" + op.old_text);
        } else if (op.op === "delete_block") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) {
            return err(`delete_block: text not found`);
          }
          content = content.replace(op.old_text, "");
        } else if (op.op === "append_line") {
          content += (content.endsWith("\n") ? "" : "\n") + (op.new_text ?? "") + "\n";
        } else {
          return err(`unknown op: ${op.op}`);
        }
        applied++;
      }
      if (ctx.sandbox) {
        saveToSandbox(ctx, abs, content);
      } else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf8");
      }
      return text(`applied ${applied} edit(s) to ${abs}`);
    } catch (e: any) {
      return err(`edit_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_copy_file",
  description: "Copy a file from source to destination. Creates parent directories as needed.",
  parameters: {
    source_path: { type: "string", description: "absolute source file path", required: true },
    dest_path: { type: "string", description: "absolute destination file path", required: true },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    if (!args.source_path || !args.dest_path) return err("source_path and dest_path are required");
    try {
      const src = resolveForSandbox(ctx, args.source_path);
      const dst = resolveForSandbox(ctx, args.dest_path);
      const content = readFileSync(src);
      if (ctx.sandbox) {
        saveToSandbox(ctx, dst, content);
      } else {
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, content);
      }
      return text(`copied ${src} → ${dst}`);
    } catch (e: any) {
      return err(`copy_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_list_directory",
  description:
    "List the contents of a directory as a tree. Use ignore patterns to skip folders " +
    "(e.g. ['node_modules', '.git', 'dist']).",
  parameters: {
    path: { type: "string", description: "absolute path to list (default '.')", required: false },
    ignore: {
      type: "array",
      description: "glob patterns to skip",
      required: false,
      items: { type: "string" },
    },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    try {
      const p = resolveForSandbox(ctx, args.path ?? ".");
      if (!existsSync(p)) return err(`directory not found: ${p}`);
      const stat = statSync(p);
      if (!stat.isDirectory()) return err(`not a directory: ${p}`);
      const lines: string[] = [p];
      function walk(dir: string, prefix: string) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = join(dir, e.name);
          if (e.isDirectory()) {
            lines.push(`${prefix}└── ${e.name}/`);
            walk(full, prefix + "    ");
          } else {
            const st = statSync(full);
            lines.push(`${prefix}└── ${e.name}  (${st.size} bytes)`);
          }
        }
      }
      walk(p, "");
      return text(lines.join("\n"));
    } catch (e: any) {
      return err(`list_directory failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_grep_search",
  description:
    "Search for content within files using ripgrep. Supports filename or content modes. " +
    "By default searches the user's workspace.",
  parameters: {
    query: { type: "string", description: "the pattern to search for", required: true },
    location: {
      type: "string",
      description: "USER (default), CONVERSATION, or ALL_CONVERSATIONS",
      enum: ["USER", "CONVERSATION", "ALL_CONVERSATIONS"],
      required: false,
    },
    case_sensitive: { type: "boolean", description: "match case (default: smart-case)", required: false },
    include_pattern: { type: "string", description: "glob to include (e.g. *.ts)", required: false },
    exclude_pattern: { type: "string", description: "glob to exclude (e.g. node_modules/**)", required: false },
    search_kind: {
      type: "string",
      enum: ["filename", "content"],
      description: "filename (match path) or content (match file contents)",
      required: false,
    },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    try {
      const { spawn } = await import("node:child_process");
      const roots: Record<string, string> = {
        USER: process.env.HOME ? join(process.env.HOME, "workspace") : "/home/workspace",
        CONVERSATION: process.env.HOME ? join(process.env.HOME, ".z/workspaces/con_qw3JB8EPsFqLmi9I") : "/home/.z/workspaces/con_qw3JB8EPsFqLmi9I",
        ALL_CONVERSATIONS: process.env.HOME ? join(process.env.HOME, ".z/workspaces") : "/home/.z/workspaces",
      };
      const root = roots[args.location ?? "USER"] ?? roots.USER;
      const cliArgs: string[] = [];
      if (args.search_kind === "filename") cliArgs.push("--files-with-matches");
      else cliArgs.push("-n");
      if (args.case_sensitive) cliArgs.push("--case-sensitive");
      else cliArgs.push("--smart-case");
      if (args.include_pattern) cliArgs.push("--glob", args.include_pattern);
      if (args.exclude_pattern) cliArgs.push("--glob", `!${args.exclude_pattern}`);
      cliArgs.push("--", args.query, root);
      const proc = spawn("rg", cliArgs, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let stderrData = "";
      proc.stdout.on("data", (c) => (out += c.toString()));
      proc.stderr.on("data", (c) => (stderrData += c.toString()));
      const code: number = await new Promise((res) => proc.on("close", res));
      if (code !== 0 && code !== 1) {
        return err(`ripgrep failed (${code}): ${stderrData.slice(0, 500)}`);
      }
      const trimmed = out.length > 16_000 ? out.slice(0, 16_000) + `\n... (truncated, ${out.length} total chars)` : out;
      return text(trimmed || "(no matches)");
    } catch (e: any) {
      return err(`grep_search failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// COMMAND EXECUTION
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "zo_bash",
  description:
    "Run a single shell command. Long-running commands are fine — pass a timeout (in seconds) " +
    "for anything over a few minutes. By default commands run from /home/workspace.",
  parameters: {
    cmd: { type: "string", description: "the shell command to run", required: true },
    cwd: { type: "string", description: "working directory (default /home/workspace)", required: false },
    timeout: { type: "number", description: "timeout in seconds (default 0 = no limit)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.cmd) return err("cmd is required");
    try {
      const { spawn } = await import("node:child_process");
      const cwd = args.cwd ?? "/home/workspace";
      const proc = spawn("bash", ["-c", args.cmd], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let errOut = "";
      const maxOut = 64 * 1024;
      proc.stdout.on("data", (c) => {
        if (out.length < maxOut) out += c.toString();
      });
      proc.stderr.on("data", (c) => {
        if (errOut.length < maxOut) errOut += c.toString();
      });
      const timeoutMs = (args.timeout ?? 0) * 1000;
      let timer: any = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
      }
      const code: number = await new Promise((res) => proc.on("close", res));
      if (timer) clearTimeout(timer);
      const result = `exit=${code}\n--- stdout ---\n${out}${out.length >= maxOut ? "\n... (truncated)" : ""}\n--- stderr ---\n${errOut}`;
      return code === 0 ? text(result) : { content: [{ type: "text" as const, text: result }], isError: true };
    } catch (e: any) {
      return err(`bash failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_run_commands",
  description:
    "Run multiple shell commands in sequence. Stops at the first non-zero exit code. " +
    "Useful for chained setup steps (e.g. install deps, build, run).",
  parameters: {
    commands: {
      type: "array",
      description: "list of shell commands to run in order",
      required: true,
      items: { type: "string" },
    },
    cwd: { type: "string", description: "working directory", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!Array.isArray(args.commands) || args.commands.length === 0) {
      return err("commands must be a non-empty array");
    }
    try {
      const { spawn } = await import("node:child_process");
      const cwd = args.cwd ?? "/home/workspace";
      const log: string[] = [];
      for (const cmd of args.commands) {
        const proc = spawn("bash", ["-c", cmd], { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let errOut = "";
        proc.stdout.on("data", (c) => (out += c.toString()));
        proc.stderr.on("data", (c) => (errOut += c.toString()));
        const code: number = await new Promise((res) => proc.on("close", res));
        log.push(`$ ${cmd}\nexit=${code}\n${out}${errOut ? `\nstderr:\n${errOut}` : ""}\n`);
        if (code !== 0) {
          return text(log.join("\n") + `\n(stopped after command exited ${code})`);
        }
      }
      return text(log.join("\n"));
    } catch (e: any) {
      return err(`run_commands failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// WEB SEARCH & RESEARCH
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "zo_web_search",
  description:
    "Search the web. Returns a list of results with titles, snippets, and URLs. " +
    "Pass topic='news' and time_range='day' for current events. " +
    "Use include_domains to scope to a specific site (e.g. ['arxiv.org']).",
  parameters: {
    query: { type: "string", description: "the search query", required: true },
    time_range: {
      type: "string",
      enum: ["anytime", "day", "week", "month", "year"],
      description: "how recent the results should be",
      required: false,
    },
    topic: {
      type: "string",
      enum: ["general", "news"],
      description: "search category",
      required: false,
    },
    include_domains: {
      type: "array",
      description: "limit results to these domains",
      required: false,
      items: { type: "string" },
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    const body: any = { query: args.query };
    if (args.time_range) body.time_range = args.time_range;
    if (args.topic) body.topic = args.topic;
    if (Array.isArray(args.include_domains)) body.include_domains = args.include_domains;
    const res = await zoFetch(ctx, "/search", body);
    if (!res.ok) return err(`web_search failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const results = res.data?.results ?? [];
    if (!results.length) return text("(no results)");
    const formatted = results
      .map((r: any, i: number) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet ?? ""}`)
      .join("\n\n");
    return text(formatted);
  },
});

toolRegistry.register({
  name: "zo_web_research",
  description:
    "Deeper, multi-source research. Use when web_search is too shallow — for company " +
    "profiles, research papers, GitHub repos, people, or financial reports.",
  parameters: {
    query: { type: "string", description: "research question or topic", required: true },
    category: {
      type: "string",
      enum: ["company", "research paper", "pdf", "github", "tweet", "personal site", "linkedin", "financial report", "people"],
      description: "filter by source type",
      required: false,
    },
    include_domains: { type: "array", description: "limit to these domains", required: false, items: { type: "string" } },
    include_text: { type: "array", description: "require these terms in results", required: false, items: { type: "string" } },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    const body: any = { query: args.query };
    if (args.category) body.category = args.category;
    if (Array.isArray(args.include_domains)) body.include_domains = args.include_domains;
    if (Array.isArray(args.include_text)) body.include_text = args.include_text;
    const res = await zoFetch(ctx, "/research", body);
    if (!res.ok) return err(`web_research failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const data = res.data;
    const parts: string[] = [];
    if (data?.answer) parts.push(`## Answer\n\n${data.answer}`);
    if (Array.isArray(data?.sources) && data.sources.length) {
      parts.push(`## Sources\n\n${data.sources.map((s: any, i: number) => `${i + 1}. [${s.title ?? s.url}](${s.url})${s.snippet ? ` — ${s.snippet}` : ""}`).join("\n")}`);
    }
    return text(parts.join("\n\n") || JSON.stringify(data, null, 2));
  },
});

toolRegistry.register({
  name: "zo_x_search",
  description:
    "Search X / Twitter. Use this for breaking news, live updates, sentiment, or community discourse. " +
    "Set allowed_x_handles to scope to specific accounts.",
  parameters: {
    query: { type: "string", description: "the search query", required: true },
    allowed_x_handles: { type: "array", description: "limit to these X handles (without @)", required: false, items: { type: "string" } },
    time_range: { type: "string", enum: ["anytime", "day", "week", "month", "year"], required: false },
    from_date: { type: "string", description: "ISO date lower bound (e.g. 2026-01-01)", required: false },
    to_date: { type: "string", description: "ISO date upper bound", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    const body: any = { query: args.query };
    if (Array.isArray(args.allowed_x_handles)) body.allowed_x_handles = args.allowed_x_handles;
    if (args.time_range) body.time_range = args.time_range;
    if (args.from_date) body.from_date = args.from_date;
    if (args.to_date) body.to_date = args.to_date;
    const res = await zoFetch(ctx, "/x/search", body);
    if (!res.ok) return err(`x_search failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const posts = res.data?.posts ?? [];
    if (!posts.length) return text("(no posts)");
    const formatted = posts
      .map((p: any) => `@${p.handle}: ${p.text}\n  ${p.url ?? ""}`)
      .join("\n\n");
    return text(formatted);
  },
});

toolRegistry.register({
  name: "zo_maps_search",
  description:
    "Search Google Maps for places. Use for restaurants, stores, in-person services. " +
    "Returns name, address, rating, hours, and price level.",
  parameters: {
    query: { type: "string", description: "the search query (e.g. 'best ramen near Shibuya')", required: true },
    location: { type: "string", description: "location bias (e.g. 'Tokyo, Japan')", required: false },
    open_now: { type: "boolean", description: "only return places currently open", required: false },
    min_rating: { type: "number", description: "minimum star rating", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    const body: any = { query: args.query };
    if (args.location) body.location = args.location;
    if (typeof args.open_now === "boolean") body.open_now = args.open_now;
    if (typeof args.min_rating === "number") body.min_rating = args.min_rating;
    const res = await zoFetch(ctx, "/maps/search", body);
    if (!res.ok) return err(`maps_search failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const places = res.data?.places ?? [];
    if (!places.length) return text("(no results)");
    const formatted = places
      .map((p: any, i: number) => `${i + 1}. **${p.name}**${p.rating ? ` ⭐${p.rating}` : ""}\n   ${p.address ?? ""}\n   ${p.hours ?? ""}${p.price ? ` · ${p.price}` : ""}`)
      .join("\n\n");
    return text(formatted);
  },
});

toolRegistry.register({
  name: "zo_image_search",
  description: "Search for images on the web. Returns URLs to matching images.",
  parameters: {
    query: { type: "string", description: "the image search query", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    const res = await zoFetch(ctx, "/images/search", { query: args.query });
    if (!res.ok) return err(`image_search failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const images = res.data?.images ?? [];
    if (!images.length) return text("(no images)");
    return text(images.map((img: any) => `- ${img.url}${img.title ? ` — ${img.title}` : ""}`).join("\n"));
  },
});

toolRegistry.register({
  name: "zo_find_similar_links",
  description: "Given a URL, find similar or related pages. Good for competitor analysis.",
  parameters: {
    url: { type: "string", description: "the URL to find similar pages for", required: true },
    include_domains: { type: "array", description: "limit to these domains", required: false, items: { type: "string" } },
    exclude_source_domain: { type: "boolean", description: "exclude the source domain", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url) return err("url is required");
    const body: any = { url: args.url };
    if (Array.isArray(args.include_domains)) body.include_domains = args.include_domains;
    if (typeof args.exclude_source_domain === "boolean") body.exclude_source_domain = args.exclude_source_domain;
    const res = await zoFetch(ctx, "/links/similar", body);
    if (!res.ok) return err(`find_similar_links failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const links = res.data?.links ?? [];
    if (!links.length) return text("(no similar links)");
    return text(links.map((l: any) => `- ${l.url}${l.title ? ` — ${l.title}` : ""}`).join("\n"));
  },
});

// ---------------------------------------------------------------------------
// WEB PAGES & BROWSING
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "zo_read_webpage",
  description:
    "Fetch a URL and return its main content as clean text or markdown. Faster than browser_navigate " +
    "for static pages. Set use_browser='true' for dynamic / JavaScript-heavy sites.",
  parameters: {
    url: { type: "string", description: "the URL to read", required: true },
    use_browser: { type: "string", enum: ["true", "false"], description: "force browser rendering", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url) return err("url is required");
    const res = await zoFetch(ctx, "/webpage/read", {
      url: args.url,
      use_browser: args.use_browser === "true",
    });
    if (!res.ok) return err(`read_webpage failed: ${res.text?.slice(0, 500) ?? res.status}`);
    return text(res.data?.content ?? res.text ?? "");
  },
});

toolRegistry.register({
  name: "zo_save_webpage",
  description:
    "Save a webpage (or YouTube video) to the user's Articles folder. Use this when the user " +
    "wants to keep a copy of something for later.",
  parameters: {
    url: { type: "string", description: "the URL to save", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url) return err("url is required");
    const res = await zoFetch(ctx, "/webpage/save", { url: args.url });
    if (!res.ok) return err(`save_webpage failed: ${res.text?.slice(0, 500) ?? res.status}`);
    return text(`Saved: ${args.url}\n${res.data?.path ?? ""}`);
  },
});

// ---------------------------------------------------------------------------
// MEDIA GENERATION
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "zo_generate_image",
  description:
    "Generate an image from a text prompt. Use for creative illustrations, mockups, " +
    "or scenes that don't exist. Pass a detailed prompt describing the subject, style, lighting, and composition.",
  parameters: {
    prompt: { type: "string", description: "detailed description of the image", required: true },
    file_stem: { type: "string", description: "filename without extension (saved to /home/workspace/Images)", required: true },
    aspect_ratio: {
      type: "string",
      enum: ["1:1", "16:9", "4:3", "3:2", "9:16", "3:4", "2:3", "21:9", "4:1", "8:1", "1:4", "1:8", "5:4", "4:5"],
      description: "image aspect ratio",
      required: false,
    },
    provider: { type: "string", enum: ["openai", "google"], required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.prompt) return err("prompt is required");
    if (!args.file_stem) return err("file_stem is required");
    const body: any = { prompt: args.prompt, file_stem: args.file_stem };
    if (args.aspect_ratio) body.aspect_ratio = args.aspect_ratio;
    if (args.provider) body.provider = args.provider;
    const res = await zoFetch(ctx, "/image/generate", body);
    if (!res.ok) return err(`generate_image failed: ${res.text?.slice(0, 500) ?? res.status}`);
    const path = res.data?.path ?? `/home/workspace/Images/${args.file_stem}.png`;
    return text(`Generated: ${path}\n${JSON.stringify(res.data, null, 2)}`);
  },
});

toolRegistry.register({
  name: "zo_edit_image",
  description:
    "Edit an existing image. Up to 3 source images can be provided for blending. " +
    "Use this for inpainting, style transfer, or adding/removing elements.",
  parameters: {
    prompt: { type: "string", description: "description of the edit", required: true },
    filepaths: { type: "array", description: "absolute paths to 1-3 source images", required: true, items: { type: "string" } },
    file_suffix: { type: "string", description: "suffix for the output file (default _edited)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.prompt) return err("prompt is required");
    if (!Array.isArray(args.filepaths) || args.filepaths.length === 0) return err("filepaths required");
    const res = await zoFetch(ctx, "/image/edit", {
      prompt: args.prompt,
      filepaths: args.filepaths,
      file_suffix: args.file_suffix,
    });
    if (!res.ok) return err(`edit_image failed: ${res.text?.slice(0, 500) ?? res.status}`);
    return text(`Edited: ${JSON.stringify(res.data, null, 2)}`);
  },
});

toolRegistry.register({
  name: "zo_generate_video",
  description:
    "Generate a short video clip from a text instruction. Takes a reference image as the " +
    "starting frame. Useful for b-roll, demos, or visualizing a concept.",
  parameters: {
    instruction: { type: "string", description: "what the video should show", required: true },
    filepath: { type: "string", description: "absolute path to a source image for the first frame", required: true },
    orientation: { type: "string", enum: ["landscape", "portrait"], required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.instruction) return err("instruction is required");
    if (!args.filepath) return err("filepath is required");
    const res = await zoFetch(ctx, "/video/generate", {
      instruction: args.instruction,
      filepath: args.filepath,
      orientation: args.orientation,
    });
    if (!res.ok) return err(`generate_video failed: ${res.text?.slice(0, 500) ?? res.status}`);
    return text(`Generated: ${JSON.stringify(res.data, null, 2)}`);
  },
});

toolRegistry.register({
  name: "zo_generate_d2_diagram",
  description:
    "Generate a D2 (declarative diagramming) diagram from code. Pass raw D2 syntax only — " +
    "no markdown. Outputs a .d2 file and a .png in /home/workspace/Images.",
  parameters: {
    code: { type: "string", description: "raw D2 diagram code (no markdown)", required: true },
    file_stem: { type: "string", description: "filename without extension", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.code) return err("code is required");
    if (!args.file_stem) return err("file_stem is required");
    const res = await zoFetch(ctx, "/diagram/d2", { code: args.code, file_stem: args.file_stem });
    if (!res.ok) return err(`generate_d2_diagram failed: ${res.text?.slice(0, 500) ?? res.status}`);
    return text(`Diagram: ${JSON.stringify(res.data, null, 2)}`);
  },
});

// ---------------------------------------------------------------------------
// TRANSCRIPTION
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "zo_transcribe_audio",
  description: "Transcribe an audio file to text with speaker segments. Use only when the user explicitly asks for a transcription.",
  parameters: {
    audio_file_path: { type: "string", description: "absolute path to the audio file", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.audio_file_path) return err("audio_file_path is required");
    try {
      const abs = resolveForSandbox(ctx, args.audio_file_path);
      const content = readFileSync(abs);
      const b64 = content.toString("base64");
      const res = await zoFetch(ctx, "/transcribe/audio", { file: b64, filename: abs.split("/").pop() });
      if (!res.ok) return err(`transcribe_audio failed: ${res.text?.slice(0, 500) ?? res.status}`);
      return text(res.data?.text ?? JSON.stringify(res.data, null, 2));
    } catch (e: any) {
      return err(`transcribe_audio failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "zo_transcribe_video",
  description: "Transcribe the audio track of a video file. Use only when the user explicitly asks for a transcription.",
  parameters: {
    video_file_path: { type: "string", description: "absolute path to the video file", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.video_file_path) return err("video_file_path is required");
    try {
      const abs = resolveForSandbox(ctx, args.video_file_path);
      const content = readFileSync(abs);
      const b64 = content.toString("base64");
      const res = await zoFetch(ctx, "/transcribe/video", { file: b64, filename: abs.split("/").pop() });
      if (!res.ok) return err(`transcribe_video failed: ${res.text?.slice(0, 500) ?? res.status}`);
      return text(res.data?.text ?? JSON.stringify(res.data, null, 2));
    } catch (e: any) {
      return err(`transcribe_video failed: ${e?.message ?? String(e)}`);
    }
  },
});
