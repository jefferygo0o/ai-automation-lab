/**
 * Skills system.
 *
 * A skill is a markdown file with a YAML frontmatter:
 *
 *   ---
 *   id: email-outreach
 *   name: Email Outreach
 *   description: Find a lead, validate email, send intro.
 *   inputs:
 *     - name: leadUrl
 *       description: URL of lead's company site
 *       type: string
 *       required: true
 *   outputs:
 *     - type: object
 *       schema: { sentTo: string }
 *   mcp_required: [gmail]
 *   ---
 *
 *   # Email Outreach
 *
 *   ## Steps
 *   1. Find lead at the provided URL.
 *   2. Validate the email via NeverBounce (or fallback).
 *   3. Generate a 3-sentence intro using the agent's persona.
 *   4. Send via Gmail MCP.
 *
 * Skills live in two places:
 *   - User-defined:  data/skills/user/{userId}/{id}.md
 *   - Built-in:      src/skills/builtin/*.md (seeded on first run)
 *   - Global user skills (shared): data/skills/global/{id}.md
 *
 * The agent discovers skills by reading skills.md (an auto-generated index
 * in each agent's filesystem) and can call read_skill to pull the full body.
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, resolve, basename, extname, dirname } from "node:path";
import { nanoid } from "nanoid";
import { WorkspaceService } from "../workspace/index.ts";

export interface SkillFrontmatter {
  id: string;
  name: string;
  description: string;
  inputs?: SkillInput[];
  outputs?: SkillOutput[];
  mcp_required?: string[];
  tags?: string[];
}

export interface SkillInput {
  name: string;
  description: string;
  type?: string;
  required?: boolean;
  default?: unknown;
}

export interface SkillOutput {
  type: string;
  schema?: Record<string, unknown>;
}

export interface Skill extends SkillFrontmatter {
  body: string;
  source: "user" | "builtin";
  filename: string;
  updatedAt: number;
}

const SKILLS_ROOT = WorkspaceService.skillsRoot();

const BUILTIN_DIR = resolve(import.meta.dir, "builtin");
const GLOBAL_DIR = join(SKILLS_ROOT, "global");
const USERS_DIR = join(SKILLS_ROOT, "users");

function ensureDirs() {
  for (const d of [SKILLS_ROOT, GLOBAL_DIR, USERS_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

// Robust frontmatter parser. Skills may have been written by an LLM that
// accidentally doubled the `---` fence (e.g. when editing an already-formed
// skill). We tolerate that by treating the FIRST `---` line as the opener
// and the LAST `\n---` line at column 0 as the closer — anything in between
// is the YAML body, and the markdown body starts after the closer.
//
// We also normalise whitespace and reject files that don't yield a non-empty
// id+name pair so corrupted skills fail loudly rather than silently being
// read as "no skill".
function parseFrontmatter(raw: string): { meta: SkillFrontmatter; body: string } {
  const empty: { meta: SkillFrontmatter; body: string } = {
    meta: { id: "", name: "", description: "" },
    body: raw,
  };
  if (!raw.startsWith("---")) return empty;

  // Find every `\n---` (a `---` line on its own) that is preceded by a
  // newline. Skip the opening `---` (which is at index 0). Take the LAST
  // such position so duplicated/embedded fences don't truncate the frontmatter.
  const closers: number[] = [];
  const re = /\n---\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    closers.push(m.index + 1); // position of the `-` in `---`
  }
  if (closers.length === 0) return empty;

  const closerIdx = closers[closers.length - 1];
  const fm = raw.slice(3, closerIdx).replace(/\n+$/, "").trim();
  let body = raw.slice(closerIdx + 3);
  body = body.replace(/^\n+/, "");

  // Strip any leading `---` + bare frontmatter block that the LLM accidentally
  // re-emitted above the body. (Defence-in-depth — the closer-finding above
  // already handles most cases, but if the body itself opens with `---name:`
  // we want to drop it so the agent never sees malformed YAML in its prompt.)
  body = body.replace(/^---\s*\n(?:[a-zA-Z_][\w-]*:[^\n]*\n)+---\s*\n?/, "");

  const meta = parseYaml(fm);
  return {
    meta: {
      id: String(meta.id ?? "").trim(),
      name: String(meta.name ?? "").trim(),
      description: String(meta.description ?? "").trim(),
      inputs: (meta.inputs as SkillInput[] | undefined) ?? [],
      outputs: (meta.outputs as SkillOutput[] | undefined) ?? [],
      mcp_required: (meta.mcp_required as string[] | undefined) ?? [],
      tags: (meta.tags as string[] | undefined) ?? [],
    },
    body,
  };
}

// Minimal YAML subset for frontmatter: scalars, [a, b] lists, and `- item`
// lists of scalars (used for `tags:` and `mcp_required:`). Deliberately
// not a full YAML parser — frontmatter in this codebase is constrained.
function parseYaml(fm: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const lines = fm.split("\n");
  let currentList: string[] | null = null;
  let currentItem: Record<string, unknown> | null = null;

  const flushItem = () => {
    if (currentItem && currentList) {
      currentList.push(Object.entries(currentItem).map(([k, v]) => `${k}: ${v}`).join("; "));
      currentItem = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;

    if (/^\s{2,}-\s/.test(line) || /^\t-\s/.test(line)) {
      // List item start
      flushItem();
      if (!currentList) currentList = [];
      const rest = line.replace(/^\s*-\s*/, "");
      const colon = rest.indexOf(":");
      if (colon > 0) {
        const k = rest.slice(0, colon).trim();
        const v = rest.slice(colon + 1).trim();
        currentItem = { [k]: v };
      } else {
        currentList.push(rest.trim());
        currentItem = null;
      }
      continue;
    }

    if (/^\s{4,}\S/.test(line) || /^\t\t\S/.test(line)) {
      // Continuation of current list item
      if (currentItem) {
        const colon = line.trim().indexOf(":");
        if (colon > 0) {
          const k = line.trim().slice(0, colon).trim();
          const v = line.trim().slice(colon + 1).trim();
          currentItem[k] = v;
        }
      } else if (currentList) {
        currentList.push(line.trim());
      }
      continue;
    }

    flushItem();
    if (currentList) {
      // We had a list and now hit a top-level key — flush the list under
      // whichever meta key holds the same array reference. (Single-list case.)
      for (const k of Object.keys(meta)) {
        if (meta[k] === currentList) {
          meta[k] = currentList;
        }
      }
      currentList = null;
    }

    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (v === "" || v === "|") {
      meta[k] = [];
      currentList = meta[k] as unknown as string[];
    } else if (v.startsWith("[") && v.endsWith("]")) {
      meta[k] = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      meta[k] = v;
    }
  }
  flushItem();
  if (currentList && currentList.length) {
    for (const k of Object.keys(meta)) {
      if (meta[k] === currentList) meta[k] = currentList;
    }
  }
  return meta;
}

