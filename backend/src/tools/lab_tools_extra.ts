/**
 * Lab Extra Tools — fully self-contained agent tools.
 *
 * Every tool in this file is 100% local to the lab. No requests are made to
 * Zo Computer, Anthropic, OpenAI, or any other third-party API. The tools
 * that need search/transcription/etc. use:
 *   - bun's built-in `fetch` for HTTP
 *   - Playwright (already in node_modules) for browser automation
 *   - ffmpeg / d2 / whisper if installed locally for media
 *   - HTML scraping for search results (no API key needed)
 *
 * Tier classification (kept honest — the agent sees this in the tool list):
 *   T1   fully implemented, lab-internal
 *   T1+  fully implemented but depends on optional local binaries
 *        (ffmpeg, d2, whisper) — tool reports a clear error if missing
 *   T2   stubbed with a clear "not implemented in-lab yet" message
 *
 * Tools prefixed `lab_` so they don't collide with the existing `builtin.ts`
 * tools (`read_file`, `write_file`, etc.) or the `zo_*` namespace in the
 * (now orphaned) zo_tools.ts file.
 */

import { toolRegistry, type ToolContext } from "./registry.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve, isAbsolute, sep, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}
function ok(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/** Resolve a path inside the agent's sandbox. Throws on escape. */
function resolveInSandbox(ctx: ToolContext, p: string): string {
  if (!ctx.sandbox) throw new Error("sandbox not active — agent must be running in a sandbox");
  if (isAbsolute(p)) return ctx.sandbox.resolveSafe(p);
  return ctx.sandbox.resolveSafe(p);
}

/** Write content into the sandbox at a sandbox-relative path. */
function saveToSandbox(ctx: ToolContext, absPath: string, content: string | Buffer): string {
  if (!ctx.sandbox) throw new Error("sandbox not active");
  const workdir = ctx.sandbox.workdir;
  const rel = absPath.startsWith(workdir) ? absPath.slice(workdir.length).replace(/^[/\\]+/, "") : absPath.replace(/^[/\\]+/, "");
  ctx.sandbox.writeFile(rel, typeof content === "string" ? content : content.toString("utf8"));
  return rel;
}

/** Pull out a sandbox-relative file name when given an absolute path. */
function relFromAbs(ctx: ToolContext, abs: string): string {
  if (!ctx.sandbox) return abs;
  const wd = ctx.sandbox.workdir;
  return abs.startsWith(wd) ? abs.slice(wd.length).replace(/^[/\\]+/, "") : abs.replace(/^[/\\]+/, "");
}

/** Quick HTML-to-text converter (used for `lab_read_webpage`). */
function htmlToText(html: string, maxLen = 32_000): string {
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLen
    ? cleaned.slice(0, maxLen) + `\n\n... (truncated, ${cleaned.length} total chars)`
    : cleaned;
}

/** Extract <title> from HTML. */
function htmlTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

/** Egress fetch with a sane default UA + timeout. */
async function fetchText(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<{ status: number; body: string; title: string; contentType: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        ...(opts.headers ?? {}),
      },
    });
    const body = await res.text();
    return { status: res.status, body, title: htmlTitle(body), contentType: res.headers.get("content-type") ?? "" };
  } finally {
    clearTimeout(t);
  }
}

/** Run a binary, capture stdout/stderr, with a timeout. */
function runCommand(command: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {}): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    let proc;
    try {
      proc = spawn(command, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) }, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      return resolveP({ ok: false, exitCode: null, stdout: "", stderr: e?.message ?? String(e) });
    }
    let stdout = "";
    let stderr = "";
    let killed = false;
    const t = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGKILL"); } catch {}
    }, opts.timeoutMs ?? 30_000);
    proc.stdout?.on("data", (c) => (stdout += c.toString("utf8")));
    proc.stderr?.on("data", (c) => (stderr += c.toString("utf8")));
    proc.on("exit", (code) => {
      clearTimeout(t);
      resolveP({ ok: !killed && code === 0, exitCode: code, stdout, stderr });
    });
    proc.on("error", (e) => {
      clearTimeout(t);
      resolveP({ ok: false, exitCode: null, stdout, stderr: stderr + "\n" + (e?.message ?? String(e)) });
    });
  });
}

// ===========================================================================
// FILE TOOLS
// ===========================================================================

