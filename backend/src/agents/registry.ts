/**
 * Agent registry — DB-backed metadata + filesystem-backed content.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import {
  ensureAgentDir,
  readAgentConfig,
  writeAgentConfig,
  writeAgentFile,
  readAgentFile,
  listAgentFiles,
  deleteAgent as deleteAgentFs,
  cloneAgent as cloneAgentFs,
  packAgent,
  unpackAgent,
  AGENTS_DIR,
  AGENT_FILE_NAMES,
  type AgentConfig,
} from "./files.ts";
import { recordHistory } from "./history.ts";
import { decryptSecret } from "../secrets/vault.ts";
import { rmSync } from "node:fs";

export interface AgentRecord {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  hash: string;
  runtime: string;
}

interface AgentRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  hash: string | null;
  runtime: string | null;
}

function rowToAgent(r: AgentRow): AgentRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hash: r.hash ?? "",
    runtime: r.runtime ?? "bun",
  };
}

const AGENT_RUNTIME = "bun";

/** Deterministic hash of agent's content (config + system + user + sorted skills). */
export function computeAgentHash(id: string): string {
  const cfg = readAgentConfig(id);
  const cfgStr = JSON.stringify(cfg);
  const sys = safeRead(id, "system.md");
  const usr = safeRead(id, "user.md");
  const skillsDir = pathForSkills(id);
  const skillFiles: string[] = [];
  try {
    if (fs.existsSync(skillsDir)) {
      for (const e of fs.readdirSync(skillsDir).sort()) {
        if (e.endsWith(".md")) skillFiles.push(e);
      }
    }
  } catch { /* ignore */ }
  const h = createHash("sha256");
  h.update("config:"); h.update(cfgStr);
  h.update("|system:"); h.update(sys);
  h.update("|user:"); h.update(usr);
  for (const f of skillFiles) {
    h.update("|skill:"); h.update(f); h.update(":"); h.update(safeRead(id, `skills/${f}`));
  }
  return h.digest("hex");
}

function safeRead(id: string, name: string): string {
  try { return readAgentFile(id, name); } catch { return ""; }
}

function pathForSkills(id: string): string {
  return path.join(process.env.LAB_DATA_DIR ?? "/home/workspace/Projects/ai-automation-lab/data", "agents", id, "skills");
}

async function updateHash(id: string): void {
  try {
    const hash = computeAgentHash(id);
    await db.prepare(`UPDATE agents SET hash = ?, runtime = ? WHERE id = ?`).run(hash, AGENT_RUNTIME, id);
  } catch (e) {
    console.error(`[agents] failed to update hash for ${id}:`, e);
  }
}

