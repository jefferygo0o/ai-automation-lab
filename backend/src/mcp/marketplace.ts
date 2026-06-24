/**
 * MCP Marketplace — curated catalog of well-known MCP servers users can
 * install with one click.
 *
 * Sources we tried to integrate with:
 *   - https://mcp.so (no public API; site requires scraping)
 *   - https://glama.ai/mcp/servers (no public API)
 *   - https://www.pulsemcp.com/servers (no public API)
 *   - https://github.com/modelcontextprotocol/servers (curated upstream list)
 *
 * Decision: ship a hand-curated, pre-validated catalog. Each entry has been
 * sanity-checked (real npm packages, real commands, real env requirements).
 * No scraping — keeps the install path reliable.
 *
 * Categories: dev, browser, data, knowledge, productivity, infra, search.
 *
 * Each entry's `command` runs through npm/uvx; users may need to set
 * `envVars` before the server will start. We surface that requirement
 * to the UI so users know.
 */

export type McpCategory =
  | "dev"
  | "browser"
  | "data"
  | "knowledge"
  | "productivity"
  | "infra"
  | "search";

export interface McpMarketplaceEntry {
  /** Stable id (slug) used by the install endpoint. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Longer description for the detail panel. */
  longDescription?: string;
  /** Categories. */
  categories: McpCategory[];
  /** npm-style popularity indicator 0–5. */
  stars: number;
  /** Homepage or npm link. */
  homepage?: string;
  /** Install command (runnable from a shell, no secrets). */
  command: string;
  /** Args passed to the command. */
  args: string[];
  /** Environment variables the user must set before the server will work. */
  envVars?: Array<{ name: string; description: string; required: boolean; example?: string }>;
  /** Icon (emoji). */
  icon: string;
  /** Free-form tags. */
  tags: string[];
}

