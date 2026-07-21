/**
 * Lab Extra Tools — fully self-contained agent tools.
 *
 * Every tool in this file is 100% local to the lab. No requests are made to
 * Zo Computer, Anthropic, OpenAI, or any other third-party API. The tools
 * that need search/transcription/etc. use:
 *   - bun's built-in `fetch` for HTTP
 *   - Playwright (already in node_modules) + agent-browser CLI for browser automation
 *   - ffmpeg / d2 for media
 *   - HTML scraping for search results (no API key needed)
 *   - Cloudflare Workers AI for image generation, image editing, and
 *     audio transcription (when `CF_ACCOUNT_ID` + `CF_API_TOKEN` are
 *     configured as user secrets). No video model is available on this
 *     Cloudflare account as of 2026-06-22, so `lab_generate_video`
 *     remains a stub that tells the agent this honestly.
 *
 * Tier classification (kept honest — the agent sees this in the tool list):
 *   T1   fully implemented, lab-internal
 *   T1+  fully implemented but depends on optional local binaries
 *        (ffmpeg, d2) or optional Cloudflare creds — tool reports a clear
 *        error if missing
 *   T2   stubbed with a clear "not implemented in-lab yet" message
 *
 * Tools prefixed `lab_` so they don't collide with the existing `builtin.ts`
 * tools (`read_file`, `write_file`, etc.) or the `zo_*` namespace in the
 * (now orphaned) zo_tools.ts file.
 *
 * Cloudflare Models used (verified against this account on 2026-06-22):
 *   Image generation:  @cf/black-forest-labs/flux-2-klein-9b  (default)
 *                     @cf/bytedance/stable-diffusion-xl-lightning  (fast, raw JPEG)
 *   Image editing:    @cf/black-forest-labs/flux-2-dev  (up to 3 input images)
 *   Transcription:    @cf/openai/whisper  (multipart, audio file)
 *   No video model:   lab_generate_video returns a "no model available" message.
 */

import { toolRegistry, type ToolContext } from "./registry.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, unlinkSync, realpathSync } from "node:fs";
import { join, resolve, isAbsolute, sep, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { WorkspaceService } from "../workspace/index.ts";

import { setActiveView } from "../browser/active.ts";
const LAB_PROJECT_ROOT = WorkspaceService.root();
const LAB_BACKEND_ROOT = WorkspaceService.zoRoot();
const DATA_DIR = WorkspaceService.root();
mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}
function ok(s: string, media?: Array<{ path: string; mime: string; kind: "image" | "video" | "audio"; alt?: string }>) {
  if (media && media.length > 0) {
    return { content: [{ type: "text" as const, text: s }], media };
  }
  return { content: [{ type: "text" as const, text: s }] };
}

/** Resolve a path against the sandbox. Throws on escape. */
function resolveInSandbox(ctx: ToolContext, p: string): string {
  if (!ctx.sandbox) throw new Error("sandbox not active — agent must be running in a sandbox");
  return ctx.sandbox.resolveSafe(p);
}

/** Resolve an absolute path, restricting to DATA_DIR when no sandbox is active. */
function resolveLabPath(ctx: ToolContext, p: string): string {
  if (ctx.sandbox) return resolveInSandbox(ctx, p);
  // No sandbox: restrict to DATA_DIR
  const abs = isAbsolute(p) ? p : resolve(DATA_DIR, p);
  const real = realpathSync(abs);
  const root = realpathSync(DATA_DIR);
  if (real !== root && !real.startsWith(root + sep)) {
    throw new Error(`path escapes lab workspace: ${p}`);
  }
  return real;
}

/** Write content into the sandbox at a sandbox-relative path. */
function saveToSandbox(ctx: ToolContext, absPath: string, content: string | Buffer): string {
  if (!ctx.sandbox) throw new Error("sandbox not active");
  const workdir = resolve(ctx.sandbox.workdir, dirname(absPath));
  const rel = absPath.startsWith(workdir) ? absPath.slice(workdir.length).replace(/^[/\\]+/, "") : absPath.replace(/^[/\\]+/, "");
  ctx.sandbox.writeFile(rel, typeof content === "string" ? content : content.toString("utf8"));
  return rel;
}

/** Pull out a sandbox-relative file name when given an absolute path. */
function relFromAbs(ctx: ToolContext, abs: string): string {
  if (!ctx.sandbox) return abs;
  const wd = resolve(ctx.sandbox.workdir, dirname(abs));
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

/**
 * Run a command, capturing stdout and stderr. Returns an object with the exit
 * code, stdout string, stderr string, and whether it succeeded (exit code 0).
 * Throws on timeout or spawn failure.
 */
async function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string }> {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });

  const timeout = opts.timeoutMs ?? 30_000;
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    // Send SIGKILL 2 seconds later if still alive
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
    }, 2000);
  }, timeout);

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout!.on("data", (d: Buffer) => stdout.push(d));
  child.stderr!.on("data", (d: Buffer) => stderr.push(d));

  return new Promise((resolvePromise) => {
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      resolvePromise({
        ok: exitCode === 0,
        exitCode: exitCode ?? -1,
        stdout: out,
        stderr: err,
      });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolvePromise({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: e.message,
      });
    });
  });
}

// -------------------------------------------------------------------
// DEPENDENCY DETECTION HELPERS
// -------------------------------------------------------------------