export const AgentStore = {
  async create(ownerId: string, name: string, description = ""): AgentRecord {
    const id = `agent_${nanoid(10)}`;
    const now = Date.now();
    ensureAgentDir(id);
    const hash = computeAgentHash(id);
    await db.prepare(
      `INSERT INTO agents (id, owner_id, name, description, created_at, updated_at, hash, runtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, name, description, now, now, hash, AGENT_RUNTIME);
    return { id, ownerId, name, description, createdAt: now, updatedAt: now, hash, runtime: AGENT_RUNTIME };
  },

  async get(id: string, ownerId: string): Promise<AgentRecord | null> {
    const row = await db.prepare(`SELECT * FROM agents WHERE id = ? AND owner_id = ?`).get(id, ownerId) as AgentRow | undefined;
    return row ? rowToAgent(row) : null;
  },

  async list(ownerId: string): Promise<AgentRecord[]> {
    return (await db.prepare(`SELECT * FROM agents WHERE owner_id = ? ORDER BY updated_at DESC`).all(ownerId) as AgentRow[]).map(rowToAgent);
  },

  async rename(id: string, ownerId: string, name: string, description?: string): boolean {
    const r = await db.prepare(
      `UPDATE agents SET name = ?, description = COALESCE(?, description), updated_at = ? WHERE id = ? AND owner_id = ?`,
    ).run(name, description ?? null, Date.now(), id, ownerId);
    updateHash(id);
    return r.changes > 0;
  },

  async delete(id: string, ownerId: string): boolean {
    const r = await db.prepare(`DELETE FROM agents WHERE id = ? AND owner_id = ?`).run(id, ownerId);
    if (r.changes > 0) {
      deleteAgentFs(id);
      rmSync(path.join(path.dirname(AGENTS_DIR), "sandboxes", id), { recursive: true, force: true });
    }
    return r.changes > 0;
  },

  async clone(id: string, ownerId: string, newName?: string): Promise<AgentRecord | null> {
    const src = AgentStore.get(id, ownerId);
    if (!src) return null;
    const newId = `agent_${nanoid(10)}`;
    cloneAgentFs(id, newId);
    const now = Date.now();
    const hash = computeAgentHash(newId);
    await db.prepare(
      `INSERT INTO agents (id, owner_id, name, description, created_at, updated_at, hash, runtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId, ownerId, newName ?? `${src.name} (copy)`, src.description, now, now, hash, AGENT_RUNTIME);
    return { id: newId, ownerId, name: newName ?? `${src.name} (copy)`, description: src.description, createdAt: now, updatedAt: now, hash, runtime: AGENT_RUNTIME };
  },

  async readFile(id: string, ownerId: string, name: string): Promise<{ name: string; content: string; size: number; mtime: number }> {
    const a = await AgentStore.get(id, ownerId);
    if (!a) throw new Error("agent not found");
    if (!AGENT_FILE_NAMES.includes(name as any) && !name.startsWith("skills/")) {
      throw new Error(`file not allowed: ${name}`);
    }
    const all = listAgentFiles(id);
    const meta = all.find((f) => f.name === name);
    if (!meta) throw new Error(`file not found: ${name}`);
    return { name, content: readAgentFile(id, name), size: meta.size, mtime: meta.mtime };
  },

  async writeFile(id: string, ownerId: string, name: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const a = await AgentStore.get(id, ownerId);
    if (!a) return { ok: false, error: "agent not found" };
    if (!AGENT_FILE_NAMES.includes(name as any) && !name.startsWith("skills/")) {
      return { ok: false, error: `file not allowed: ${name}` };
    }
    try {
      // snapshot before overwrite
      try {
        const old = readAgentFile(id, name);
        await recordHistory(id, name, old);
      } catch {
        // file doesn't exist yet, no history to record
      }
      writeAgentFile(id, name, content);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  },

  async listFiles(id: string, ownerId: string): Promise<{ name: string; size: number; mtime: number }[]> {
    const a = await AgentStore.get(id, ownerId);
    if (!a) throw new Error("agent not found");
    return listAgentFiles(id);
  },

  async updateConfig(id: string, ownerId: string, partial: Partial<AgentConfig>): AgentConfig {
    const current = readAgentConfig(id);
    const next: AgentConfig = { ...current, ...partial, sandbox: { ...current.sandbox, ...(partial.sandbox ?? {}) } };
    writeAgentConfig(id, next);
    await db.prepare(`UPDATE agents SET updated_at = ? WHERE id = ?`).run(Date.now(), id);
    updateHash(id);
    return next;
  },

  async resolveLLMConfig(id: string, ownerId: string) {
    const a = AgentStore.get(id, ownerId);
    if (!a) throw new Error("agent not found");
    const cfg = readAgentConfig(id);
    let apiKey = "";
    if (cfg.apiKeySecret) {
      const row = await db.prepare(`SELECT ciphertext, iv, auth_tag FROM secrets WHERE id = ? AND owner_id = ?`)
        .get(cfg.apiKeySecret, ownerId) as { ciphertext: string; iv: string; auth_tag: string } | undefined;
      if (row) {
        apiKey = decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag });
      }
    }
    return {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    };
  },

  async exportPack(id: string, ownerId: string): Promise<{ manifest: any; files: any }> {
    const a = await AgentStore.get(id, ownerId);
    if (!a) throw new Error("agent not found");
    return { ...packAgent(id), manifest: { ...packAgent(id).manifest, name: a.name, description: a.description } };
  },

  async importPack(ownerId: string, pack: any, newId?: string): AgentRecord {
    const id = unpackAgent(pack, newId ? `agent_${newId}` : undefined);
    const now = Date.now();
    const hash = computeAgentHash(id);
    await db.prepare(
      `INSERT INTO agents (id, owner_id, name, description, created_at, updated_at, hash, runtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, pack.manifest?.name ?? "Imported Agent", pack.manifest?.description ?? "", now, now, hash, AGENT_RUNTIME);
    return { id, ownerId, name: pack.manifest?.name ?? "Imported Agent", description: pack.manifest?.description ?? "", createdAt: now, updatedAt: now, hash, runtime: AGENT_RUNTIME };
  },
};
