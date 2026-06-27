/**
 * Lab Management Tools.
 *
 * These tools give any agent the ability to manage the lab's own resources:
 *   - Skills        (create, edit, delete, list, read, clone)
 *   - Automations   (create, edit, delete, list, toggle)
 *   - MCP servers   (create, edit, delete, list, connect, disconnect)
 *   - Browser       (navigate, read, screenshot, search)
 *
 * Imported in main.ts alongside builtin.ts and skill_tools.ts.
 */

import { toolRegistry, type ToolContext } from "./registry.ts";
import { Skills } from "../skills/index.ts";
import { db } from "../db/index.ts";
import { McpStore, mcpManager } from "../mcp/client.ts";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { SiteStore } from "../sites/store.ts";
import { ServiceStore } from "../services/store.ts";
import { startService, stopService, restartService, getServiceLogs } from "../sites/supervisor.ts";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

/** Fetch a URL and extract readable text content. */
async function readWebpage(url: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
    });
    const html = await res.text();
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
    const maxLen = 32_000;
    return cleaned.length > maxLen
      ? cleaned.slice(0, maxLen) + `\n\n... (truncated, ${cleaned.length} total chars)`
      : cleaned;
  } finally {
    clearTimeout(timer);
  }
}

/** Playwright-based screenshot capture. Returns a base64 PNG data URI. */
async function playwrightScreenshot(url: string, fullPage = true): Promise<string> {
  // Check if Chromium browser is installed before attempting to launch
  {
    const home = process.env.HOME || "/root";
    const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH || join(home, ".cache", "ms-playwright");
    const { existsSync, readdirSync } = await import("node:fs");
    const hasChromium = existsSync(cacheDir) && readdirSync(cacheDir).some(e => e.startsWith("chromium"));
    if (!hasChromium) {
      throw new Error(
        "Playwright Chromium browser is not installed. " +
        "Run a shell tool with: cd /app/backend && bun x playwright install chromium"
      );
    }
  }
  const script = join("/tmp", `screenshot_${nanoid(8)}.mjs`);
  const code = `
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(1000);
const buf = await page.screenshot({ type: "png", fullPage: ${fullPage} });
await browser.close();
process.stdout.write(buf.toString("base64"));
`;
  writeFileSync(script, code, "utf8");
  try {
    const proc = Bun.spawn(["bun", "run", script], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, DISPLAY: ":99", XDG_RUNTIME_DIR: "/tmp/runtime-root" },
    });
    const stdout = await Bun.readableStreamToText(proc.stdout);
    const stderr = await Bun.readableStreamToText(proc.stderr);
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`playwright screenshot failed (${exitCode}): ${stderr.slice(0, 500)}`);
    return `data:image/png;base64,${stdout.trim()}`;
  } finally {
    try { unlinkSync(script); } catch {}
  }
}