export const MCP_MARKETPLACE: McpMarketplaceEntry[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read, write, and search files on the local filesystem.",
    longDescription:
      "Official MCP server that gives agents safe, sandbox-aware access to the filesystem. Useful for code review, refactors, and project exploration.",
    categories: ["dev", "data"],
    stars: 4.8,
    homepage: "https://github.com/modelcontextprotocol/servers",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    envVars: [],
    icon: "📁",
    tags: ["files", "official", "stdio"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Browse repos, issues, PRs, and file contents on GitHub.",
    longDescription:
      "Official MCP server for the GitHub API. Agents can search code, open and review issues, and read PR diffs.",
    categories: ["dev"],
    stars: 4.7,
    homepage: "https://github.com/modelcontextprotocol/servers",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envVars: [
      {
        name: "GITHUB_PERSONAL_ACCESS_TOKEN",
        description: "Personal access token with repo scope.",
        required: true,
        example: "ghp_xxxxxxxxxxxxxxxxxxxx",
      },
    ],
    icon: "🐙",
    tags: ["git", "official", "api"],
  },
  {
    id: "git",
    name: "Git",
    description: "Local git history, diffs, blame, and log.",
    longDescription:
      "Read-only git introspection — log, diff, blame, status. Runs against any local repo path you point it at.",
    categories: ["dev"],
    stars: 4.3,
    command: "uvx",
    args: ["mcp-server-git", "--repository", "/home/workspace"],
    envVars: [],
    icon: "🔀",
    tags: ["git", "version-control"],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch web pages and convert to readable Markdown.",
    longDescription:
      "Crawl a URL, strip noise, return clean Markdown for the agent. Great for research and summarisation tasks.",
    categories: ["data", "browser"],
    stars: 4.5,
    command: "uvx",
    args: ["mcp-server-fetch"],
    envVars: [],
    icon: "🌐",
    tags: ["http", "scraping"],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via the Brave Search API.",
    longDescription:
      "Gives agents live web search with privacy-first results. Requires a Brave Search API key.",
    categories: ["search", "data"],
    stars: 4.4,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    envVars: [
      {
        name: "BRAVE_API_KEY",
        description: "Brave Search API subscription key.",
        required: true,
      },
    ],
    icon: "🦁",
    tags: ["search", "web"],
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Geocoding, directions, places, and distance matrix.",
    longDescription:
      "Official Google Maps MCP server. Useful for any agent that needs location lookups, route planning, or place search.",
    categories: ["data", "search"],
    stars: 4.2,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    envVars: [
      {
        name: "GOOGLE_MAPS_API_KEY",
        description: "Google Maps Platform API key.",
        required: true,
      },
    ],
    icon: "🗺️",
    tags: ["geo", "official"],
  },
  {
    id: "slack",
    name: "Slack",
    description: "List channels, post messages, read threads.",
    longDescription:
      "Official Slack MCP server. Read channels, post messages, search history.",
    categories: ["productivity"],
    stars: 4.4,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envVars: [
      {
        name: "SLACK_BOT_TOKEN",
        description: "Bot user OAuth token (xoxb-…).",
        required: true,
      },
      {
        name: "SLACK_TEAM_ID",
        description: "Slack workspace/team ID (T…).",
        required: true,
      },
    ],
    icon: "💬",
    tags: ["chat", "official"],
  },
  {
    id: "postgres",
    name: "Postgres",
    description: "Read-only SQL access to a PostgreSQL database.",
    longDescription:
      "Query a Postgres database with safe, schema-aware SELECT statements. Read-only by default.",
    categories: ["data", "infra"],
    stars: 4.3,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    envVars: [
      {
        name: "POSTGRES_URL",
        description: "Connection string, e.g. postgres://user:pass@host:5432/db.",
        required: true,
      },
    ],
    icon: "🐘",
    tags: ["sql", "database"],
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Query and inspect a local SQLite database file.",
    longDescription:
      "Run SELECT statements against a local SQLite file. Useful for analysis agents.",
    categories: ["data"],
    stars: 4.1,
    command: "uvx",
    args: ["mcp-server-sqlite", "--db-path", "/tmp/test.db"],
    envVars: [],
    icon: "🗃️",
    tags: ["sql", "database"],
  },
  {
    id: "memory",
    name: "Knowledge Graph Memory",
    description: "Persistent entity/relation memory for agents.",
    longDescription:
      "Official knowledge-graph memory server — agents can store entities and relations and query them later.",
    categories: ["knowledge"],
    stars: 4.6,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    envVars: [],
    icon: "🧠",
    tags: ["memory", "official", "knowledge-graph"],
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Headless browser automation: click, type, screenshot.",
    longDescription:
      "Official Puppeteer-based MCP server. Drives a headless Chrome — navigate, interact, take screenshots.",
    categories: ["browser", "dev"],
    stars: 4.5,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    envVars: [],
    icon: "🎭",
    tags: ["browser", "automation"],
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Step-by-step reasoning server for complex tasks.",
    longDescription:
      "Breaks problems into explicit sequential thought steps. Useful for planning-heavy agents.",
    categories: ["knowledge"],
    stars: 4.4,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    envVars: [],
    icon: "🧩",
    tags: ["reasoning", "official"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read, search, and write to Notion pages and databases.",
    longDescription:
      "Community Notion MCP. Search across the workspace, read pages, append blocks.",
    categories: ["productivity", "knowledge"],
    stars: 4.2,
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envVars: [
      {
        name: "NOTION_TOKEN",
        description: "Notion integration secret (secret_…).",
        required: true,
      },
    ],
    icon: "📝",
    tags: ["notes", "docs"],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, and cycles from Linear.",
    longDescription:
      "Read and create Linear issues, list projects, view cycles.",
    categories: ["productivity"],
    stars: 4.1,
    command: "npx",
    args: ["-y", "@linear/mcp-server"],
    envVars: [
      {
        name: "LINEAR_API_KEY",
        description: "Linear personal API key.",
        required: true,
      },
    ],
    icon: "📐",
    tags: ["project-management"],
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Inspect Sentry errors, releases, and projects.",
    longDescription:
      "Read Sentry issues, releases, and stacktraces. Useful for on-call agents.",
    categories: ["infra", "dev"],
    stars: 4.0,
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    envVars: [
      {
        name: "SENTRY_AUTH_TOKEN",
        description: "Sentry user auth token.",
        required: true,
      },
    ],
    icon: "🛰️",
    tags: ["observability", "errors"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Workers, KV, R2, DNS, and tunnels via the Cloudflare API.",
    longDescription:
      "Manage Cloudflare resources — list/inspect Workers, KV namespaces, R2 buckets, DNS records.",
    categories: ["infra"],
    stars: 4.0,
    command: "npx",
    args: ["-y", "@cloudflare/mcp-server-cloudflare"],
    envVars: [
      {
        name: "CLOUDFLARE_API_TOKEN",
        description: "Cloudflare API token with appropriate scopes.",
        required: true,
      },
    ],
    icon: "☁️",
    tags: ["cloud", "hosting"],
  },
  {
    id: "redis",
    name: "Redis",
    description: "GET, SET, LIST, HSET on a Redis instance.",
    longDescription:
      "Read/write keys, list hashes, scan sets. Useful for cache-aware agents.",
    categories: ["data", "infra"],
    stars: 4.1,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-redis"],
    envVars: [
      {
        name: "REDIS_URL",
        description: "Redis connection URL, e.g. redis://localhost:6379.",
        required: true,
      },
    ],
    icon: "🔴",
    tags: ["cache", "key-value"],
  },
  {
    id: "context7",
    name: "Context7",
    description: "Up-to-date library docs and code examples.",
    longDescription:
      "Fetches version-specific documentation and code snippets for popular libraries. Great for agents that need current API surface, not stale training data.",
    categories: ["knowledge", "dev"],
    stars: 4.6,
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    envVars: [],
    icon: "📚",
    tags: ["docs", "research"],
  },
  {
    id: "everything",
    name: "Everything",
    description: "Reference server with a wide tool surface (for testing).",
    longDescription:
      "Reference / test MCP server that exposes many tools. Useful for trying out MCP integration without a real upstream service.",
    categories: ["dev"],
    stars: 3.8,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    envVars: [],
    icon: "🧪",
    tags: ["reference", "testing"],
  },
  {
    id: "openai-websearch",
    name: "OpenAI Web Search",
    description: "Search the live web via the OpenAI Responses API.",
    longDescription:
      "Hosted MCP that uses the OpenAI Responses API's web_search tool. Requires an OpenAI API key.",
    categories: ["search", "data"],
    stars: 4.0,
    command: "npx",
    args: ["-y", "@openai/mcp-web-search"],
    envVars: [
      {
        name: "OPENAI_API_KEY",
        description: "OpenAI API key.",
        required: true,
      },
    ],
    icon: "🔎",
    tags: ["search", "openai"],
  },
];

/** Map marketplace entry IDs to Pipedream app slugs for OAuth/credentials. */
export const MCP_TO_PIPEDREAM_MAP: Record<string, string> = {
  "cloudflare": "cloudflare",
  "github": "github",
  "slack": "slack",
  "notion": "notion",
  "linear": "linear",
  "sentry": "sentry",
  "brave-search": "brave",
  "google-maps": "google_maps",
  "postgres": "postgres",
  "redis": "redis",
  "puppeteer": "puppeteer",
};

/** Look up a marketplace entry by id. */
export function findMarketplaceEntry(id: string): McpMarketplaceEntry | undefined {
  return MCP_MARKETPLACE.find((e) => e.id === id);
}