function readSkillFile(path: string, source: "user" | "builtin"): Skill | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  if (!meta.id || !meta.name) return null;
  return {
    ...meta,
    body,
    source,
    filename: basename(path),
    updatedAt: statSync(path).mtimeMs,
  };
}

function renderSkillFile(meta: SkillFrontmatter, body: string): string {
  const lines: string[] = ["---", `id: ${meta.id}`, `name: ${meta.name}`, `description: ${meta.description}`];
  if (meta.tags?.length) lines.push(`tags: [${meta.tags.join(", ")}]`);
  if (meta.mcp_required?.length) lines.push(`mcp_required: [${meta.mcp_required.join(", ")}]`);
  if (meta.inputs?.length) {
    lines.push("inputs:");
    for (const i of meta.inputs) {
      lines.push(`  - name: ${i.name}`);
      lines.push(`    description: ${i.description}`);
      if (i.type) lines.push(`    type: ${i.type}`);
      if (i.required != null) lines.push(`    required: ${i.required}`);
      if (i.default != null) lines.push(`    default: ${JSON.stringify(i.default)}`);
    }
  }
  lines.push("---", "", body);
  return lines.join("\n");
}

function skillFilePath(scope: "user" | "global", userId: string, id: string): string {
  if (scope === "global") return join(GLOBAL_DIR, `${id}.md`);
  return join(USERS_DIR, userId, `${id}.md`);
}

