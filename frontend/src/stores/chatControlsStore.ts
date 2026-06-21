import { create } from "zustand";

/**
 * Cross-component control plane for active chats.
 *
 * Today it carries a "cancel" request — e.g. the side panel header can
 * stop a stream without forcing the user to scroll to the bottom of the
 * message area.
 *
 * `tick` is a monotonic counter; ChatPanel subscribes via selector and
 * aborts the stream when the tick changes for its own chatId.
 */

interface ChatControlsState {
  cancelTick: Record<string, number>;
  requestCancel: (chatId: string) => void;
}

export const useChatControlsStore = create<ChatControlsState>((set) => ({
  cancelTick: {},
  requestCancel: (chatId) =>
    set((s) => ({
      cancelTick: { ...s.cancelTick, [chatId]: (s.cancelTick[chatId] ?? 0) + 1 },
    })),
}));