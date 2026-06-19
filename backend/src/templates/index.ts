/**
 * Agent Templates — pre-baked agent configurations users can spin up with
 * one click. Templates live as JSON files in src/templates/builtin/, and
 * can also be created by users (saved to the database).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;            // e.g. "research", "engineering", "data", "writing"
  icon: string;                // lucide icon name
  tags: string[];
  systemMd: string;
  personaMd: string;
  toolsMd: string;
  skillsMd: string;
  memoryMd: string;
  config: {
    provider: string;
    baseUrl?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    permissions?: Record<string, string>;
    sandbox?: { timeoutMs?: number; maxOutputBytes?: number; allowHosts?: string[]; denyHosts?: string[] };
    mcpServers?: string[];
  };
  recommendedSkills: string[]; // skill ids to install
}

const BUILTIN_DIR = resolve(import.meta.dir, "builtin");

export const Templates = {
  list(): AgentTemplate[] {
    const out: AgentTemplate[] = [];
    if (existsSync(BUILTIN_DIR)) {
      for (const f of readdirSync(BUILTIN_DIR)) {
        if (!f.endsWith(".json")) continue;
        try {
          const raw = readFileSync(join(BUILTIN_DIR, f), "utf8");
          out.push(JSON.parse(raw));
        } catch {}
      }
    }
    // user-saved templates
    const rows = db.query(`SELECT * FROM agent_templates ORDER BY created_at DESC`).all() as any[];
    for (const r of rows) {
      try {
        out.push({
          id: r.id, name: r.name, description: r.description, category: r.category,
          icon: r.icon, tags: JSON.parse(r.tags ?? "[]"),
          systemMd: r.system_md, personaMd: r.persona_md, toolsMd: r.tools_md,
          skillsMd: r.skills_md, memoryMd: r.memory_md,
          config: JSON.parse(r.config_json),
          recommendedSkills: JSON.parse(r.recommended_skills ?? "[]"),
        });
      } catch {}
    }
    return out;
  },

  get(id: string): AgentTemplate | null {
    return Templates.list().find((t) => t.id === id) ?? null;
  },

  saveUser(input: { ownerId: string; name: string; description: string; category: string; icon: string; tags: string[]; template: Omit<AgentTemplate, "id"> }): AgentTemplate {
    const id = `tpl_${nanoid(10)}`;
    db.query(
      `INSERT INTO agent_templates (id, owner_id, name, description, category, icon, tags, system_md, persona_md, tools_md, skills_md, memory_md, config_json, recommended_skills, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, input.ownerId, input.name, input.description, input.category, input.icon,
      JSON.stringify(input.tags), input.template.systemMd, input.template.personaMd,
      input.template.toolsMd, input.template.skillsMd, input.template.memoryMd,
      JSON.stringify(input.template.config),
      JSON.stringify(input.template.recommendedSkills), Date.now()
    );
    return Templates.get(id)!;
  },

  deleteUser(id: string, ownerId: string): boolean {
    return db.query(`DELETE FROM agent_templates WHERE id = ? AND owner_id = ?`).run(id, ownerId).changes > 0;
  },

  /** Apply a template to a fresh agent directory + record metadata. */
  materialize(templateId: string, agentId: string) {
    const t = Templates.get(templateId);
    if (!t) throw new Error(`template not found: ${templateId}`);
    return t;
  },
};