export const Skills = {
  init() {
    ensureDirs();
  },

  /** Seed built-in skills into the global directory so users can edit/clone them. */
  seedUserSkills() {
    ensureDirs();
    try {
      if (!existsSync(BUILTIN_DIR)) return;
      for (const file of readdirSync(BUILTIN_DIR)) {
        if (extname(file) !== ".md") continue;
        const src = join(BUILTIN_DIR, file);
        const dest = join(GLOBAL_DIR, file);
        if (!existsSync(dest)) {
          copyFileSync(src, dest);
        }
      }
    } catch (e) {
      console.warn("[skills] seed failed:", e);
    }
  },

  list(): Skill[] {
    ensureDirs();
    const out: Skill[] = [];
    if (existsSync(GLOBAL_DIR)) {
      for (const file of readdirSync(GLOBAL_DIR)) {
        if (extname(file) !== ".md") continue;
        const s = readSkillFile(join(GLOBAL_DIR, file), "user");
        if (s) out.push(s);
      }
    }
    if (existsSync(BUILTIN_DIR)) {
      for (const file of readdirSync(BUILTIN_DIR)) {
        if (extname(file) !== ".md") continue;
        const s = readSkillFile(join(BUILTIN_DIR, file), "builtin");
        if (s) out.push(s);
      }
    }
    const seen = new Set<string>();
    return out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  read(id: string): Skill | null {
    const all = Skills.list();
    return all.find((s) => s.id === id) ?? null;
  },

  readBody(id: string): string | null {
    const s = Skills.read(id);
    return s ? s.body : null;
  },

  /** Per-user private skills (in data/skills/users/{userId}/). */
  listForUser(userId: string): Skill[] {
    ensureDirs();
    const dir = join(USERS_DIR, userId);
    if (!existsSync(dir)) return [];
    const out: Skill[] = [];
    for (const file of readdirSync(dir)) {
      if (extname(file) !== ".md") continue;
      const raw = readFileSync(join(dir, file), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      if (!meta.id || !meta.name) continue;
      out.push({ ...meta, body, source: "user", filename: basename(file), updatedAt: statSync(join(dir, file)).mtimeMs });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  readForUser(userId: string, id: string): Skill | null {
    const path = skillFilePath("user", userId, id);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    if (!meta.id || !meta.name) return null;
    return { ...meta, body, source: "user", filename: basename(path), updatedAt: statSync(path).mtimeMs };
  },

  /**
   * Owner-aware skill lookup. Falls through: global → builtin → user-owned.
   * Use this from the runtime and from tools so an agent always sees its
   * owner's private skills (not just the platform-installed ones).
   */
  readForOwner(id: string, ownerId: string | null): Skill | null {
    const global = Skills.read(id);
    if (global) return global;
    if (ownerId) {
      const user = Skills.readForUser(ownerId, id);
      if (user) return user;
    }
    return null;
  },

  /**
   * Owner-aware listing. Used by the runtime prompt and by `list_skills`
   * so an agent sees its owner's private skills in addition to platform
   * skills. Deduplicates by id, with user skills shadowing global ones
   * (so a user can override a platform skill with their own copy).
   */
  listForOwner(ownerId: string | null): Skill[] {
    const platform = Skills.list();
    if (!ownerId) return platform;
    const user = Skills.listForUser(ownerId);
    const byId = new Map<string, Skill>();
    for (const s of platform) byId.set(s.id, s);
    for (const s of user) byId.set(s.id, s); // user shadows platform
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  },

  saveUser(
    userId: string,
    id: string,
    name: string,
    body: string,
    meta: Partial<SkillFrontmatter> = {},
  ): Skill {
    ensureDirs();
    const dir = join(USERS_DIR, userId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fm: SkillFrontmatter = {
      id,
      name,
      description: meta.description ?? "",
      inputs: meta.inputs ?? [],
      outputs: meta.outputs ?? [],
      mcp_required: meta.mcp_required ?? [],
      tags: meta.tags ?? [],
    };
    writeFileSync(skillFilePath("user", userId, id), renderSkillFile(fm, body), "utf8");
    return Skills.readForUser(userId, id)!;
  },

  deleteUser(userId: string, id: string): boolean {
    const path = skillFilePath("user", userId, id);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  },

  cloneForUser(userId: string, sourceId: string, newId?: string): Skill | null {
    const src = Skills.read(sourceId);
    if (!src) return null;
    const id = newId ?? `${sourceId}-${nanoid(6).toLowerCase()}`;
    return Skills.saveUser(userId, id, src.name, src.body, src);
  },

  /** Render a compact markdown index for the agent's skills.md. */
  renderIndex(): string {
    const list = Skills.list();
    let out = "# Skills Index\n\n";
    out += "This is an auto-generated index. To load a full skill, use the `read_skill` tool with the `skillId`.\n\n";
    for (const s of list) {
      out += `## ${s.name} (id: \`${s.id}\`)\n`;
      out += `${s.description}\n`;
      if (s.inputs?.length) {
        out += `\n**Inputs:** ${s.inputs.map((i) => `\`${i.name}\``).join(", ")}\n`;
      }
      if (s.mcp_required?.length) {
        out += `**MCP required:** ${s.mcp_required.join(", ")}\n`;
      }
      out += "\n---\n\n";
    }
    return out;
  },
};

// keep exports referenced
void dirname;
