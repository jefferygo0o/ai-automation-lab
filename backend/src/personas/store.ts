/**
 * Persona Store — CRUD + active-switching for named AI identities.
 *
 * Each user can have many personas; exactly one can be active at a time.
 * The active persona's prompt is injected into the agent runtime's system
 * prompt, and its model override (if set) replaces the agent config model.
 */
import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

export interface Persona {
  id: string;
  ownerId: string;
  name: string;
  prompt: string;
  imageUrl: string;
  imageHue: number;   // -1 = no tint
  model: string;       // empty = inherit from agent config
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface PersonaRow {
  id: string;
  owner_id: string;
  name: string;
  prompt: string;
  image_url: string;
  image_hue: number;
  model: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

function rowToPersona(r: PersonaRow): Persona {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    prompt: r.prompt,
    imageUrl: r.image_url,
    imageHue: r.image_hue,
    model: r.model,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const PersonaStore = {
  async list(ownerId: string): Promise<Persona[]> {
    const rows = await db
      .prepare("SELECT * FROM personas WHERE owner_id = ? ORDER BY created_at ASC")
      .all(ownerId);
    return rows.map(rowToPersona);
  },

  async get(id: string, ownerId: string): Promise<Persona | null> {
    const row = await db
      .prepare("SELECT * FROM personas WHERE id = ? AND owner_id = ?")
      .get(id, ownerId);
    return row ? rowToPersona(row as PersonaRow) : null;
  },

  async getActive(ownerId: string): Promise<Persona | null> {
    const row = await db
      .prepare("SELECT * FROM personas WHERE owner_id = ? AND is_active = 1 LIMIT 1")
      .get(ownerId);
    return row ? rowToPersona(row as PersonaRow) : null;
  },

  async create(
    ownerId: string,
    name: string,
    prompt: string,
    opts: { imageUrl?: string; imageHue?: number; model?: string } = {}
  ): Promise<Persona> {
    const id = `persona_${nanoid(12)}`;
    const now = Date.now();

    // If this is the user's first persona, make it active automatically
    const existing = await db
      .prepare("SELECT COUNT(*) as cnt FROM personas WHERE owner_id = ?")
      .get(ownerId) as any;
    const isActive = (existing?.cnt ?? 0) === 0 ? 1 : 0;

    await db.prepare(
      "INSERT INTO personas (id, owner_id, name, prompt, image_url, image_hue, model, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id, ownerId, name, prompt,
      opts.imageUrl ?? "",
      opts.imageHue ?? -1,
      opts.model ?? "",
      isActive,
      now, now
    );
    return (await PersonaStore.get(id, ownerId))!;
  },

  async update(
    id: string,
    ownerId: string,
    fields: Partial<Pick<Persona, "name" | "prompt" | "imageUrl" | "imageHue" | "model">>
  ): Promise<Persona | null> {
    const persona = await PersonaStore.get(id, ownerId);
    if (!persona) return null;

    const sets: string[] = [];
    const vals: any[] = [];

    if (fields.name !== undefined) { sets.push("name = ?"); vals.push(fields.name); }
    if (fields.prompt !== undefined) { sets.push("prompt = ?"); vals.push(fields.prompt); }
    if (fields.imageUrl !== undefined) { sets.push("image_url = ?"); vals.push(fields.imageUrl); }
    if (fields.imageHue !== undefined) { sets.push("image_hue = ?"); vals.push(fields.imageHue); }
    if (fields.model !== undefined) { sets.push("model = ?"); vals.push(fields.model); }

    if (sets.length === 0) return persona;

    sets.push("updated_at = ?");
    vals.push(Date.now());
    vals.push(id);
    vals.push(ownerId);

    await db.prepare(
      `UPDATE personas SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`
    ).run(...vals);

    return PersonaStore.get(id, ownerId);
  },

  async setActive(id: string, ownerId: string): Promise<Persona | null> {
    const persona = await PersonaStore.get(id, ownerId);
    if (!persona) return null;

    // Deactivate all others, then activate this one
    await db.prepare("UPDATE personas SET is_active = 0, updated_at = ? WHERE owner_id = ?")
      .run(Date.now(), ownerId);
    await db.prepare("UPDATE personas SET is_active = 1, updated_at = ? WHERE id = ? AND owner_id = ?")
      .run(Date.now(), id, ownerId);

    return PersonaStore.get(id, ownerId);
  },

  async delete(id: string, ownerId: string): Promise<boolean> {
    const persona = await PersonaStore.get(id, ownerId);
    if (!persona) return false;

    await db.prepare("DELETE FROM personas WHERE id = ? AND owner_id = ?")
      .run(id, ownerId);

    // If we deleted the active persona, activate the first remaining one
    if (persona.isActive) {
      const remaining = await db
        .prepare("SELECT id FROM personas WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1")
        .get(ownerId) as any;
      if (remaining?.id) {
        await PersonaStore.setActive(remaining.id, ownerId);
      }
    }

    return true;
  },
};