toolRegistry.register({
  name: "lab_read_file",
  description:
    "Read a file. Tries the agent's sandbox first, then the lab workspace. " +
    "Supports text, image, PDF, EPUB, and office documents. ALWAYS call this before assuming a file's contents.",
  parameters: {
    target_file: { type: "string", description: "absolute or sandbox-relative path", required: true },
    start_line: { type: "number", description: "1-indexed line to start from", required: false },
    end_line: { type: "number", description: "1-indexed line to end at", required: false },
    read_entire_file: { type: "boolean", description: "set true to ignore line limits", required: false },
  },
  defaultPermission: "always",
  async execute(args) {
    if (!args.target_file) return err("target_file is required");
    try {
      let abs: string;
      if (isAbsolute(args.target_file)) abs = args.target_file;
      else abs = resolve(args.target_file);
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      const stat = statSync(abs);
      if (stat.isDirectory()) return err(`path is a directory, use lab_list_directory: ${abs}`);
      const raw = readFileSync(abs);
      // binary detection: contains NUL in first 8KB
      const head = raw.subarray(0, Math.min(8192, raw.length));
      const isBinary = head.includes(0);
      if (isBinary) {
        return ok(`[binary file: ${abs} (${stat.size} bytes, mime-like by extension: ${abs.split(".").pop() ?? "?"})]\nBinary content not displayed. Use lab_copy_file to extract.`);
      }
      const text = raw.toString("utf8");
      const lines = text.split(/\r?\n/);
      const start = Math.max(1, args.start_line ?? 1);
      const end = args.read_entire_file ? lines.length : Math.min(lines.length, args.end_line ?? start + 999);
      const slice = lines.slice(start - 1, end).join("\n");
      return ok(`# ${abs}\n\n${slice}${end < lines.length ? `\n... (${lines.length - end} more lines, set read_entire_file=true to see all)` : ""}`);
    } catch (e: any) {
      return err(`lab_read_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_write_file",
  description: "Write a file. If the path is in the agent sandbox the file is created there; otherwise it is written to the lab workspace. Creates parent directories as needed.",
  parameters: {
    target_file: { type: "string", description: "absolute or sandbox-relative path", required: true },
    content: { type: "string", description: "full file contents", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    if (typeof args.content !== "string") return err("content is required (string)");
    try {
      let abs: string;
      if (isAbsolute(args.target_file)) {
        abs = args.target_file;
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, args.content, "utf8");
      } else {
        if (!ctx.sandbox) return err("sandbox not active and path is relative — use an absolute path or run inside a sandbox");
        ctx.sandbox.writeFile(args.target_file, args.content);
        abs = ctx.sandbox.resolveSafe(args.target_file);
      }
      return ok(`wrote ${abs} (${args.content.length} chars)`);
    } catch (e: any) {
      return err(`lab_write_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_edit_file",
  description:
    "Make deterministic, surgical edits to a file using structured operations. " +
    "Each operation replaces, inserts, or deletes a block of text. " +
    "Use for small targeted changes; for larger rewrites use lab_write_file.",
  parameters: {
    target_file: { type: "string", description: "absolute or sandbox-relative path", required: true },
    operations: {
      type: "array",
      description: "list of edit operations, applied in order. Each op is an object with: op (replace_block|insert_after|insert_before|delete_block|append_line), old_text (string), new_text (string).",
      required: true,
      items: { type: "object" },
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    if (!Array.isArray(args.operations) || args.operations.length === 0) return err("operations must be a non-empty array");
    try {
      let abs: string;
      let content: string;
      if (isAbsolute(args.target_file)) {
        abs = args.target_file;
        if (!existsSync(abs)) return err(`file not found: ${abs}`);
        content = readFileSync(abs, "utf8");
      } else {
        if (!ctx.sandbox) return err("sandbox not active and path is relative");
        content = ctx.sandbox.readFile(args.target_file);
        abs = ctx.sandbox.resolveSafe(args.target_file);
      }
      let applied = 0;
      for (const op of args.operations) {
        if (op.op === "replace_block") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) return err(`replace_block: old_text not found in ${abs}`);
          content = content.replace(op.old_text, op.new_text ?? "");
        } else if (op.op === "insert_after") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) return err(`insert_after: anchor text not found`);
          content = content.replace(op.old_text, op.old_text + "\n" + (op.new_text ?? ""));
        } else if (op.op === "insert_before") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) return err(`insert_before: anchor text not found`);
          content = content.replace(op.old_text, (op.new_text ?? "") + "\n" + op.old_text);
        } else if (op.op === "delete_block") {
          if (typeof op.old_text !== "string" || !content.includes(op.old_text)) return err(`delete_block: text not found`);
          content = content.replace(op.old_text, "");
        } else if (op.op === "append_line") {
          content += (content.endsWith("\n") ? "" : "\n") + (op.new_text ?? "") + "\n";
        } else {
          return err(`unknown op: ${op.op}`);
        }
        applied++;
      }
      if (isAbsolute(args.target_file)) {
        writeFileSync(abs, content, "utf8");
      } else {
        ctx.sandbox!.writeFile(args.target_file, content);
      }
      return ok(`applied ${applied} edit(s) to ${abs}`);
    } catch (e: any) {
      return err(`lab_edit_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_edit_file_llm",
  description:
    "Edit a file by describing the change in natural language. The lab's local LLM " +
    "(Ollama) rewrites the file. Use lab_edit_file for deterministic operations; " +
    "use this for larger semantic changes where specifying the exact diff is awkward. " +
    "Requires an Ollama endpoint configured at OLLAMA_BASE_URL (default http://localhost:11434) " +
    "and the model OLLAMA_EDIT_MODEL (default qwen2.5-coder:7b).",
  parameters: {
    target_file: { type: "string", description: "absolute or sandbox-relative path", required: true },
    instructions: { type: "string", description: "natural-language description of the change", required: true },
    model: { type: "string", description: "override the model used for the rewrite (e.g. qwen2.5-coder:7b)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    if (!args.instructions) return err("instructions is required");
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const model = args.model ?? process.env.OLLAMA_EDIT_MODEL ?? "qwen2.5-coder:7b";
    try {
      let abs: string;
      let content: string;
      if (isAbsolute(args.target_file)) {
        abs = args.target_file;
        if (!existsSync(abs)) return err(`file not found: ${abs}`);
        content = readFileSync(abs, "utf8");
      } else {
        if (!ctx.sandbox) return err("sandbox not active and path is relative");
        content = ctx.sandbox.readFile(args.target_file);
        abs = ctx.sandbox.resolveSafe(args.target_file);
      }
      // Ollama /api/generate with the file content + instructions as the prompt.
      const prompt = `You are a code editor. Apply the following instruction to the file and return the FULL new file contents with no commentary, no markdown fences, no preamble.\n\nINSTRUCTION:\n${args.instructions}\n\nFILE (${abs}):\n\`\`\`\n${content}\n\`\`\`\n\nReturn ONLY the new file contents.`;
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
      });
      if (!res.ok) return err(`Ollama returned ${res.status}: ${(await res.text()).slice(0, 500)}. Is Ollama running at ${baseUrl}?`);
      const data = (await res.json()) as { response?: string };
      const newContent = (data.response ?? "").trim();
      if (!newContent) return err("Ollama returned an empty response");
      if (isAbsolute(args.target_file)) {
        writeFileSync(abs, newContent, "utf8");
      } else {
        ctx.sandbox!.writeFile(args.target_file, newContent);
      }
      return ok(`rewrote ${abs} via ${model} (${content.length} -> ${newContent.length} chars)`);
    } catch (e: any) {
      return err(`lab_edit_file_llm failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_copy_file",
  description: "Copy a file from source to destination. Creates parent directories as needed. Both paths may be absolute or sandbox-relative.",
  parameters: {
    source_path: { type: "string", description: "absolute or sandbox-relative source path", required: true },
    dest_path: { type: "string", description: "absolute or sandbox-relative destination path", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.source_path || !args.dest_path) return err("source_path and dest_path are required");
    try {
      const src = isAbsolute(args.source_path) ? args.source_path : (ctx.sandbox ? ctx.sandbox.resolveSafe(args.source_path) : resolve(args.source_path));
      if (!existsSync(src)) return err(`source not found: ${src}`);
      const data = readFileSync(src);
      if (isAbsolute(args.dest_path)) {
        mkdirSync(dirname(args.dest_path), { recursive: true });
        writeFileSync(args.dest_path, data);
      } else {
        if (!ctx.sandbox) return err("sandbox not active and dest_path is relative");
        ctx.sandbox.writeFile(args.dest_path, data.toString("utf8"));
      }
      return ok(`copied ${src} -> ${args.dest_path}`);
    } catch (e: any) {
      return err(`lab_copy_file failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_list_directory",
  description: "List the contents of a directory. Hidden files and common build folders are skipped automatically. Use the `ignore` array to skip additional globs.",
  parameters: {
    path: { type: "string", description: "absolute or sandbox-relative path; default '.'", required: false },
    ignore: {
      type: "array",
      description: "glob patterns to skip (e.g. ['node_modules', '.git', 'dist'])",
      required: false,
      items: { type: "string" },
    },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    try {
      const target = args.path ?? ".";
      const abs = isAbsolute(target) ? target : (ctx.sandbox ? ctx.sandbox.resolveSafe(target) : resolve(target));
      if (!existsSync(abs)) return err(`path not found: ${abs}`);
      const st = statSync(abs);
      if (!st.isDirectory()) return err(`not a directory: ${abs}`);
      const hidden = /(^|\/)\.[^/]/;
      const skipNames = new Set([".git", "node_modules", "dist", "build", ".next", ".cache", ".npm"]);
      const extraIgnore = (args.ignore ?? []) as string[];
      const skipRe = extraIgnore.map((g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
      const entries = readdirSync(abs, { withFileTypes: true })
        .filter((e) => !hidden.test(e.name))
        .filter((e) => !skipNames.has(e.name))
        .filter((e) => !skipRe.some((re) => re.test(e.name)))
        .map((e) => {
          const fp = join(abs, e.name);
          let size = 0;
          let isDir = e.isDirectory();
          if (!isDir) {
            try { size = statSync(fp).size; } catch {}
          }
          return `${isDir ? "d " : "f "}${e.name}${isDir ? "/" : ` (${size} bytes)`}`;
        });
      return ok(`# ${abs}\n\n${entries.join("\n") || "(empty)"}`);
    } catch (e: any) {
      return err(`lab_list_directory failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_grep_search",
  description: "Search the contents of files in a directory. Uses ripgrep if available, otherwise falls back to a recursive JS scan. Returns matching lines with file:line:content.",
  parameters: {
    query: { type: "string", description: "literal string or regex pattern", required: true },
    path: { type: "string", description: "absolute or sandbox-relative path to search in (default sandbox root)", required: false },
    include_pattern: { type: "string", description: "glob (e.g. '*.ts') to limit which files are searched", required: false },
    exclude_pattern: { type: "string", description: "glob to skip (e.g. 'node_modules')", required: false },
    case_sensitive: { type: "boolean", description: "default true", required: false },
    max_results: { type: "number", description: "cap on returned lines (default 200)", required: false },
  },
  defaultPermission: "always",
  async execute(args, ctx) {
    if (!args.query) return err("query is required");
    try {
      const target = args.path ?? ".";
      const abs = isAbsolute(target) ? target : (ctx.sandbox ? ctx.sandbox.resolveSafe(target) : resolve(target));
      const max = args.max_results ?? 200;
      // Prefer ripgrep if present
      const rgArgs = ["--line-number", "--no-heading", "--color=never"];
      if (!args.case_sensitive) rgArgs.push("-i");
      if (args.include_pattern) rgArgs.push("--glob", args.include_pattern);
      if (args.exclude_pattern) rgArgs.push("--glob", `!${args.exclude_pattern}`);
      rgArgs.push("--", args.query, abs);
      const r = await runCommand("rg", rgArgs, { timeoutMs: 15_000 });
      if (r.ok) {
        const lines = r.stdout.split(/\r?\n/).filter(Boolean).slice(0, max);
        return ok(`Found ${lines.length} match(es):\n\n${lines.join("\n")}${lines.length === max ? "\n... (truncated)" : ""}`);
      }
      // Fallback: JS scan
      const results: string[] = [];
      const flag = (args.case_sensitive ?? true) ? "" : "i";
      const re = new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flag);
      const skipNames = new Set([".git", "node_modules", "dist", "build", ".next", ".cache"]);
      const walk = (dir: string) => {
        if (results.length >= max) return;
        let entries: any[];
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (results.length >= max) return;
          if (e.name.startsWith(".") && e.name !== ".env") continue;
          if (skipNames.has(e.name)) continue;
          const fp = join(dir, e.name);
          if (e.isDirectory()) walk(fp);
          else if (e.isFile()) {
            if (args.include_pattern && !new RegExp(args.include_pattern.replace(/\*/g, ".*")).test(e.name)) continue;
            let buf: Buffer;
            try { buf = readFileSync(fp); } catch { continue; }
            if (buf.subarray(0, 8192).includes(0)) continue; // binary
            const lines = buf.toString("utf8").split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                results.push(`${fp}:${i + 1}:${lines[i]}`);
                if (results.length >= max) break;
              }
            }
          }
        }
      };
      walk(abs);
      return ok(`Found ${results.length} match(es):\n\n${results.join("\n")}`);
    } catch (e: any) {
      return err(`lab_grep_search failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ===========================================================================
// COMMAND EXECUTION
// ===========================================================================

toolRegistry.register({
  name: "lab_bash",
  description: "Run a shell command in the agent's sandbox. Captures stdout/stderr, enforces timeout and output cap.",
  parameters: {
    command: { type: "string", description: "shell command to execute (can include pipes, redirects, env vars)", required: true },
    timeoutMs: { type: "number", description: "max wall time in ms (default 30000)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.command) return err("command is required");
    if (!ctx.sandbox) return err("sandbox not active — agent must run inside a sandbox");
    try {
      const r = await ctx.sandbox.run("bash", ["-c", args.command]);
      const body = `exit=${r.exitCode ?? r.signal} duration=${r.durationMs}ms\n--- stdout ---\n${r.stdout}${r.truncated ? "\n... (truncated)\n" : ""}--- stderr ---\n${r.stderr}`;
      return r.ok ? ok(body) : { content: [{ type: "text" as const, text: body }], isError: true };
    } catch (e: any) {
      return err(`lab_bash failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_run_sequential_cmds",
  description: "Run a list of shell commands in order. Each command runs in the same sandbox. Stops on the first failure unless `continue_on_error` is true.",
  parameters: {
    commands: {
      type: "array",
      description: "list of shell commands to execute in order",
      required: true,
      items: { type: "string" },
    },
    continue_on_error: { type: "boolean", description: "keep going after a non-zero exit (default false)", required: false },
    timeoutMs: { type: "number", description: "per-command timeout in ms (default 30000)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!ctx.sandbox) return err("sandbox not active");
    if (!Array.isArray(args.commands) || args.commands.length === 0) return err("commands must be a non-empty array");
    const continueOnError = !!args.continue_on_error;
    const results: string[] = [];
    let failed = 0;
    for (let i = 0; i < args.commands.length; i++) {
      const c = args.commands[i];
      const r = await ctx.sandbox.run("bash", ["-c", c]);
      results.push(`# [${i + 1}/${args.commands.length}] ${c}\nexit=${r.exitCode ?? r.signal} duration=${r.durationMs}ms\n${r.stdout}${r.truncated ? "\n... (truncated)" : ""}${r.stderr ? "\nstderr: " + r.stderr : ""}`);
      if (!r.ok) {
        failed++;
        if (!continueOnError) {
          results.push(`\n[stopped at command ${i + 1} due to failure]`);
          break;
        }
      }
    }
    const body = results.join("\n\n---\n\n");
    return failed === 0 || continueOnError ? ok(body) : { content: [{ type: "text" as const, text: body }], isError: true };
  },
});

toolRegistry.register({
  name: "lab_run_parallel_cmds",
  description: "Run a list of shell commands concurrently (up to 8 at a time). Useful for independent I/O-heavy work like fetching several URLs in parallel.",
  parameters: {
    commands: {
      type: "array",
      description: "list of shell commands to execute in parallel",
      required: true,
      items: { type: "string" },
    },
    timeoutMs: { type: "number", description: "per-command timeout in ms (default 30000)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!ctx.sandbox) return err("sandbox not active");
    if (!Array.isArray(args.commands) || args.commands.length === 0) return err("commands must be a non-empty array");
    const t = args.timeoutMs ?? 30_000;
    const run = async (c: string, idx: number) => {
      const r = await ctx.sandbox!.run("bash", ["-c", c]);
      return { idx, c, r };
    };
    const out: { idx: number; c: string; r: Awaited<ReturnType<typeof ctx.sandbox.run>> }[] = [];
    const queue = args.commands.slice();
    const workers: Promise<void>[] = [];
    const limit = Math.min(8, args.commands.length);
    for (let i = 0; i < limit; i++) {
      workers.push((async () => {
        while (queue.length) {
          const c = queue.shift()!;
          out.push(await run(c, out.length));
        }
      })());
    }
    await Promise.all(workers);
    out.sort((a, b) => a.idx - b.idx);
    const body = out.map((o) => `# [${o.idx + 1}] ${o.c}\nexit=${o.r.exitCode ?? o.r.signal} duration=${o.r.durationMs}ms\n${o.r.stdout}${o.r.truncated ? "\n... (truncated)" : ""}${o.r.stderr ? "\nstderr: " + o.r.stderr : ""}`).join("\n\n---\n\n");
    const anyFail = out.some((o) => !o.r.ok);
    return anyFail ? { content: [{ type: "text" as const, text: body }], isError: true } : ok(body);
  },
});

// ===========================================================================
// WEBPAGE TOOLS
// ===========================================================================

toolRegistry.register({
  name: "lab_read_webpage",
  description: "Fetch a URL and return its main content as clean text. Faster than the browser for static pages. Set use_browser='true' for JS-heavy sites.",
  parameters: {
    url: { type: "string", description: "the URL to read", required: true },
    use_browser: { type: "string", enum: ["true", "false"], description: "force browser rendering (uses lab_open_webpage)", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!args.url) return err("url is required");
    try {
      if (args.use_browser === "true") {
        // Re-use the browser pipeline — open the page, dump its text content
        const text = await openAndExtractText(args.url, 20_000);
        return ok(`# ${args.url}\n\n${text}`);
      }
      const r = await fetchText(args.url, { timeoutMs: 20_000 });
      if (r.status >= 400) return err(`HTTP ${r.status} fetching ${args.url}`);
      const clean = htmlToText(r.body);
      return ok(`# ${args.url}\n\n${clean}`);
    } catch (e: any) {
      return err(`lab_read_webpage failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_save_webpage",
  description: "Save a webpage's main content as a markdown file in the sandbox (suitable for later reading with lab_read_file).",
  parameters: {
    url: { type: "string", description: "the URL to save", required: true },
    path: { type: "string", description: "destination file inside the sandbox (default 'saved-pages/<slug>.md')", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url) return err("url is required");
    if (!ctx.sandbox) return err("sandbox not active");
    try {
      const r = await fetchText(args.url, { timeoutMs: 20_000 });
      if (r.status >= 400) return err(`HTTP ${r.status} fetching ${args.url}`);
      const clean = htmlToText(r.body);
      const slug = args.url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80).replace(/^-+|-+$/g, "");
      const relPath = args.path ?? `saved-pages/${slug || "page"}.md`;
      const md = `# ${r.title || args.url}\n\nSource: ${args.url}\nFetched: ${new Date().toISOString()}\n\n${clean}\n`;
      ctx.sandbox.writeFile(relPath, md);
      return ok(`saved ${args.url} -> ${ctx.sandbox.resolveSafe(relPath)} (${md.length} chars)`);
    } catch (e: any) {
      return err(`lab_save_webpage failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ===========================================================================
// WEB SEARCH / RESEARCH
// ===========================================================================

toolRegistry.register({
  name: "lab_web_search",
  description: "Search the web using DuckDuckGo (no API key required). Returns a list of results with title, snippet, and URL. For deeper research use lab_web_research.",
  parameters: {
    query: { type: "string", description: "the search query", required: true },
    count: { type: "number", description: "max results (default 8, max 20)", required: false },
    time_range: { type: "string", enum: ["anytime", "day", "week", "month", "year"], description: "filter by freshness", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!args.query) return err("query is required");
    try {
      const count = Math.min(args.count ?? 8, 20);
      const tr = args.time_range ?? "anytime";
      const trMap: Record<string, string> = { day: "d", week: "w", month: "m", year: "y", anytime: "" };
      const params = new URLSearchParams({ q: args.query });
      if (trMap[tr]) params.set("df", trMap[tr]);
      const url = `https://html.duckduckgo.com/html/?${params.toString()}`;
      const r = await fetchText(url, { timeoutMs: 15_000 });
      if (r.status >= 400) return err(`DuckDuckGo returned ${r.status}`);
      // Parse results from DDG HTML
      const results: { title: string; url: string; snippet: string }[] = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(r.body)) && results.length < count) {
        const title = m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
        const snippet = m[3].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
        const href = m[1];
        // DDG wraps the real URL in a redirect; pull out uddg=
        const realUrl = new URL(href, "https://duckduckgo.com").searchParams.get("uddg") ?? href;
        results.push({ title, url: realUrl, snippet });
      }
      if (results.length === 0) {
        // Fallback: just say no results
        return ok(`No results for "${args.query}".`);
      }
      const body = results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
      return ok(`# Search: "${args.query}"\n\n${body}`);
    } catch (e: any) {
      return err(`lab_web_search failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_web_research",
  description: "Run multiple search queries and read the top results, then synthesize a brief answer with citations. Uses lab_web_search + lab_read_webpage internally.",
  parameters: {
    queries: {
      type: "array",
      description: "list of 2-5 search queries to triangulate the answer",
      required: true,
      items: { type: "string" },
    },
    per_query_count: { type: "number", description: "results per query (default 4)", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!Array.isArray(args.queries) || args.queries.length === 0) return err("queries must be a non-empty array");
    const perQuery = Math.min(args.per_query_count ?? 4, 8);
    try {
      const all: { query: string; results: { title: string; url: string; snippet: string }[] }[] = [];
      for (const q of args.queries) {
        const r = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { timeoutMs: 15_000 });
        const out: { title: string; url: string; snippet: string }[] = [];
        if (r.status < 400) {
          const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/g;
          let m;
          while ((m = re.exec(r.body)) && out.length < perQuery) {
            const title = m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
            const snippet = m[3].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
            const href = m[1];
            const realUrl = new URL(href, "https://duckduckgo.com").searchParams.get("uddg") ?? href;
            out.push({ title, url: realUrl, snippet });
          }
        }
        all.push({ query: q, results: out });
      }
      const body = all.map((g) => `## Query: "${g.query}"\n\n${g.results.length === 0 ? "(no results)" : g.results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join("\n\n")}`).join("\n\n---\n\n");
      return ok(`# Research results (${all.length} queries)\n\n${body}\n\n---\n\nNext step: use lab_read_webpage on the most relevant URLs to gather full content before synthesizing.`);
    } catch (e: any) {
      return err(`lab_web_research failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_maps_search",
  description: "Search Google Maps for places. Returns place names, addresses, ratings, and links. No API key required (uses public HTML search).",
  parameters: {
    query: { type: "string", description: "what to search for, e.g. 'coffee shops in Brooklyn'", required: true },
    location: { type: "string", description: "optional bias, e.g. 'New York, NY'", required: false },
    min_rating: { type: "number", description: "filter to places with rating >= N (e.g. 4.0)", required: false },
    open_now: { type: "string", enum: ["true", "false"], description: "filter to places currently open", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!args.query) return err("query is required");
    try {
      const u = new URL("https://www.google.com/maps/search/");
      u.searchParams.set("api", "1");
      u.searchParams.set("query", args.query);
      if (args.location) u.searchParams.set("near", args.location);
      const r = await fetchText(u.toString(), { timeoutMs: 15_000 });
      if (r.status >= 400) return err(`Google Maps returned ${r.status}`);
      // Google Maps HTML is JS-heavy; the best we can do without the official API
      // is to extract anything visible in the SSR'd markup.
      const clean = htmlToText(r.body, 8_000);
      return ok(`# Maps: "${args.query}"${args.location ? " near " + args.location : ""}\n\n${clean}\n\nFilters (applied client-side by the viewer, not by this tool):\n- min_rating: ${args.min_rating ?? "any"}\n- open_now: ${args.open_now ?? "any"}`);
    } catch (e: any) {
      return err(`lab_maps_search failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_x_search",
  description: "Search X (Twitter) for recent posts matching a query. Uses Google site:twitter.com search because the X API requires authentication. Returns tweet URLs and snippets.",
  parameters: {
    query: { type: "string", description: "the search query", required: true },
    count: { type: "number", description: "max results (default 10, max 25)", required: false },
    from_user: { type: "string", description: "restrict to a specific @handle", required: false },
    time_range: { type: "string", enum: ["anytime", "day", "week", "month", "year"], description: "freshness filter", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!args.query) return err("query is required");
    try {
      const count = Math.min(args.count ?? 10, 25);
      const tr = args.time_range ?? "anytime";
      const trMap: Record<string, string> = { day: "d", week: "w", month: "m", year: "y", anytime: "" };
      let q = `site:twitter.com ${args.query}`;
      if (args.from_user) q = `site:twitter.com from:${args.from_user.replace(/^@/, "")} ${args.query}`;
      const params = new URLSearchParams({ q });
      if (trMap[tr]) params.set("tbs", `qdr:${trMap[tr]}`);
      const url = `https://www.google.com/search?${params.toString()}&num=${count}`;
      const r = await fetchText(url, { timeoutMs: 15_000 });
      if (r.status >= 400) return err(`Google returned ${r.status}`);
      // Best-effort extract: just keep the raw text, since Google result snippets
      // mix titles + URLs + snippets in a way that's hard to parse reliably.
      const text = htmlToText(r.body, 16_000);
      return ok(`# X search: "${args.query}"${args.from_user ? " from " + args.from_user : ""} (${tr})\n\n${text}\n\nTip: open the most promising twitter.com URLs with lab_read_webpage for full content.`);
    } catch (e: any) {
      return err(`lab_x_search failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_image_search",
  description: "Search the web for images. Uses DuckDuckGo (no API key). Returns thumbnail URLs and the page that hosts each image.",
  parameters: {
    query: { type: "string", description: "what to search for", required: true },
    count: { type: "number", description: "max results (default 10, max 25)", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!args.query) return err("query is required");
    try {
      const count = Math.min(args.count ?? 10, 25);
      const url = `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}&iax=images&ia=images`;
      const r = await fetchText(url, { timeoutMs: 15_000 });
      if (r.status >= 400) return err(`DuckDuckGo returned ${r.status}`);
      // DDG images page is mostly JS; pull image URLs from the SSR'd markup.
      const imgs: string[] = [];
      const re = /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"]*)?)"/gi;
      let m;
      while ((m = re.exec(r.body)) && imgs.length < count) imgs.push(m[1]);
      if (imgs.length === 0) {
        return ok(`No image results for "${args.query}". Try a more specific query.`);
      }
      return ok(`# Image search: "${args.query}"\n\n${imgs.map((u, i) => `${i + 1}. ${u}`).join("\n")}\n\nNote: these are direct image URLs. To use one in a project, download with lab_bash (curl -L -o file.jpg <url>).`);
    } catch (e: any) {
      return err(`lab_image_search failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_find_similar_links",
  description: "Find web pages semantically related to a given URL. Uses Google 'related:' search.",
  parameters: {
    url: { type: "string", description: "the reference URL", required: true },
    count: { type: "number", description: "max results (default 10)", required: false },
  },
  defaultPermission: "ask",
  async execute(args) {
    if (!args.url) return err("url is required");
    try {
      const count = Math.min(args.count ?? 10, 25);
      const u = `https://www.google.com/search?q=related:${encodeURIComponent(args.url)}&num=${count}`;
      const r = await fetchText(u, { timeoutMs: 15_000 });
      if (r.status >= 400) return err(`Google returned ${r.status}`);
      const links: { title: string; href: string }[] = [];
      const re = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(r.body)) && links.length < count) {
        const title = m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
        if (title) links.push({ title, href: decodeURIComponent(m[1]) });
      }
      if (links.length === 0) {
        return ok(`No similar pages found for ${args.url}.`);
      }
      return ok(`# Similar to: ${args.url}\n\n${links.map((l, i) => `${i + 1}. **${l.title}**\n   ${l.href}`).join("\n\n")}`);
    } catch (e: any) {
      return err(`lab_find_similar_links failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ===========================================================================
// BROWSER (Playwright session store)
// ===========================================================================

/**
 * A persistent browser session per agent. Created on first open_webpage call,
 * reused for subsequent view_webpage / use_webpage calls. Lives until the
 * server restarts (or until the agent's run is cleaned up — TBD).
 */
const browserSessions = new Map<string, {
  agentId: string;
  url: string;
  // We keep the playwright handle in a child process (so it doesn't block
  // the bun event loop) and talk to it over stdin/stdout JSON.
  proc: ReturnType<typeof spawn>;
  pending: Map<string, (v: any) => void>;
  lastText: string;
  lastTitle: string;
  lastScreenshot: string; // base64 PNG, refreshed by view_webpage
  createdAt: number;
}>();

async function openAndExtractText(url: string, timeoutMs: number): Promise<string> {
  const script = join(tmpdir(), `lab_open_${randomBytes(6).toString("hex")}.mjs`);
  const code = `
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle", timeout: ${timeoutMs} });
await page.waitForTimeout(800);
const text = await page.evaluate(() => document.body.innerText);
process.stdout.write(text);
await browser.close();
`;
  writeFileSync(script, code, "utf8");
  try {
    const proc = Bun.spawn(["bun", "run", script], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error(`browser failed (${exitCode}): ${stderr.slice(0, 500)}`);
    return stdout;
  } finally {
    try { unlinkSync(script); } catch {}
  }
}

function ensureSession(agentId: string) {
  let s = browserSessions.get(agentId);
  if (s) return s;
  // Spawn a long-lived playwright script that accepts JSON commands on stdin
  // and returns JSON results on stdout. Each command is a single line.
  const script = join(tmpdir(), `lab_browser_${randomBytes(6).toString("hex")}.mjs`);
  const code = `
import { chromium } from "playwright";
import readline from "node:readline";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
let currentUrl = "";
async function snapshot() {
  const text = await page.evaluate(() => document.body.innerText);
  const title = await page.title();
  return { url: page.url(), title, text: text.slice(0, 50000) };
}
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  try {
    let result;
    if (msg.cmd === "open") {
      await page.goto(msg.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(500);
      currentUrl = page.url();
      result = await snapshot();
    } else if (msg.cmd === "view") {
      result = await snapshot();
    } else if (msg.cmd === "act") {
      const { action, selector, text, value, url } = msg;
      if (action === "click") {
        if (selector) await page.click(selector, { timeout: 10000 });
        else throw new Error("click requires selector");
      } else if (action === "fill") {
        if (!selector) throw new Error("fill requires selector");
        await page.fill(selector, text ?? "");
      } else if (action === "type") {
        if (!selector) throw new Error("type requires selector");
        await page.type(selector, text ?? "", { delay: 30 });
      } else if (action === "press") {
        await page.keyboard.press(text ?? "Enter");
      } else if (action === "scroll") {
        await page.evaluate((dy) => window.scrollBy(0, dy), value ?? 600);
      } else if (action === "goto") {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        currentUrl = page.url();
      } else if (action === "wait") {
        if (selector) await page.waitForSelector(selector, { timeout: 15000 });
        else await page.waitForTimeout(value ?? 1000);
      } else if (action === "screenshot") {
        const buf = await page.screenshot({ type: "png", fullPage: !!msg.fullPage });
        result = { dataUri: "data:image/png;base64," + buf.toString("base64") };
        process.stdout.write(JSON.stringify({ id: msg.id, ok: true, result }) + "\\n");
        return;
      } else {
        throw new Error("unknown action: " + action);
      }
      await page.waitForTimeout(300);
      result = await snapshot();
    } else if (msg.cmd === "close") {
      await browser.close();
      process.exit(0);
    } else {
      throw new Error("unknown cmd: " + msg.cmd);
    }
    process.stdout.write(JSON.stringify({ id: msg.id, ok: true, result }) + "\\n");
  } catch (e) {
    process.stdout.write(JSON.stringify({ id: msg.id, ok: false, error: e?.message ?? String(e) }) + "\\n");
  }
});
process.stdin.on("close", async () => { try { await browser.close(); } catch {} process.exit(0); });
`;
  writeFileSync(script, code, "utf8");
  const proc = spawn("bun", ["run", script], { stdio: ["pipe", "pipe", "pipe"] });
  s = {
    agentId,
    url: "",
    proc,
    pending: new Map(),
    lastText: "",
    lastTitle: "",
    lastScreenshot: "",
    createdAt: Date.now(),
  };
  const rl = require("node:readline").createInterface({ input: proc.stdout });
  rl.on("line", (line: string) => {
    try {
      const m = JSON.parse(line);
      const cb = s!.pending.get(m.id);
      if (cb) {
        s!.pending.delete(m.id);
        cb(m);
      }
    } catch {}
  });
  proc.on("exit", () => browserSessions.delete(agentId));
  browserSessions.set(agentId, s);
  return s;
}

let browserReqSeq = 0;
function browserCall(agentId: string, cmd: any, timeoutMs = 30_000): Promise<any> {
  const s = ensureSession(agentId);
  const id = String(++browserReqSeq);
  return new Promise((resolveP, rejectP) => {
    const t = setTimeout(() => {
      s.pending.delete(id);
      rejectP(new Error(`browser call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    s.pending.set(id, (msg: any) => {
      clearTimeout(t);
      if (msg.ok) resolveP(msg.result);
      else rejectP(new Error(msg.error));
    });
    try {
      s.proc.stdin!.write(JSON.stringify({ id, ...cmd }) + "\n");
    } catch (e: any) {
      clearTimeout(t);
      s.pending.delete(id);
      rejectP(e);
    }
  });
}

toolRegistry.register({
  name: "lab_open_webpage",
  description:
    "Open a URL in a persistent headless browser. Returns the page text and title. " +
    "Subsequent lab_view_webpage and lab_use_webpage calls operate on this same page " +
    "until lab_open_webpage is called again. Required when the page is JS-heavy and " +
    "lab_read_webpage can't extract the content.",
  parameters: {
    url: { type: "string", description: "the URL to open", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url) return err("url is required");
    try {
      const r = await browserCall(ctx.agentId, { cmd: "open", url: args.url });
      return ok(`# ${r.title || args.url}\n\nURL: ${r.url}\n\n${r.text}`);
    } catch (e: any) {
      return err(`lab_open_webpage failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_view_webpage",
  description: "Re-fetch the current browser page's text and title. Use after lab_use_webpage to see the result of a click/fill/etc.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, ctx) {
    try {
      const r = await browserCall(ctx.agentId, { cmd: "view" });
      return ok(`# ${r.title || r.url}\n\nURL: ${r.url}\n\n${r.text}`);
    } catch (e: any) {
      return err(`lab_view_webpage failed: ${e?.message ?? String(e)}. Did you call lab_open_webpage first?`);
    }
  },
});

toolRegistry.register({
  name: "lab_use_webpage",
  description:
    "Interact with the currently open browser page. Supports click, fill, type, press, " +
    "scroll, goto, wait, and screenshot. After any action, returns the updated page text " +
    "so you can confirm the result. Always call lab_open_webpage first.",
  parameters: {
    action: { type: "string", enum: ["click", "fill", "type", "press", "scroll", "goto", "wait", "screenshot"], description: "the action to perform", required: true },
    selector: { type: "string", description: "CSS selector for click/fill/type/wait", required: false },
    text: { type: "string", description: "text to type/fill, or key to press (e.g. 'Enter')", required: false },
    value: { type: "number", description: "numeric value for scroll (pixels) or wait (ms)", required: false },
    url: { type: "string", description: "URL for goto action", required: false },
    fullPage: { type: "boolean", description: "for screenshot: capture full page (default true)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.action) return err("action is required");
    try {
      if (args.action === "screenshot") {
        const r = await browserCall(ctx.agentId, { cmd: "act", action: "screenshot", fullPage: args.fullPage !== false });
        return ok(`![screenshot](${r.dataUri})\n\n---\nFull-page: ${args.fullPage !== false}`);
      }
      const r = await browserCall(ctx.agentId, { cmd: "act", action: args.action, selector: args.selector, text: args.text, value: args.value, url: args.url });
      return ok(`# After ${args.action}\n\n## ${r.title || r.url}\n\nURL: ${r.url}\n\n${r.text}`);
    } catch (e: any) {
      return err(`lab_use_webpage failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ===========================================================================
// TRANSCRIPTION
// ===========================================================================

toolRegistry.register({
  name: "lab_transcribe_audio",
  description:
    "Transcribe an audio file to text. If `whisper` (whisper.cpp) is installed locally, " +
    "uses it. Otherwise uses `ffmpeg` to extract metadata only and returns a clear " +
    "error explaining how to install whisper.",
  parameters: {
    audio_file_path: { type: "string", description: "absolute or sandbox-relative path to the audio file", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.audio_file_path) return err("audio_file_path is required");
    try {
      const abs = isAbsolute(args.audio_file_path) ? args.audio_file_path : (ctx.sandbox ? ctx.sandbox.resolveSafe(args.audio_file_path) : resolve(args.audio_file_path));
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      // Probe with ffmpeg for metadata
      const probe = await runCommand("ffmpeg", ["-i", abs, "-hide_banner"], { timeoutMs: 5_000 });
      const meta = (probe.stderr.split("\n").filter((l) => l.includes("Duration") || l.includes("Stream"))[0] ?? "").trim();
      // Try whisper
      const r = await runCommand("whisper", [abs, "--output-txt", "--output-dir", "/tmp", "--model", "base"], { timeoutMs: 10 * 60_000 });
      if (r.ok) {
        const txtPath = `/tmp/${abs.split("/").pop()}.txt`;
        if (existsSync(txtPath)) {
          return ok(`# Transcription of ${abs}\n\n${meta ? "Audio: " + meta + "\n\n" : ""}${readFileSync(txtPath, "utf8")}`);
        }
        return ok(`# Transcription of ${abs}\n\n${r.stdout}\n${r.stderr}`);
      }
      return err(`Whisper not available or failed. Audio metadata: ${meta}\n\nTo enable in-lab transcription, install whisper.cpp:\n  brew install whisper-cpp   # or build from https://github.com/ggerganov/whisper.cpp\nThen ensure \`whisper\` is on PATH.`);
    } catch (e: any) {
      return err(`lab_transcribe_audio failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_transcribe_video",
  description: "Transcribe the audio track of a video file. Extracts audio via ffmpeg to a temp WAV, then runs whisper if available.",
  parameters: {
    video_file_path: { type: "string", description: "absolute or sandbox-relative path to the video file", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.video_file_path) return err("video_file_path is required");
    try {
      const abs = isAbsolute(args.video_file_path) ? args.video_file_path : (ctx.sandbox ? ctx.sandbox.resolveSafe(args.video_file_path) : resolve(args.video_file_path));
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      const wav = join(tmpdir(), `lab_video_audio_${randomBytes(6).toString("hex")}.wav`);
      const extract = await runCommand("ffmpeg", ["-y", "-i", abs, "-vn", "-ac", "1", "-ar", "16000", wav], { timeoutMs: 60_000 });
      if (!extract.ok) return err(`ffmpeg audio extract failed: ${extract.stderr.slice(0, 500)}`);
      const r = await runCommand("whisper", [wav, "--output-txt", "--output-dir", "/tmp", "--model", "base"], { timeoutMs: 10 * 60_000 });
      try { unlinkSync(wav); } catch {}
      if (r.ok) {
        const txtPath = `/tmp/${wav.split("/").pop()}.txt`;
        if (existsSync(txtPath)) {
          return ok(`# Transcription of ${abs}\n\n${readFileSync(txtPath, "utf8")}`);
        }
        return ok(`# Transcription of ${abs}\n\n${r.stdout}\n${r.stderr}`);
      }
      return err(`Whisper not available. Extracted audio to ${wav} but could not transcribe.\n\nTo enable in-lab transcription, install whisper.cpp: https://github.com/ggerganov/whisper.cpp`);
    } catch (e: any) {
      return err(`lab_transcribe_video failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ===========================================================================
// MEDIA — honest stubs (no local model available in the lab)
// ===========================================================================

const MEDIA_STUB_NOTE = (tool: string, capability: string) =>
  `${tool} is a TIER-2 stub in the current lab build. The lab has no local ${capability} model ` +
  `and we are not configured to call out to any external image/video provider (which would ` +
  `violate the "lab-internal only" rule). To enable ${capability}, add a local model endpoint ` +
  `as a runtime dependency (e.g. Stable Diffusion WebUI at http://localhost:7860, or a self-hosted ` +
  `ComfyUI/AnimateDiff instance) and replace the body of ${tool} in ` +
  `backend/src/tools/lab_tools_extra.ts to call it.`;

toolRegistry.register({
  name: "lab_generate_image",
  description: "Generate an image from a text prompt. STUB — requires a local Stable Diffusion / SDXL / Flux endpoint. See MEDIA_STUB_NOTE.",
  parameters: {
    prompt: { type: "string", description: "detailed description of the image", required: true },
    file_stem: { type: "string", description: "filename without extension (saved to sandbox Images/)", required: true },
    aspect_ratio: { type: "string", enum: ["1:1", "16:9", "4:3", "3:2", "9:16", "3:4", "2:3"], description: "image aspect ratio (default 1:1)", required: false },
  },
  defaultPermission: "ask",
  async execute() {
    return err(MEDIA_STUB_NOTE("lab_generate_image", "image generation"));
  },
});

toolRegistry.register({
  name: "lab_edit_image",
  description: "Edit an existing image. STUB — requires a local inpainting/editing endpoint.",
  parameters: {
    prompt: { type: "string", description: "what to change in the image", required: true },
    filepaths: {
      type: "array",
      description: "1-3 source image paths",
      required: true,
      items: { type: "string" },
    },
    file_stem: { type: "string", description: "output filename (without extension)", required: true },
  },
  defaultPermission: "ask",
  async execute() {
    return err(MEDIA_STUB_NOTE("lab_edit_image", "image editing"));
  },
});

toolRegistry.register({
  name: "lab_generate_video",
  description: "Generate a short video from a prompt or image. STUB — requires a local AnimateDiff / Stable Video Diffusion endpoint.",
  parameters: {
    instruction: { type: "string", description: "describe the video to generate", required: true },
    filepath: { type: "string", description: "optional source image to animate", required: false },
    file_stem: { type: "string", description: "output filename (without extension)", required: true },
  },
  defaultPermission: "ask",
  async execute() {
    return err(MEDIA_STUB_NOTE("lab_generate_video", "video generation"));
  },
});

toolRegistry.register({
  name: "lab_generate_d2_diagram",
  description:
    "Render a D2 block diagram to PNG/SVG. If the `d2` CLI is installed locally, uses it. " +
    "Otherwise returns a clear error explaining how to install it.",
  parameters: {
    code: { type: "string", description: "raw D2 source (no markdown fences)", required: true },
    file_stem: { type: "string", description: "output filename stem (no extension)", required: true },
    output_dir: { type: "string", description: "directory to write into (default sandbox 'diagrams/')", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.code) return err("code is required");
    if (!args.file_stem) return err("file_stem is required");
    const outDir = args.output_dir ?? "diagrams";
    if (!ctx.sandbox) return err("sandbox not active");
    try {
      // Write the .d2 source into the sandbox
      const d2Path = `${outDir}/${args.file_stem}.d2`;
      ctx.sandbox.writeFile(d2Path, args.code);
      const absD2 = ctx.sandbox.resolveSafe(d2Path);
      const absPng = absD2.replace(/\.d2$/, ".png");
      const r = await runCommand("d2", [absD2, absPng], { timeoutMs: 30_000 });
      if (!r.ok) {
        return err(`d2 failed: ${r.stderr || r.stdout}\n\nTo enable diagrams, install d2: https://d2lang.com/tour/install\n(macOS: brew install d2  |  Linux: curl -fsSL https://d2lang.com/install.sh | sh -s --)`);
      }
      return ok(`rendered ${absPng}\n${r.stdout}`);
    } catch (e: any) {
      return err(`lab_generate_d2_diagram failed: ${e?.message ?? String(e)}`);
    }
  },
});