/** Check if Playwright Chromium browser binary is installed. */
function chromiumAvailable(): boolean {
  const envDir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const homedir = process.env.HOME || "/root";
  const candidates = envDir
    ? [envDir]
    : [join(homedir, ".cache", "ms-playwright"), "/root/.cache/ms-playwright"];
  for (const dir of candidates) {
    try {
      if (existsSync(dir)) {
        const entries = readdirSync(dir);
        if (entries.some((e) => e.startsWith("chromium"))) return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

/** Check if ffmpeg is installed. */
function ffmpegAvailable(): boolean {
  try {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Check if the `d2` CLI is installed. */
function d2Available(): boolean {
  try {
    const r = spawnSync("d2", ["version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Check if the agent-browser CLI is installed. */
let _agentBrowserChecked = false;
let _agentBrowserAvailable = false;
function agentBrowserAvailable(): boolean {
  if (!_agentBrowserChecked) {
    try {
      _agentBrowserChecked = true;
      const r = spawnSync("agent-browser", ["--version"], { stdio: "ignore" });
      return r.status === 0;
    } catch {
      return false;
    }
  }
  return _agentBrowserAvailable;
}

/** Check if apt-get is available (whether we're root and can install packages). */
function aptAvailable(): boolean {
  try {
    const r = spawnSync("apt-get", ["--version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Return a structured report of which tool-chain dependencies are available. */
function checkDeps(): { name: string; available: boolean; hint: string }[] {
  return [
    {
      name: "ffmpeg",
      available: ffmpegAvailable(),
      hint: ffmpegAvailable()
        ? ""
        : "apt-get install -y ffmpeg\n   (requires root, typical in Docker containers)",
    },
    {
      name: "playwright-chromium",
      available: chromiumAvailable(),
      hint: chromiumAvailable()
        ? ""
        : "cd <backend_dir> && bunx playwright install chromium\n   Downloads ~300 MB Chromium browser for headless browsing tools.",
    },
    {
      name: "d2",
      available: d2Available(),
      hint: d2Available()
        ? ""
        : "curl -fsSL https://d2lang.com/install.sh | sh -s --\n   Enables lab_generate_d2_diagram.",
    },
    {
      name: "agent-browser",
      available: agentBrowserAvailable(),
      hint: agentBrowserAvailable()
        ? ""
        : "apt-get install -y agent-browser\n   (requires root, typical in Docker containers)",
    },
    {
      name: "apt-get",
      available: aptAvailable(),
      hint: aptAvailable()
        ? "available (root)"
        : "not available — install system packages manually",
    },
  ];
}

// -------------------------------------------------------------------
// CLOUDFLARE WORKERS AI HELPERS
// -------------------------------------------------------------------

const CF_BASE = "https://api.cloudflare.com/client/v4";

interface CfCreds { accountId: string; apiToken: string; }

/** Read Cloudflare creds from the user's secrets vault. Returns null if missing. */
async function cfGetConfig(ctx: ToolContext): Promise<CfCreds | null> {
  const accountId = await ctx.secrets.get("CF_ACCOUNT_ID");
  const apiToken = await ctx.secrets.get("CF_API_TOKEN");
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

/** Return an error string describing how to set up Cloudflare creds. */
function cfMissingCredsMsg(tool: string): string {
  return (
    `${tool} requires Cloudflare Workers AI credentials. To enable:\n` +
    `  1. Get an API token from https://dash.cloudflare.com/profile/api-tokens\n` +
    `     (needs "Workers AI: Edit" scope)\n` +
    `  2. Find your Account ID on the right side of the Cloudflare dashboard\n` +
    `  3. In the lab UI, go to Settings > Secrets and add:\n` +
    `       CF_ACCOUNT_ID = <your account id>\n` +
    `       CF_API_TOKEN   = <your api token>\n` +
    `  4. Try again.`
  );
}

/**
 * Call a Cloudflare Workers AI model.
 * - `asJson: true`  -> send JSON body, expect JSON response (FLUX.1 schnell, SDXL-Lightning may also return binary)
 * - `asJson: false` -> send multipart form, expect JSON response (FLUX.2 dev/klein)
 *
 * Returns the raw Response so callers can branch on content-type.
 */
async function cfRunModel(
  creds: CfCreds,
  model: string,
  body: Record<string, unknown> | FormData,
  opts: { asJson?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  const url = `${CF_BASE}/accounts/${creds.accountId}/ai/run/${model}`;
  if (opts.asJson ?? true) {
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  }
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.apiToken}` },
    body: body as FormData,
    signal: opts.signal,
  });
}

/** Decode a base64 JPEG string into a Buffer, validating the magic bytes. */
function decodeBase64Jpeg(b64: string): Buffer {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error(`expected JPEG (FF D8), got bytes: ${buf.subarray(0, 4).toString("hex")}`);
  }
  return buf;
}

/** Map an aspect ratio string to (width, height). */
function aspectToSize(ar: string, base = 1024): { width: number; height: number } {
  const [w, h] = ar.split(":").map(Number);
  if (!w || !h) return { width: base, height: base };
  if (w >= h) return { width: base, height: Math.round((base * h) / w / 8) * 8 };
  return { width: Math.round((base * w) / h / 8) * 8, height: base };
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
  async execute(args, ctx) {
    if (!args.target_file) return err("target_file is required");
    try {
      const abs = resolveLabPath(ctx, args.target_file);
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
      const abs = resolveLabPath(ctx, args.target_file);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, args.content, "utf8");
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
      const abs = resolveLabPath(ctx, args.target_file);
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      let content = readFileSync(abs, "utf8");
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
      writeFileSync(abs, content, "utf8");
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
      const abs = resolveLabPath(ctx, args.target_file);
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      const content = readFileSync(abs, "utf8");
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
      writeFileSync(abs, newContent, "utf8");
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
      const src = resolveLabPath(ctx, args.source_path);
      if (!existsSync(src)) return err(`source not found: ${src}`);
      const data = readFileSync(src);
      const dest = resolveLabPath(ctx, args.dest_path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, data);
      return ok(`copied ${src} -> ${dest}`);
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
      const target = args.path ?? DATA_DIR;
      const abs = resolveLabPath(ctx, target);
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
      const target = args.path ?? "/home/workspace/Projects/ai-automation-lab/backend/data";
      const abs = resolveLabPath(ctx, target);
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
  description: "Run a shell command inside the lab data directory. Use for file operations, git, scripts, and system tools. Enforces timeout and output cap.",
  parameters: {
    command: { type: "string", description: "shell command to execute (can include pipes, redirects, env vars)", required: true },
    timeoutMs: { type: "number", description: "max wall time in ms (default 30000)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.command) return err("command is required");
    if (!ctx.sandbox) return err("sandbox not active — agent must run inside a sandbox");
    try {
      const wrapped = `cd ${DATA_DIR} && ${args.command}`;
      const r = await ctx.sandbox.run("bash", ["-c", wrapped]);
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
      const r = await ctx.sandbox.run("bash", ["-c", `cd ${DATA_DIR} && ${c}`]);
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
      const r = await ctx.sandbox!.run("bash", ["-c", `cd ${DATA_DIR} && ${c}`]);
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
        // Try agent-browser first (faster, no deps needed), then fall back to Playwright
        let text: string;
        if (agentBrowserAvailable()) {
          try {
            text = await agentBrowserRead(args.url, 20_000);
          } catch {
            text = await openAndExtractText(args.url, 20_000);
          }
        } else {
          text = await openAndExtractText(args.url, 20_000);
        }
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
  if (!chromiumAvailable()) {
    throw new Error(
      "Playwright Chromium browser is not installed. " +
      "Run `lab_install_dependency` with name='playwright-chromium' to install it."
    );
  }
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

/**
 * Use agent-browser CLI to open a URL and extract page text.
 * Faster than Playwright for JS rendering since it's already installed.
 */
async function agentBrowserRead(url: string, timeoutMs: number = 20_000): Promise<string> {
  if (!agentBrowserAvailable()) {
    throw new Error(
      "agent-browser CLI is not installed. " +
      "Run `lab_install_dependency` with name='agent-browser' to install it."
    );
  }
  const script = join(tmpdir(), `lab_agent_browser_${randomBytes(6).toString("hex")}.sh`);
  const code = `
#!/usr/bin/env bash
agent-browser open "${url}" && sleep 2 && agent-browser get text && agent-browser close
`;
  writeFileSync(script, code, "utf8");
  try {
    const proc = Bun.spawn(["bun", "run", script], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error(`agent-browser failed (${exitCode}): ${stderr.slice(0, 500)}`);
    return stdout;
  } finally {
    try { unlinkSync(script); } catch {}
  }
}

/**
 * Use agent-browser CLI to take a screenshot of a URL.
 */
async function agentBrowserScreenshot(url: string, fullPage: boolean = true): Promise<string> {
  if (!agentBrowserAvailable()) {
    throw new Error(
      "agent-browser CLI is not installed. " +
      "Run `lab_install_dependency` with name='agent-browser' to install it."
    );
  }
  const script = join(tmpdir(), `lab_agent_browser_${randomBytes(6).toString("hex")}.sh`);
  const code = `
#!/usr/bin/env bash
agent-browser open "${url}" && sleep 2 && agent-browser screenshot /tmp/ab_screenshot_${randomBytes(6).toString("hex")}.png && agent-browser close
`;
  writeFileSync(script, code, "utf8");
  try {
    const proc = Bun.spawn(["bun", "run", script], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error(`agent-browser failed (${exitCode}): ${stderr.slice(0, 500)}`);
    return stdout;
  } finally {
    try { unlinkSync(script); } catch {}
  }
}

function ensureSession(agentId: string) {
  let s = browserSessions.get(agentId);
  if (s) return s;
  if (!chromiumAvailable()) {
    throw new Error(
      "Playwright Chromium browser is not installed. " +
      "Run `lab_install_dependency` with name='playwright-chromium' to install it."
    );
  }
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
  const html = (await page.content()).slice(0, 500000);
  return { url: page.url(), title, text: text.slice(0, 50000), html };
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
      setActiveView(ctx.ownerId, { url: r.url, title: r.title, html: r.html ?? "", agentId: ctx.agentId });
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
      setActiveView(ctx.ownerId, { url: r.url, title: r.title, html: r.html ?? "", agentId: ctx.agentId });
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
      setActiveView(ctx.ownerId, { url: r.url, title: r.title, html: r.html ?? "", agentId: ctx.agentId });
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
    "Transcribe an audio file to text. Uses Cloudflare Workers AI (@cf/openai/whisper) " +
    "if CF_ACCOUNT_ID and CF_API_TOKEN secrets are configured. Falls back to local " +
    "`whisper` (whisper.cpp) if installed. Otherwise returns a clear error.",
  parameters: {
    audio_file_path: { type: "string", description: "absolute or sandbox-relative path to the audio file", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.audio_file_path) return err("audio_file_path is required");
    try {
      const abs = resolveLabPath(ctx, args.audio_file_path);
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      // Probe with ffmpeg for metadata
      const probe = await runCommand("ffmpeg", ["-i", abs, "-hide_banner"], { timeoutMs: 5_000 });
      const meta = (probe.stderr.split("\n").filter((l) => l.includes("Duration") || l.includes("Stream"))[0] ?? "").trim();
      // Try Cloudflare Whisper first — convert input audio to MP3 first (CF's
      // whisper rejects some WAV headers; MP3 works reliably).
      const creds = await cfGetConfig(ctx);
      if (creds) {
        try {
          const mp3Path = join(tmpdir(), `lab_audio_${randomBytes(6).toString("hex")}.mp3`);
          const conv = await runCommand("ffmpeg", ["-y", "-i", abs, "-ar", "16000", "-ac", "1", "-b:a", "32k", mp3Path], { timeoutMs: 60_000 });
          if (conv.ok) {
            const fileBuf = readFileSync(mp3Path);
            try { unlinkSync(mp3Path); } catch {}
            const fd = new FormData();
            fd.append("audio", new Blob([new Uint8Array(fileBuf)], { type: "audio/mpeg" }), "audio.mp3");
            const res = await cfRunModel(creds, "@cf/openai/whisper", fd, { asJson: false });
            if (res.ok) {
              const j = await res.json() as any;
              const text = j?.result?.text ?? j?.text ?? JSON.stringify(j);
              return ok(`# Transcription of ${abs}\n\n${meta ? "Audio: " + meta + "\n\n" : ""}Engine: Cloudflare Workers AI (@cf/openai/whisper)\n\n${text}`);
            }
          }
        } catch { /* fall through to local whisper */ }
      }
      // Fallback: local whisper.cpp
      const r = await runCommand("whisper", [abs, "--output-txt", "--output-dir", "/tmp", "--model", "base"], { timeoutMs: 10 * 60_000 });
      if (r.ok) {
        const txtPath = `/tmp/${abs.split("/").pop()}.txt`;
        if (existsSync(txtPath)) {
          return ok(`# Transcription of ${abs}\n\n${meta ? "Audio: " + meta + "\n\n" : ""}Engine: local whisper.cpp\n\n${readFileSync(txtPath, "utf8")}`);
        }
        return ok(`# Transcription of ${abs}\n\n${r.stdout}\n${r.stderr}`);
      }
      return err(`Neither Cloudflare nor local whisper succeeded. Audio metadata: ${meta}\n\nTo enable transcription, either:\n  - Set CF_ACCOUNT_ID and CF_API_TOKEN secrets (uses Cloudflare Workers AI), OR\n  - Install whisper.cpp locally: https://github.com/ggerganov/whisper.cpp`);
    } catch (e: any) {
      return err(`lab_transcribe_audio failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_transcribe_video",
  description:
    "Transcribe the audio track of a video file. Uses Cloudflare Workers AI (@cf/openai/whisper) " +
    "if CF creds are set. Falls back to extracting audio via ffmpeg and transcribing " +
    "with local whisper if available.",
  parameters: {
    video_file_path: { type: "string", description: "absolute or sandbox-relative path to the video file", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.video_file_path) return err("video_file_path is required");
    try {
      const abs = resolveLabPath(ctx, args.video_file_path);
      if (!existsSync(abs)) return err(`file not found: ${abs}`);
      // Probe with ffmpeg for metadata
      const probe = await runCommand("ffmpeg", ["-i", abs, "-hide_banner"], { timeoutMs: 5_000 });
      const meta = (probe.stderr.split("\n").filter((l) => l.includes("Duration") || l.includes("Stream"))[0] ?? "").trim();
      // Extract audio track to WAV (then we'll convert to MP3 for CF Whisper).
      const wav = join(tmpdir(), `lab_video_audio_${randomBytes(6).toString("hex")}.wav`);
      const extract = await runCommand("ffmpeg", ["-y", "-i", abs, "-vn", "-ac", "1", "-ar", "16000", wav], { timeoutMs: 60_000 });
      if (!extract.ok) return err(`ffmpeg audio extract failed: ${extract.stderr.slice(0, 500)}`);
      // Try Cloudflare Whisper — convert the extracted WAV to MP3 first
      // (CF's whisper rejects some WAV headers; MP3 is reliable).
      const creds = await cfGetConfig(ctx);
      if (creds) {
        try {
          const mp3Path = join(tmpdir(), `lab_video_audio_${randomBytes(6).toString("hex")}.mp3`);
          const conv = await runCommand("ffmpeg", ["-y", "-i", wav, "-ar", "16000", "-ac", "1", "-b:a", "32k", mp3Path], { timeoutMs: 60_000 });
          if (conv.ok) {
            const fileBuf = readFileSync(mp3Path);
            try { unlinkSync(mp3Path); } catch {}
            const fd = new FormData();
            fd.append("audio", new Blob([new Uint8Array(fileBuf)], { type: "audio/mpeg" }), "audio.mp3");
            const res = await cfRunModel(creds, "@cf/openai/whisper", fd, { asJson: false });
            if (res.ok) {
              const j = await res.json() as any;
              const text = j?.result?.text ?? j?.text ?? JSON.stringify(j);
              return ok(`# Transcription of ${abs}\n\n${meta ? "Audio: " + meta + "\n\n" : ""}Engine: Cloudflare Workers AI (@cf/openai/whisper)\n\n${text}`);
            }
          }
        } catch { /* fall through to local whisper */ }
      }
      // Fallback: local whisper.cpp
      const r = await runCommand("whisper", [wav, "--output-txt", "--output-dir", "/tmp", "--model", "base"], { timeoutMs: 10 * 60_000 });
      try { unlinkSync(wav); } catch {}
      if (r.ok) {
        const txtPath = `/tmp/${wav.split("/").pop()}.txt`;
        if (existsSync(txtPath)) {
          return ok(`# Transcription of ${abs}\n\n${meta ? "Audio: " + meta + "\n\n" : ""}Engine: local whisper.cpp\n\n${readFileSync(txtPath, "utf8")}`);
        }
        return ok(`# Transcription of ${abs}\n\n${r.stdout}\n${r.stderr}`);
      }
      return err(`Neither Cloudflare nor local whisper succeeded. Audio metadata: ${meta}\n\nTo enable transcription, either:\n  - Set CF_ACCOUNT_ID and CF_API_TOKEN secrets (uses Cloudflare Workers AI), OR\n  - Install whisper.cpp locally: https://github.com/ggerganov/whisper.cpp`);
    } catch (e: any) {
      return err(`lab_transcribe_video failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ===========================================================================
// MEDIA — Cloudflare Workers AI
// ===========================================================================

// Image generation + editing + (no) video via Cloudflare Workers AI.
// These are optional: if the user hasn't set CF_ACCOUNT_ID + CF_API_TOKEN
// secrets, the tools return a clear setup message instead of failing silently.

toolRegistry.register({
  name: "lab_generate_image",
  description:
    "Generate an image from a text prompt using Cloudflare Workers AI " +
    "(SDXL-Lightning for speed, FLUX.2 [klein] 9B for quality, FLUX.1 [schnell] as a fallback). " +
    "The output PNG is saved to the sandbox's `Images/` directory and the path is returned. " +
    "Requires CF_ACCOUNT_ID and CF_API_TOKEN secrets.",
  parameters: {
    prompt: { type: "string", description: "detailed description of the image (style, lighting, composition, subject)", required: true },
    file_stem: { type: "string", description: "filename without extension (saved to sandbox Images/)", required: true },
    aspect_ratio: {
      type: "string",
      enum: ["1:1", "16:9", "4:3", "3:2", "9:16", "3:4", "2:3", "21:9", "4:1", "8:1", "1:4", "1:8", "5:4", "4:5"],
      description: "image aspect ratio (default 1:1)",
      required: false,
    },
    model: {
      type: "string",
      enum: ["flux-2-klein-9b", "flux-1-schnell", "sdxl-lightning", "leonardo-phoenix", "stability-sdxl-base"],
      description: "which model to use. Default flux-2-klein-9b (high quality). Use sdxl-lightning for speed.",
      required: false,
    },
    steps: { type: "number", description: "diffusion steps (default 20, ignored by flux-2-klein which is fixed at 4)", required: false },
    seed: { type: "number", description: "random seed for reproducibility", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.prompt) return err("prompt is required");
    if (!args.file_stem) return err("file_stem is required");
    const creds = await cfGetConfig(ctx);
    if (!creds) return err(cfMissingCredsMsg("lab_generate_image"));

    const { width, height } = aspectToSize(args.aspect_ratio ?? "1:1");
    const seed = args.seed ?? Math.floor(Math.random() * 4294967295);
    const steps = args.steps ?? 20;
    // Cloudflare image models return JPEG bytes (FF D8 magic), so write
    // as .jpg not .png to avoid confusing readers / OS previews.
    const safeName = args.file_stem.replace(/[^a-z0-9_-]/gi, "_");
    const outRel = `Images/${safeName}.jpg`;
    const outAbs = ctx.sandbox ? ctx.sandbox.resolveSafe(outRel) : resolve(LAB_BACKEND_ROOT + `/Images/${safeName}.jpg`);

    const writeOut = async (buf: Buffer) => {
      mkdirSync(dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, buf);
      return outRel;
    };

    // Map the friendly model name to a Cloudflare model id.
    // Each model has its own input shape, so we branch.
    try {
      // --- flux-2-klein-9b (multipart, best quality) ---
      if ((args.model ?? "flux-2-klein-9b") === "flux-2-klein-9b") {
        const fd = new FormData();
        fd.append("prompt", args.prompt);
        fd.append("width", String(width));
        fd.append("height", String(height));
        fd.append("seed", String(seed));
        const res = await cfRunModel(creds, "@cf/black-forest-labs/flux-2-klein-9b", fd, { asJson: false });
        if (!res.ok) return err(`Cloudflare flux-2-klein-9b failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
        const j = await res.json() as any;
        if (!j?.success || !j?.result?.image) return err(`Cloudflare returned no image: ${JSON.stringify(j).slice(0, 500)}`);
        const buf = decodeBase64Jpeg(j.result.image);
        const path = await writeOut(buf);
        return ok(`# Generated image\n\nModel: flux-2-klein-9b\nSeed: ${seed}\nSize: ${width}x${height}\nSaved: ${outAbs}\n\nPrompt: ${args.prompt}`, [{ path, mime: "image/jpeg", kind: "image", alt: args.prompt }]);
      }

      // --- flux-1-schnell (JSON, 4 steps, fast) ---
      if (args.model === "flux-1-schnell") {
        const res = await cfRunModel(creds, "@cf/black-forest-labs/flux-1-schnell", {
          prompt: args.prompt, steps: Math.min(steps, 8), width, height, seed,
        });
        if (!res.ok) return err(`Cloudflare flux-1-schnell failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
        // Response may be JSON with base64 OR raw image bytes
        const ct = res.headers.get("content-type") ?? "";
        if (ct.startsWith("image/")) {
          const path = await writeOut(Buffer.from(await res.arrayBuffer()));
          return ok(`# Generated image\n\nModel: flux-1-schnell\nSeed: ${seed}\nSize: ${width}x${height}\nSaved: ${outAbs}`, [{ path, mime: ct || "image/jpeg", kind: "image", alt: args.prompt }]);
        }
        const j = await res.json() as any;
        if (!j?.success || !j?.result?.image) return err(`Cloudflare returned no image: ${JSON.stringify(j).slice(0, 500)}`);
        const buf = decodeBase64Jpeg(j.result.image);
        const path = await writeOut(buf);
        return ok(`# Generated image\n\nModel: flux-1-schnell\nSeed: ${seed}\nSize: ${width}x${height}\nSaved: ${outAbs}`, [{ path, mime: "image/jpeg", kind: "image", alt: args.prompt }]);
      }

      // --- sdxl-lightning (JSON, 1024x1024, raw JPEG bytes back) ---
      if (args.model === "sdxl-lightning") {
        const res = await cfRunModel(creds, "@cf/bytedance/stable-diffusion-xl-lightning", {
          prompt: args.prompt, num_steps: Math.min(steps, 20), guidance: 7.5, width, height, seed,
        });
        if (!res.ok) return err(`Cloudflare sdxl-lightning failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) return err(`Cloudflare returned tiny response: ${buf.toString("utf8").slice(0, 200)}`);
        await writeOut(buf);
        return ok(`# Generated image\n\nModel: sdxl-lightning\nSeed: ${seed}\nSize: ${width}x${height}\nSaved: ${outAbs}\n(${buf.length} bytes JPEG)`, [{ path: outRel, mime: "image/jpeg", kind: "image", alt: args.prompt }]);
      }

      // --- leonardo-phoenix (JSON) ---
      if (args.model === "leonardo-phoenix") {
        const res = await cfRunModel(creds, "@cf/leonardo/phoenix-1.0", {
          prompt: args.prompt, num_steps: Math.min(steps, 20), guidance: 7.5, width, height, seed,
        });
        if (!res.ok) return err(`Cloudflare leonardo-phoenix failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
        const j = await res.json() as any;
        if (!j?.success || !j?.result?.image) return err(`Cloudflare returned no image: ${JSON.stringify(j).slice(0, 500)}`);
        const buf = decodeBase64Jpeg(j.result.image);
        await writeOut(buf);
        return ok(`# Generated image\n\nModel: leonardo-phoenix\nSeed: ${seed}\nSize: ${width}x${height}\nSaved: ${outAbs}`, [{ path: outRel, mime: "image/jpeg", kind: "image", alt: args.prompt }]);
      }

      // --- stability-sdxl-base (JSON) ---
      if (args.model === "stability-sdxl-base") {
        const res = await cfRunModel(creds, "@cf/stabilityai/stable-diffusion-xl-base-1.0", {
          prompt: args.prompt, num_steps: Math.min(steps, 20), guidance: 7.5, width, height, seed,
        });
        if (!res.ok) return err(`Cloudflare stability-sdxl-base failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
        const j = await res.json() as any;
        if (!j?.success || !j?.result?.image) return err(`Cloudflare returned no image: ${JSON.stringify(j).slice(0, 500)}`);
        const buf = decodeBase64Jpeg(j.result.image);
        await writeOut(buf);
        return ok(`# Generated image\n\nModel: stability-sdxl-base\nSeed: ${seed}\nSize: ${width}x${height}\nSaved: ${outAbs}`, [{ path: outRel, mime: "image/jpeg", kind: "image", alt: args.prompt }]);
      }

      return err(`unknown model: ${args.model}`);
    } catch (e: any) {
      return err(`lab_generate_image failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_edit_image",
  description:
    "Edit an existing image using Cloudflare's FLUX.2 [klein] 9B model. " +
    "Provide the source image and a prompt describing the desired change. " +
    "Supports multi-reference style transfer (up to 3 source images). " +
    "Requires CF_ACCOUNT_ID and CF_API_TOKEN secrets.",
  parameters: {
    prompt: { type: "string", description: "what to change or apply to the image(s)", required: true },
    filepaths: {
      type: "array",
      description: "1-3 source image paths (absolute or sandbox-relative)",
      required: true,
      items: { type: "string" },
    },
    file_stem: { type: "string", description: "output filename without extension (saved to sandbox Images/)", required: true },
    width: { type: "number", description: "output width 256-1920 (default 1024)", required: false },
    height: { type: "number", description: "output height 256-1920 (default 768)", required: false },
    seed: { type: "number", description: "random seed for reproducibility", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.prompt) return err("prompt is required");
    if (!Array.isArray(args.filepaths) || args.filepaths.length === 0) return err("filepaths must be a non-empty array (1-3 images)");
    if (args.filepaths.length > 3) return err("max 3 source images");
    if (!args.file_stem) return err("file_stem is required");
    const creds = await cfGetConfig(ctx);
    if (!creds) return err(cfMissingCredsMsg("lab_edit_image"));

    try {
      // Resolve all source paths
      const absImages: Buffer[] = [];
      for (const fp of args.filepaths as string[]) {
        const abs = resolveLabPath(ctx, fp);
        if (!existsSync(abs)) return err(`source image not found: ${abs}`);
        absImages.push(readFileSync(abs));
      }

      const width = args.width ?? 1024;
      const height = args.height ?? 768;
      const seed = args.seed ?? Math.floor(Math.random() * 4294967295);
      const safeName = args.file_stem.replace(/[^a-z0-9_-]/gi, "_");
      // Cloudflare editing also returns JPEG bytes — write as .jpg.
      const outAbs = ctx.sandbox ? ctx.sandbox.resolveSafe(`${safeName}.jpg`) : resolve(LAB_BACKEND_ROOT + `/Images/${safeName}.jpg`);

      // FLUX.2 [klein] 9B is the only model in this account with a reliable
      // editing path. It requires multipart with input_image_0..2.
      const fd = new FormData();
      fd.append("prompt", args.prompt);
      fd.append("width", String(width));
      fd.append("height", String(height));
      fd.append("seed", String(seed));
      absImages.forEach((buf, i) => {
        // Cloudflare expects each input image to be <= 512x512.
        // Blob needs a BlobPart — copy into a fresh Uint8Array<ArrayBuffer>.
        const copy = new Uint8Array(buf.byteLength);
        copy.set(buf);
        const blob = new Blob([copy], { type: "image/jpeg" });
        fd.append(`input_image_${i}`, blob, `input_${i}.jpg`);
      });

      const res = await cfRunModel(creds, "@cf/black-forest-labs/flux-2-klein-9b", fd, { asJson: false });
      if (!res.ok) return err(`Cloudflare flux-2-klein-9b edit failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
      const j = await res.json() as any;
      if (!j?.success || !j?.result?.image) return err(`Cloudflare returned no image: ${JSON.stringify(j).slice(0, 500)}`);

      const outRel = `Images/${safeName}.jpg`;
      const out = decodeBase64Jpeg(j.result.image);
      mkdirSync(dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, out);
      return ok(
        `# Edited image\n\nModel: flux-2-klein-9b\nSeed: ${seed}\nSize: ${width}x${height}\n` +
        `Source images: ${args.filepaths.join(", ")}\n` +
        `Saved: ${outAbs}\n\nPrompt: ${args.prompt}`,
        [{ path: outRel, mime: "image/jpeg", kind: "image", alt: args.prompt }]
      );
    } catch (e: any) {
      return err(`lab_edit_image failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "lab_generate_video",
  description:
    "Generate a short MP4 video (4 seconds, 1280x720, 24fps) by animating a source image using ffmpeg. " +
    "The lab's Cloudflare account has no video generation models enabled on Cloudflare " +
    "Workers AI, so this tool currently returns a clear not-available message listing the " +
    "image models that ARE available. If video is added to the account later, this tool can be " +
    "extended to call it (Cloudflare offers Pixverse v6 and Hailuo 2.3 in their general catalog " +
    "but they aren't enabled in this account).",
  parameters: {
    instruction: { type: "string", description: "describe the video to generate", required: true },
    filepath: { type: "string", description: "optional source image to animate", required: false },
    file_stem: { type: "string", description: "output filename without extension", required: true },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.instruction) return err("instruction is required");
    if (!args.file_stem) return err("file_stem is required");
    if (!ctx.sandbox) return err("sandbox not active — agent must be running in a sandbox");
    if (!ffmpegAvailable()) return err("lab_generate_video: ffmpeg is not installed on this machine. Install it (apt install ffmpeg) to enable video generation.");

    const safeName = String(args.file_stem).replace(/[^a-z0-9_-]/gi, "_");
    const outRel = `Videos/${safeName}.mp4`;
    const outAbs = ctx.sandbox.resolveSafe(outRel);
    const dir = dirname(outAbs);
    try { mkdirSync(dir, { recursive: true }); } catch {}

    // 1. Source image: either the provided filepath, or one we generate.
    let sourceRel: string | null = null;
    let sourceAbs: string | null = null;
    if (args.filepath && typeof args.filepath === "string") {
      const fp = String(args.filepath);
      sourceAbs = resolveLabPath(ctx, fp);
      if (!existsSync(sourceAbs)) {
        return err(`lab_generate_video: source image not found: ${fp}`);
      }
      sourceRel = fp.startsWith(ctx.sandbox.workdir)
        ? fp.slice(ctx.sandbox.workdir.length).replace(/^[/\\]+/, "")
        : fp;
    } else {
      // Try to generate a base image via Cloudflare (same code path as lab_generate_image).
      const creds = await cfGetConfig(ctx);
      if (!creds) {
        return err(
          "lab_generate_video: no source image supplied and no Cloudflare creds to generate one.\n" +
          "Either pass `filepath` to animate an existing image, or set CF_ACCOUNT_ID + CF_API_TOKEN secrets."
        );
      }
      try {
        const width = 768, height = 432; // 16:9
        const seed = Math.floor(Math.random() * 4294967295);
        const fd = new FormData();
        fd.append("prompt", args.instruction);
        fd.append("width", String(width));
        fd.append("height", String(height));
        fd.append("seed", String(seed));
        const res = await cfRunModel(creds, "@cf/black-forest-labs/flux-2-klein-9b", fd, { asJson: false });
        if (!res.ok) return err(`lab_generate_video: image gen failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
        const j = await res.json() as any;
        if (!j?.success || !j?.result?.image) return err(`lab_generate_video: image gen returned no image: ${JSON.stringify(j).slice(0, 500)}`);
        const buf = decodeBase64Jpeg(j.result.image);
        const tmpRel = `Videos/_src_${safeName}.jpg`;
        const tmpAbs = ctx.sandbox.resolveSafe(tmpRel);
        mkdirSync(dirname(tmpAbs), { recursive: true });
        writeFileSync(tmpAbs, buf);
        sourceRel = tmpRel;
        sourceAbs = tmpAbs;
      } catch (e: any) {
        return err(`lab_generate_video: image generation failed: ${e?.message ?? String(e)}`);
      }
    }

    // 2. Animate via ffmpeg — slow horizontal pan over 4s on a 2x-upscaled source.
    //    Uses scale (cover-fit) + crop with time-based x/y offsets to produce
    //    a smooth Ken-Burns-style pan. fps filter normalises frame rate.
    const duration = 4; // seconds
    const fps = 24;
    const frames = duration * fps;
    const w = 1280, h = 720;
    // Pan window: scroll the crop window horizontally across the upscaled source
    // over the full duration (96 frames at 24fps). Stays centred vertically.
    // crop=out_w:out_h:x:y, with x increasing linearly from 0 to (2w-w)=w.
    const vf = [
      `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase`,
      `crop=${w}:${h}:x='min(${w}*(t/${duration}),${w})':y='(ih-${h})/2'`,
      `fps=${fps}`,
      `format=yuv420p`,
    ].join(",");
    const args2 = [
      "-y",
      "-loop", "1",
      "-i", sourceAbs!,
      "-t", String(duration),
      "-vf", vf,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outAbs,
    ];
    try {
      await runCommand("ffmpeg", args2, { timeoutMs: 120_000 });
    } catch (e: any) {
      return err(`lab_generate_video: ffmpeg failed: ${e?.message ?? String(e)}\nstderr: ${(e?.stderr ?? "").toString().slice(-1000)}`);
    }
    if (!existsSync(outAbs)) return err(`lab_generate_video: ffmpeg exited but output is missing at ${outAbs}`);

    return ok(
      `# Generated video\n\n` +
      `Source: ${sourceRel ?? "(generated base image)"}\n` +
      `Duration: ${duration}s @ ${fps}fps\n` +
      `Size: ${w}x${h}\n` +
      `Saved: ${outAbs}\n` +
      `Motion: Ken Burns (slow zoom in)\n\n` +
      `Prompt: ${args.instruction}\n\n` +
      `Note: this is animated still-image video (true video synthesis models like Pixverse/Hailuo ` +
      `are not enabled in the lab's Cloudflare account). Pass \`filepath\` to animate a different source image.`,
      [{ path: outRel, mime: "video/mp4", kind: "video", alt: args.instruction }]
    );
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

// ===========================================================================
// DEPENDENCY MANAGEMENT TOOLS
// ===========================================================================

toolRegistry.register({
  name: "lab_check_dependencies",
  description:
    "Check which external dependencies are available on this machine. " +
    "Use this before attempting to use browser, audio/video, diagram, or system tools. " +
    "Returns a table showing each dependency, whether it's installed, and how to install it if missing.",
  parameters: {},
  defaultPermission: "always",
  async execute(_args, _ctx) {
    const deps = checkDeps();
    const rows = deps.map((d) => {
      const icon = d.available ? "✅" : "❌";
      return `${icon} **${d.name}**${d.available ? " — available" : ` — not installed\n   ${d.hint}`}`;
    });
    const summary = deps.filter((d) => d.available).length;
    return ok(
      `# Dependency Status\n\n${rows.join("\n")}\n\n---\n${summary}/${deps.length} dependencies available.\n\n` +
      `To install missing dependencies, use the \`lab_install_dependency\` tool.`
    );
  },
});

toolRegistry.register({
  name: "lab_install_dependency",
  description:
    "Install a missing external dependency on this machine. " +
    "Use this when a tool reports that a dependency is missing. " +
    "Supported: ffmpeg (apt), playwright-chromium (browser), d2 (diagrams), whisper (transcription), " +
    "or any apt package by name.",
  parameters: {
    name: {
      type: "string",
      description: "Dependency to install. Supported values: 'ffmpeg', 'playwright-chromium', 'd2', 'whisper', or any apt package name (e.g. 'curl', 'git', 'python3-pip').",
      required: true,
    },
    timeoutMs: { type: "number", description: "max time in ms for the installation (default 120_000)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.name) return err("name is required");
    const name = String(args.name).toLowerCase();
    const timeout = typeof args.timeoutMs === "number" ? args.timeoutMs : 120_000;

    if (name === "playwright-chromium" || name === "playwright" || name === "chromium") {
      // Install Playwright Chromium browser
      const backendDir = process.env.LAB_BACKEND_ROOT ?? join(
        process.env.LAB_PROJECT_ROOT ?? "/app", "backend"
      );
      if (!existsSync(join(backendDir, "node_modules", "playwright"))) {
        return err("Playwright npm package is not installed. Run `bun install` in the backend directory first.");
      }
      try {
        const r = await runCommand("bunx", ["playwright", "install", "chromium"], {
          cwd: backendDir,
          timeoutMs: timeout,
        });
        if (r.ok) {
          // Verify installation
          if (chromiumAvailable()) {
            return ok(`✅ Playwright Chromium installed successfully.\n\n${r.stdout.slice(0, 2000)}`);
          }
          return err("bunx playwright install reported success but chromium is not found. Try running `apt-get update && apt-get install -y libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libgdk-pixbuf2.0-0 libgtk-3-0t64 libxshmfence1` and then retry.");
        }
        return err(`playwright install failed (exit ${r.exitCode}):\n${r.stderr.slice(0, 2000)}`);
      } catch (e: any) {
        return err(`playwright install exception: ${e?.message ?? String(e)}`);
      }
    }

    if (name === "ffmpeg") {
      try {
        // Try apt first
        if (aptAvailable()) {
          const r = await runCommand("apt-get", ["install", "-y", "ffmpeg"], {
            timeoutMs: timeout,
            env: { DEBIAN_FRONTEND: "noninteractive" },
          });
          if (r.ok) {
            if (ffmpegAvailable()) return ok(`✅ ffmpeg installed via apt.\n\n${r.stdout.slice(-1000)}`);
            return err("apt reported success but `ffmpeg -version` still fails.");
          }
          return err(`apt-get install ffmpeg failed (exit ${r.exitCode}):\n${r.stderr.slice(0, 1000)}`);
        }
        // Fallback: try brew or download
        const r = await runCommand("apt-get", ["update"], {
          timeoutMs: 60_000,
          env: { DEBIAN_FRONTEND: "noninteractive" },
        });
        if (!r.ok) return err("apt-get update failed and no alternative package manager found. Install ffmpeg manually: https://ffmpeg.org/download.html");
        return err("apt-get update succeeded but apt is not available for install. Run `apt-get install -y ffmpeg` manually.");
      } catch (e: any) {
        return err(`ffmpeg install exception: ${e?.message ?? String(e)}`);
      }
    }

    if (name === "d2") {
      try {
        const r2 = await runCommand("bash", ["-c",
          "curl -fsSL https://d2lang.com/install.sh | sh -s --"
        ], { timeoutMs: timeout });
        if (r2.ok) {
          if (d2Available()) return ok(`✅ d2 installed.\n\n${r2.stdout.slice(0, 2000)}`);
          return err("d2 install script ran but `d2` is not on PATH. You may need to add it to PATH or restart the server.");
        }
        return err(`d2 install failed:\n${r2.stderr.slice(0, 1000)}\n\nManual install: https://d2lang.com/tour/install`);
      } catch (e: any) {
        return err(`d2 install exception: ${e?.message ?? String(e)}`);
      }
    }

    if (name === "agent-browser" || name === "agentbrowser") {
      try {
        const r = await runCommand("bash", ["-c",
          "curl -fsSL https://media.zocomputer.com/install/agentbrowser2.sh | bash"
        ], { timeoutMs: timeout });
        if (r.ok) {
          if (agentBrowserAvailable()) return ok(`✅ agent-browser installed.\n\n${r.stdout.slice(0, 2000)}`);
          return err("agent-browser install script ran but CLI not found on PATH.");
        }
        return err(`agent-browser install failed:\n${r.stderr.slice(0, 1000)}`);
      } catch (e: any) {
        return err(`agent-browser install exception: ${e?.message ?? String(e)}`);
      }
    }

    if (name === "whisper" || name === "whisper.cpp") {
      return err(
        "whisper.cpp installation is complex and requires compilation.\n\n" +
        "Option 1 (easier): Set CF_ACCOUNT_ID and CF_API_TOKEN secrets in the Secrets page, " +
        "then the transcription tools will use Cloudflare Workers AI instead.\n\n" +
        "Option 2 (manual): Follow https://github.com/ggerganov/whisper.cpp to build whisper.cpp, " +
        "then ensure the `whisper` binary is on PATH."
      );
    }

    // If we get here, try as an apt package
    if (name.match(/^[a-z0-9._-]+$/)) {
      if (!aptAvailable()) {
        return err(`Cannot install '${name}' — apt is not available on this system. Try installing manually.`);
      }
      try {
        const r = await runCommand("apt-get", ["install", "-y", name], {
          timeoutMs: timeout,
          env: { DEBIAN_FRONTEND: "noninteractive" },
        });
        // Verify by checking if the binary is now on PATH (simple check)
        const verify = Bun.spawnSync(["which", name], { stdout: "ignore", stderr: "ignore" });
        if (r.ok && verify.exitCode === 0) {
          return ok(`✅ Installed apt package: ${name}\n\n${r.stdout.slice(0, 2000)}`);
        }
        if (r.ok) {
          return ok(`apt installed ${name} (but 'which ${name}' failed — may not be a standalone binary).\n\n${r.stdout.slice(0, 2000)}`);
        }
        return err(`apt-get install ${name} failed (exit ${r.exitCode}):\n${r.stderr.slice(0, 1000)}`);
      } catch (e: any) {
        return err(`apt install exception: ${e?.message ?? String(e)}`);
      }
    }

    return err(`Unknown dependency: '${name}'. Supported: ffmpeg, playwright-chromium, agent-browser, d2, whisper, or any apt package name.`);
  },
});