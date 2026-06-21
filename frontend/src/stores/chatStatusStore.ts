import { create } from "zustand";

/**
 * Live working-state for every chat the client knows about.
 *
 * The side `ChatPanel` header reads from this store to show a working
 * indicator (and which tool is currently executing) even when the user
 * is focused on a different page — e.g. while editing a Web Space route
 * while a background chat is still streaming.
 *
 * Each `ChatPanel` instance publishes its own state on every change. A
 * single chat is normally only mounted once at a time (the side panel),
 * so a flat Map keyed by chatId is the right shape.
 */

export type ChatPhase = "idle" | "thinking" | "running_tool";

export interface ChatStatus {
  phase: ChatPhase;
  /** Set when phase === "running_tool". */
  tool?: string;
}

interface ChatStatusState {
  /** chatId -> latest status. */
  statuses: Record<string, ChatStatus>;
  set: (chatId: string, status: ChatStatus) => void;
}

export const useChatStatusStore = create<ChatStatusState>((set) => ({
  statuses: {},
  set: (chatId, status) =>
    set((s) => {
      // No-op when nothing actually changed — avoids re-rendering the
      // panel header every time an unrelated stream chunk arrives.
      const prev = s.statuses[chatId];
      if (prev && prev.phase === status.phase && prev.tool === status.tool) {
        return s;
      }
      return { statuses: { ...s.statuses, [chatId]: status } };
    }),
}));

/** Selector hook — only re-renders when THIS chat's status changes. */
export function useChatStatus(chatId: string | undefined): ChatStatus {
  return useChatStatusStore((s) =>
    chatId ? s.statuses[chatId] ?? { phase: "idle" } : { phase: "idle" },
  );
}