/** agent-browser CLI screenshot capture. Returns a base64 PNG data URI. */
async function agentBrowserScreenshot(url: string, fullPage = true): Promise<string> {
  const tmpFile = `/tmp/screenshot_${nanoid(8)}.png`;
  try {
    const fp = fullPage ? " --full-page" : "";
    const proc = Bun.spawn(["bash", "-c", `agent-browser open ${JSON.stringify(url)} && sleep 2 && agent-browser screenshot ${tmpFile}${fp}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await Bun.readableStreamToText(proc.stderr);
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`agent-browser failed (${exitCode}): ${stderr.slice(0, 500)}`);
    const buf = readFileSync(tmpFile);
    const b64 = buf.toString("base64");
    try { (await import("node:fs")).unlinkSync(tmpFile); } catch {}
    return `data:image/png;base64,${b64}`;
  } catch (e: any) {
    try { (await import("node:fs")).unlinkSync(tmpFile); } catch {}
    throw e;
  }
}

/** agent-browser CLI — open URL and extract text content. */
async function agentBrowserRead(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const proc = Bun.spawn(["bash", "-c", `agent-browser open ${JSON.stringify(url)} && sleep 2 && agent-browser get text body`], {
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });
    const stdout = await Bun.readableStreamToText(proc.stdout);
    const stderr = await Bun.readableStreamToText(proc.stderr);
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`agent-browser read failed (${exitCode}): ${stderr.slice(0, 500)}`);
    const cleaned = stdout
      .replace(/\s+/g, " ")
      .trim();
    const maxLen = 32_000;
    return cleaned.length > maxLen
      ? cleaned.slice(0, maxLen) + `\n\n... (truncated, ${cleaned.length} total chars)`
      : cleaned;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. SKILLS MANAGEMENT
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "manage_skills",
  description:
    "Manage the lab's skill library. Skills are reusable markdown procedures agents can execute. " +
    "Use action='list' to browse, 'read' to view body, 'create' to add, 'edit' to update, " +
    "'delete' to remove, or 'clone' to copy a skill.",
  parameters: {
    action: {
      type: "string",
      description: "operation to perform",
      required: true,
      enum: ["list", "read", "create", "edit", "delete", "clone"],
    },
    id: { type: "string", description: "skill id — required for read, edit, delete, clone", required: false },
    name: { type: "string", description: "skill display name — required for create", required: false },
    body: { type: "string", description: "full markdown procedure body — required for create", required: false },
    description: { type: "string", description: "short description of what the skill does", required: false },
    newId: { type: "string", description: "new id when cloning", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      switch (args.action) {
        case "list": {
          const all = Skills.list();
          const user = Skills.listForUser(userId);
          const lines = all.map((s) => {
            const tag = s.source === "builtin" ? " [built-in]" : "";
            return `- ${s.id}${tag}: ${s.name} — ${s.description || "(no desc)"}`;
          });
          if (user.length) {
            lines.push("\n--- Your custom skills ---");
            for (const s of user) lines.push(`- ${s.id}: ${s.name} — ${s.description || "(no desc)"}`);
          }
          return text(lines.join("\n") || "(no skills)");
        }
        case "read": {
          if (!args.id) return err("id required for read");
          const s = Skills.read(args.id) || Skills.readForUser(userId, args.id);
          if (!s) return err(`skill not found: ${args.id}`);
          return text(`id: ${s.id}\nname: ${s.name}\ndescription: ${s.description}\nsource: ${s.source}\n\n---\n\n${s.body}`);
        }
        case "create": {
          if (!args.id || !args.name || !args.body) return err("id, name, and body required for create");
          const skill = Skills.saveUser(userId, args.id, args.name, args.body, {
            description: args.description ?? "",
          });
          return text(`Created skill: ${skill.id} ("${skill.name}")`);
        }
        case "edit": {
          if (!args.id) return err("id required for edit");
          // Read existing, update fields
          const existing = Skills.readForUser(userId, args.id);
          if (!existing) return err(`your skill not found: ${args.id} (can only edit your own skills)`);
          const updated = Skills.saveUser(userId, args.id, args.name ?? existing.name, args.body ?? existing.body, {
            description: args.description ?? existing.description,
          });
          return text(`Updated skill: ${updated.id}`);
        }
        case "delete": {
          if (!args.id) return err("id required for delete");
          const ok = Skills.deleteUser(userId, args.id);
          if (!ok) return err(`skill not found or not deletable: ${args.id}`);
          return text(`Deleted skill: ${args.id}`);
        }
        case "clone": {
          if (!args.id) return err("source id required for clone");
          const cloned = Skills.cloneForUser(userId, args.id, args.newId);
          if (!cloned) return err(`source skill not found: ${args.id}`);
          return text(`Cloned ${args.id} → ${cloned.id} ("${cloned.name}")`);
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_skills failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// 2. AUTOMATIONS MANAGEMENT
// ---------------------------------------------------------------------------

function formatAutoRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    agentId: row.agent_id,
    rrule: row.rrule,
    instruction: row.prompt ?? "",
    active: row.active !== 0,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

toolRegistry.register({
  name: "manage_automations",
  description:
    "Create, read, update, delete, list, or toggle automations (scheduled agent tasks). " +
    "Use action='list' to browse, 'get' to view details, 'create' to add, 'edit' to update, " +
    "'delete' to remove, 'toggle' to pause/resume.",
  parameters: {
    action: {
      type: "string",
      description: "operation to perform",
      required: true,
      enum: ["list", "get", "create", "edit", "delete", "toggle"],
    },
    id: { type: "string", description: "automation id — required for get, edit, delete, toggle", required: false },
    name: { type: "string", description: "automation name — required for create", required: false },
    rrule: {
      type: "string",
      description: "RRULE schedule string (e.g. FREQ=DAILY;INTERVAL=1, FREQ=HOURLY;INTERVAL=1, FREQ=MINUTELY;INTERVAL=15)",
      required: false,
    },
    instruction: { type: "string", description: "the prompt/instruction the agent runs — required for create", required: false },
    agentId: { type: "string", description: "agent id to run — leave empty for default", required: false },
    active: { type: "boolean", description: "true = active, false = paused (for toggle/edit)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      switch (args.action) {
        case "list": {
          const rows = await db.query("SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC").all(userId) as any[];
          if (!rows.length) return text("(no automations)");
          const lines = rows.map((r) => {
            const a = formatAutoRow(r);
            return `- ${a.id}: ${a.name} [${a.active ? "ACTIVE" : "PAUSED"}] rrule=${a.rrule} agent=${a.agentId?.slice(0, 8) ?? "?"}`;
          });
          return text(lines.join("\n"));
        }
        case "get": {
          if (!args.id) return err("id required for get");
          const row = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(args.id, userId) as any;
          if (!row) return err("automation not found");
          const a = formatAutoRow(row);
          return text(
            `id: ${a.id}\nname: ${a.name}\nrrule: ${a.rrule}\nagentId: ${a.agentId}\nactive: ${a.active}\nlastRunAt: ${a.lastRunAt ? new Date(a.lastRunAt).toISOString() : "never"}\nlastError: ${a.lastError ?? "none"}\n\ninstruction:\n${a.instruction}`
          );
        }
        case "create": {
          if (!args.name || !args.instruction) return err("name and instruction required for create");
          const id = `auto_${nanoid()}`;
          const now = Date.now();
          const agentId = args.agentId ?? "";
          const rrule = args.rrule ?? "FREQ=DAILY;INTERVAL=1";
          await db.query(
            `INSERT INTO automations (id, owner_id, name, agent_id, rrule, prompt, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(id, userId, args.name, agentId, rrule, args.instruction, 1, now, now);
          return text(`Created automation: ${id} ("${args.name}") — ${rrule}`);
        }
        case "edit": {
          if (!args.id) return err("id required for edit");
          const existing = await db.query("SELECT * FROM automations WHERE id = ? AND owner_id = ?").get(args.id, userId) as any;
          if (!existing) return err("automation not found");
          const sets: string[] = [];
          const vals: any[] = [];
          if (args.name !== undefined) { sets.push("name = ?"); vals.push(args.name); }
          if (args.rrule !== undefined) { sets.push("rrule = ?"); vals.push(args.rrule); }
          if (args.instruction !== undefined) { sets.push("prompt = ?"); vals.push(args.instruction); }
          if (args.agentId !== undefined) { sets.push("agent_id = ?"); vals.push(args.agentId); }
          if (args.active !== undefined) { sets.push("active = ?"); vals.push(args.active ? 1 : 0); }
          if (sets.length === 0) return err("nothing to update");
          sets.push("updated_at = ?");
          vals.push(Date.now(), args.id, userId);
          await db.query(`UPDATE automations SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
          return text(`Updated automation: ${args.id}`);
        }
        case "delete": {
          if (!args.id) return err("id required for delete");
          const result = await db.query("DELETE FROM automations WHERE id = ? AND owner_id = ?").run(args.id, userId);
          return text(result.changes > 0 ? `Deleted automation: ${args.id}` : "automation not found");
        }
        case "toggle": {
          if (!args.id) return err("id required for toggle");
          const row = await db.query("SELECT active FROM automations WHERE id = ? AND owner_id = ?").get(args.id, userId) as any;
          if (!row) return err("automation not found");
          const newActive = args.active !== undefined ? (args.active ? 1 : 0) : row.active ? 0 : 1;
          await db.query("UPDATE automations SET active = ?, updated_at = ? WHERE id = ?").run(newActive, Date.now(), args.id);
          return text(`Toggled automation ${args.id}: ${newActive ? "ACTIVE" : "PAUSED"}`);
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_automations failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// 3. MCP SERVERS MANAGEMENT
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "manage_mcp_servers",
  description:
    "Manage MCP (Model Context Protocol) servers. MCP servers expose external tools to agents. " +
    "Use action='list' to browse, 'create' to add a server, 'edit' to update config, " +
    "'delete' to remove, 'connect' to start a server, 'disconnect' to stop it.",
  parameters: {
    action: {
      type: "string",
      description: "operation to perform",
      required: true,
      enum: ["list", "create", "edit", "delete", "connect", "disconnect"],
    },
    id: { type: "string", description: "server id — required for edit, delete, connect, disconnect", required: false },
    name: { type: "string", description: "server name — required for create", required: false },
    command: { type: "string", description: "executable command (e.g. 'npx', 'bun') — required for create", required: false },
    args: { type: "string", description: "space-separated arguments (e.g. '-y @modelcontextprotocol/server-gmail')", required: false },
    env: { type: "string", description: "optional JSON object of environment variables", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      switch (args.action) {
        case "list": {
          const servers = await McpStore.list();
          if (!servers.length) return text("(no MCP servers configured)");
          const lines = servers.map((s) => {
            return `- ${s.id}: ${s.name} [${s.connected ? "connected" : "disconnected"}] ${s.command} ${(s.args ?? []).join(" ")}`;
          });
          return text(lines.join("\n"));
        }
        case "create": {
          if (!args.name || !args.command) return err("name and command required for create");
          const parsedArgs = typeof args.args === "string" ? args.args.split(/\s+/).filter(Boolean) : (args.args ?? []);
          const parsedEnv = typeof args.env === "string" ? (() => { try { return JSON.parse(args.env); } catch { return {}; } })() : (args.env ?? {});
          const server = await McpStore.upsert({
            name: args.name,
            command: args.command,
            args: parsedArgs,
            env: parsedEnv,
          }, ctx.ownerId);
          return text(`Created MCP server: ${server.id} ("${server.name}") — ${server.command} ${(server.args ?? []).join(" ")}`);
        }
        case "edit": {
          if (!args.id) return err("id required for edit");
          const existing = await McpStore.get(args.id);
          if (!existing) return err("MCP server not found");
          const parsedArgs = typeof args.args === "string" ? args.args.split(/\s+/).filter(Boolean) : (args.args ?? existing.args);
          const parsedEnv = typeof args.env === "string" ? (() => { try { return JSON.parse(args.env); } catch { return {}; } })() : (args.env ?? existing.env);
          await McpStore.upsert({
            name: args.name ?? existing.name,
            command: args.command ?? existing.command,
            args: parsedArgs,
            env: parsedEnv,
          }, ctx.ownerId);
          return text(`Updated MCP server: ${args.id}`);
        }
        case "delete": {
          if (!args.id) return err("id required for delete");
          mcpManager.stopServer(args.id); // stop if running
          const ok = await McpStore.delete(args.id);
          return text(ok ? `Deleted MCP server: ${args.id}` : "MCP server not found");
        }
        case "connect": {
          if (!args.id) return err("id required for connect");
          const server = await McpStore.get(args.id);
          if (!server) return err("MCP server not found");
          await mcpManager.startServer({ name: server.name, command: server.command, args: server.args, env: server.env });
          return text(`Connected MCP server: ${server.name}`);
        }
        case "disconnect": {
          if (!args.id) return err("id required for disconnect");
          const server = await McpStore.get(args.id);
          if (!server) return err("MCP server not found");
          mcpManager.stopServer(server.name);
          return text(`Disconnected MCP server: ${server.name}`);
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_mcp_servers failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// 4. BROWSER (navigate, read, screenshot, search)
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "browser_navigate",
  description:
    "Navigate to a URL and read the page content as plain text. " +
    "Use this to read articles, documentation, or any public web page. " +
    "Set useBrowser=true to render JavaScript-heavy pages through agent-browser (slower but renders JS). " +
    "Default (useBrowser=false) uses direct fetch which is faster for static pages.",
  parameters: {
    url: {
      type: "string",
      description: "the full URL to visit (e.g. https://example.com/page)",
      required: true,
    },
    useBrowser: {
      type: "boolean",
      description: "use agent-browser for JS rendering (default false)",
      required: false,
    },
    timeoutMs: {
      type: "number",
      description: "timeout in ms (default 15000, or 20000 with useBrowser=true)",
      required: false,
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url || typeof args.url !== "string") return err("url is required");
    try {
      ctx.onLog({ tool: "browser_navigate", args, result: `navigating to ${args.url}`, ok: true, durationMs: 0, at: Date.now() });
      let content: string;
      if (args.useBrowser) {
        content = await agentBrowserRead(args.url, args.timeoutMs ?? 20_000);
      } else {
        content = await readWebpage(args.url, args.timeoutMs ?? 15_000);
      }
      return text(`# ${args.url}\n\n${content}`);
    } catch (e: any) {
      return err(`browser_navigate failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "browser_screenshot",
  description:
    "Open a URL in a headless browser and return a screenshot as a base64 data URI. " +
    "Use this for JavaScript-heavy pages, visual verification, or when browser_navigate can't render the content. " +
    "The screenshot is a PNG image — you can describe what you see. " +
    "Uses agent-browser CLI by default (faster), falls back to Playwright if agent-browser fails.",
  parameters: {
    url: {
      type: "string",
      description: "the full URL to screenshot",
      required: true,
    },
    fullPage: {
      type: "boolean",
      description: "capture full page (true) or viewport only (false)",
      required: false,
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.url || typeof args.url !== "string") return err("url is required");
    try {
      ctx.onLog({ tool: "browser_screenshot", args, result: `screenshotting ${args.url}`, ok: true, durationMs: 0, at: Date.now() });
      let dataUri: string;
      try {
        dataUri = await agentBrowserScreenshot(args.url, args.fullPage !== false);
      } catch {
        // Fallback to Playwright
        dataUri = await playwrightScreenshot(args.url, args.fullPage !== false);
      }
      return text(`Screenshot of ${args.url}\n\n![page screenshot](${dataUri})\n\n---\nFull-page: ${args.fullPage !== false}`);
    } catch (e: any) {
      return err(`browser_screenshot failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "web_search",
  description:
    "Search the web using Google. Returns a list of results with titles, snippets, and URLs. " +
    "Use this when you need current information, news, or to find specific pages. " +
    "For reading the actual page content, use browser_navigate on one of the result URLs.",
  parameters: {
    query: {
      type: "string",
      description: "the search query",
      required: true,
    },
    count: {
      type: "number",
      description: "number of results (default 5, max 10)",
      required: false,
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    if (!args.query || typeof args.query !== "string") return err("query is required");
    try {
      const count = Math.min(args.count ?? 5, 10);
      const url = `https://www.google.com/search?q=${encodeURIComponent(args.query)}&num=${count}`;
      const content = await readWebpage(url, 10_000);
      return text(`## Web search: "${args.query}"\n\n${content}`);
    } catch (e: any) {
      return err(`web_search failed: ${e?.message ?? String(e)}`);
    }
  },
});
// ---------------------------------------------------------------------------
// 7. SITES MANAGEMENT
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "manage_sites",
  description:
    "Create, list, get, and delete websites. Sites are standalone React/Vite projects with their own directory and zosite.json. " +
    "Use action='create' to scaffold a new site, 'list' to see all your sites, 'get' to view details, 'delete' to remove.",

  parameters: {
    action: {
      type: "string",
      description: "operation to perform",
      required: true,
      enum: ["list", "get", "create", "delete"],
    },
    name: {
      type: "string",
      description: "site name — required for create",
      required: false,
    },
    variant: {
      type: "string",
      description: "template variant: blank, blog, marketing, event, slides, data (default blank)",
      required: false,
    },
    id: {
      type: "string",
      description: "site id — required for get, delete",
      required: false,
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      switch (args.action) {
        case "list": {
          const sites = await SiteStore.list(userId);
          if (!sites.length) return text("(no sites)");
          const lines = sites.map((s) =>
            `- ${s.id}: ${s.name} (${s.variant}) [${s.devStatus}] slug=${s.slug}`
          );
          return text(lines.join("\n"));
        }
        case "get": {
          if (!args.id) return err("id required for get");
          const site = await SiteStore.get(args.id, userId);
          if (!site) return err("site not found");
          return text(
            `id: ${site.id}\nname: ${site.name}\nslug: ${site.slug}\nvariant: ${site.variant}\n` +
            `status: ${site.devStatus}\npublic: ${site.isPublic}\nrootDir: ${site.rootDir}\n` +
            `publishedServiceId: ${site.publishedServiceId ?? "(not published)"}`
          );
        }
        case "create": {
          if (!args.name) return err("name required for create");
          const site = await SiteStore.create(userId, args.name, args.variant || "blank");
          return text(
            `Created site: ${site.id} ("${site.name}")\nslug: ${site.slug}\nvariant: ${site.variant}\n` +
            `rootDir: ${site.rootDir}\n\n` +
            `The site directory has been scaffolded with:\n` +
            `- index.html, package.json, vite.config.ts, tsconfig.json\n` +
            `- src/main.tsx, src/App.tsx, src/index.css\n` +
            `- tailwind.config.js, postcss.config.js\n\n` +
            `Run \`manage_services action=create label="${site.name}" mode=http entrypoint="bun run dev" workdir=${site.rootDir}\` to start a dev server.`
          );
        }
        case "delete": {
          if (!args.id) return err("id required for delete");
          const ok = await SiteStore.delete(args.id, userId);
          if (!ok) return err("site not found");
          return text(`Deleted site: ${args.id}`);
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_sites failed: ${e?.message ?? String(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// 8. SERVICES MANAGEMENT
// ---------------------------------------------------------------------------

toolRegistry.register({
  name: "manage_services",
  description:
    "Create, list, start, stop, restart, and delete supervised services. " +
    "Services are long-running processes managed by the lab supervisor. " +
    "Modes: http (web service on $PORT), tcp (raw TCP), process (background, no port). " +
    "Use action='list' to see all services, 'create' to add, 'start'/'stop'/'restart' to control, " +
    "'get' for details, 'logs' to see output, 'delete' to remove.",

  parameters: {
    action: {
      type: "string",
      description: "operation to perform",
      required: true,
      enum: ["list", "get", "create", "delete", "start", "stop", "restart", "logs"],
    },
    id: { type: "string", description: "service id — required for get, start, stop, restart, delete, logs", required: false },
    label: { type: "string", description: "display label — required for create", required: false },
    mode: { type: "string", description: "http (web), tcp (raw), or process (background)", required: false },
    entrypoint: { type: "string", description: "command to run — required for create, e.g. 'bun run dev'", required: false },
    workdir: { type: "string", description: "working directory for the process", required: false },
    isPublic: { type: "string", enum: ["true", "false"], description: "whether http service is publicly accessible", required: false },
    envVars: { type: "string", description: "JSON object of environment variables e.g. '{\"PORT\":\"3000\"}'", required: false },
    tail: { type: "number", description: "number of log lines to return (default 100, for logs action)", required: false },
  },
  defaultPermission: "ask",
  async execute(args, ctx) {
    const userId = ctx.ownerId;
    try {
      switch (args.action) {
        case "list": {
          const services = await ServiceStore.list(userId);
          if (!services.length) return text("(no services)");
          const lines = services.map((s) =>
            `- ${s.id}: ${s.label} [${s.status}] (${s.mode}) port=${s.localPort} url=${s.httpUrl ? `/api/services/${s.id}/proxy/` : s.tcpAddr || "—"}`
          );
          return text(lines.join("\n"));
        }
        case "get": {
          if (!args.id) return err("id required for get");
          const svc = await ServiceStore.get(args.id, userId);
          if (!svc) return err("service not found");
          return text(
            `id: ${svc.id}\nlabel: ${svc.label}\nmode: ${svc.mode}\nstatus: ${svc.status}\n` +
            `entrypoint: ${svc.entrypoint}\nworkdir: ${svc.workdir}\n` +
            `localPort: ${svc.localPort}\nisPublic: ${svc.isPublic}\n` +
            `httpUrl: ${svc.httpUrl}\nproxyUrl: ${svc.httpUrl ? `/api/services/${svc.id}/proxy/` : "—"}\ntcpAddr: ${svc.tcpAddr}\n` +
            `customDomains: ${svc.customDomains.join(", ") || "none"}\n` +
            `restartCount: ${svc.restartCount}`
          );
        }
        case "create": {
          if (!args.label) return err("label required for create");
          if (!args.entrypoint) return err("entrypoint required for create");
          let envVars: Record<string, string> = {};
          if (args.envVars) {
            try { envVars = JSON.parse(args.envVars); } catch { return err("envVars must be valid JSON"); }
          }
          const svc = await ServiceStore.create(userId, {
            label: args.label,
            mode: args.mode || "http",
            entrypoint: args.entrypoint,
            workdir: args.workdir || "",
            isPublic: args.isPublic === "true",
            envVars,
          });
          return text(
            `Created service: ${svc.id} ("${svc.label}")\nmode: ${svc.mode}\nentrypoint: ${svc.entrypoint}\n\n` +
            `Run \`manage_services action=start id=${svc.id}\` to start it.`
          );
        }
        case "start": {
          if (!args.id) return err("id required for start");
          const svc = await ServiceStore.get(args.id, userId);
          if (!svc) return err("service not found");
          const result = await startService(args.id);
          if (!result.ok) return err(result.error || "start failed");
          const updated = await ServiceStore.get(args.id, userId);
          return text(`Started service: ${args.id} — url=${updated?.httpUrl || updated?.tcpAddr || "localhost"}`);
        }
        case "stop": {
          if (!args.id) return err("id required for stop");
          const svc = await ServiceStore.get(args.id, userId);
          if (!svc) return err("service not found");
          await stopService(args.id);
          return text(`Stopped service: ${args.id}`);
        }
        case "restart": {
          if (!args.id) return err("id required for restart");
          const svc = await ServiceStore.get(args.id, userId);
          if (!svc) return err("service not found");
          const result = await restartService(args.id);
          if (!result.ok) return err(result.error || "restart failed");
          return text(`Restarted service: ${args.id}`);
        }
        case "logs": {
          if (!args.id) return err("id required for logs");
          const svc = await ServiceStore.get(args.id, userId);
          if (!svc) return err("service not found");
          const tail = typeof args.tail === "number" ? args.tail : 100;
          const logs = getServiceLogs(args.id, tail);
          let out = `=== stdout (last ${tail} lines) ===\n${logs.stdout || "(empty)"}\n\n=== stderr (last ${tail} lines) ===\n${logs.stderr || "(empty)"}`;
          return text(out);
        }
        case "delete": {
          if (!args.id) return err("id required for delete");
          const svc = await ServiceStore.get(args.id, userId);
          if (!svc) return err("service not found");
          await stopService(args.id);
          await ServiceStore.delete(args.id, userId);
          return text(`Deleted service: ${args.id}`);
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_services failed: ${e?.message ?? String(e)}`);
    }
  },
});
