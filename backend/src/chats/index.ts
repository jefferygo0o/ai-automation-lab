import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export interface Chat {
  id: string;
  agentId: string;
  ownerId: string;
  title: string;
  activeAgentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
  runId?: string;
  createdAt: number;
}

interface ChatRow {
  id: string;
  agent_id: string;
  owner_id: string;
  title: string;
  active_agent_id: string | null;
  created_at: number;
  updated_at: number;
}

interface MsgRow {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  name: string | null;
  run_id: string | null;
  created_at: number;
}

// Safe JSON parse — returns fallback on failure
function safeJsonParse(input: string | null | undefined, fallback: any = {}): any {
  if (!input) return fallback;
  try {
    return JSON.parse(input);
  } catch {
    console.warn("[chats] malformed JSON in message, falling back:", input.slice(0, 80));
    return fallback;
  }
}

function rowToChat(r: ChatRow): Chat {
  return {
    id: r.id,
    agentId: r.agent_id,
    ownerId: r.owner_id,
    title: r.title,
    activeAgentId: r.active_agent_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMsg(r: MsgRow): Message {
  return {
    id: r.id,
    chatId: r.chat_id,
    role: r.role,
    content: r.content,
    toolCalls: r.tool_calls ? safeJsonParse(r.tool_calls, []).map((tc: any) => ({
      ...tc,
      args: tc.args ?? (tc.arguments ? safeJsonParse(tc.arguments, {}) : {}),
    })) : undefined,
    toolCallId: r.tool_call_id ?? undefined,
    name: r.name ?? undefined,
    runId: r.run_id ?? undefined,
    createdAt: r.created_at,
  };
}

export const ChatStore = {
  async create(ownerId: string, agentId: string, title?: string): Promise<Chat> {
    const id = `chat_${nanoid(12)}`;
    const now = Date.now();
    const t = title ?? "New chat";
    await db.prepare(
      `INSERT INTO chats (id, agent_id, owner_id, title, active_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, agentId, ownerId, t, agentId, now, now);
    return { id, agentId, ownerId, title: t, activeAgentId: agentId, createdAt: now, updatedAt: now };
  },

  async list(ownerId: string): Promise<Chat[]> {
    return (await db.prepare(`SELECT * FROM chats WHERE owner_id = ? ORDER BY updated_at DESC`).all(ownerId) as ChatRow[]).map(rowToChat);
  },

  async get(id: string, ownerId: string): Promise<Chat | null> {
    const r = await db.prepare(`SELECT * FROM chats WHERE id = ? AND owner_id = ?`).get(id, ownerId) as ChatRow | undefined;
    return r ? rowToChat(r) : null;
  },

  async setActiveAgent(chatId: string, ownerId: string, agentId: string): Promise<boolean> {
    const r = await db.prepare(
      `UPDATE chats SET active_agent_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?`
    ).run(agentId, Date.now(), chatId, ownerId);
    return r.changes > 0;
  },

  async rename(chatId: string, ownerId: string, title: string): Promise<boolean> {
    const r = await db.prepare(
      `UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?`
    ).run(title, Date.now(), chatId, ownerId);
    return r.changes > 0;
  },

  async delete(chatId: string, ownerId: string): Promise<boolean> {
    await db.prepare(`DELETE FROM messages WHERE chat_id = ?`).run(chatId);
    const r = await db.prepare(`DELETE FROM chats WHERE id = ? AND owner_id = ?`).run(chatId, ownerId);
    return r.changes > 0;
  },

  async addMessage(chatId: string, m: Omit<Message, "id" | "chatId" | "createdAt">): Promise<Message> {
    const id = `msg_${nanoid(12)}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO messages (id, chat_id, role, content, tool_calls, tool_call_id, name, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      chatId,
      m.role,
      m.content,
      m.toolCalls ? JSON.stringify(m.toolCalls) : null,
      m.toolCallId ?? null,
      m.name ?? null,
      m.runId ?? null,
      now
    );
    await db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(now, chatId);
    return { id, chatId, createdAt: now, ...m };
  },

  async listMessages(chatId: string, ownerId: string): Promise<Message[]> {
    const chat = await ChatStore.get(chatId, ownerId);
    if (!chat) return [];
    return await (await db.prepare(
      `SELECT id, chat_id, role, content, tool_calls, tool_call_id, name, run_id, created_at
       FROM messages WHERE chat_id = ? ORDER BY created_at ASC`
    ).all(chatId) as MsgRow[]).map(rowToMsg);
  },
};
