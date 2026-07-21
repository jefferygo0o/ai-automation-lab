import { create } from "zustand";

export interface PageTab {
  id: string; // route path like "/chats"
  label: string;
}

export interface ChatTab {
  id: string; // chatId
  title: string;
}

interface TabState {
  pageTabs: PageTab[];
  activePageTabId: string | null;
  chatTabs: ChatTab[];
  activeChatTabId: string | null;

  openPageTab: (id: string, label: string) => void;
  closePageTab: (id: string) => void;
  setActivePageTab: (id: string | null) => void;

  openChatTab: (id: string, title?: string) => void;
  closeChatTab: (id: string) => void;
  setActiveChatTab: (id: string | null) => void;
  updateChatTabTitle: (id: string, title: string) => void;
}

export const useTabStore = create<TabState>((set, get) => ({
  pageTabs: [],
  activePageTabId: null,
  chatTabs: [],
  activeChatTabId: null,

  openPageTab: (id, label) => {
    const state = get();
    // Check if tab already exists
    const exists = state.pageTabs.find((t) => t.id === id);
    if (exists) {
      // Just activate it
      set({ activePageTabId: id });
    } else {
      // Create new tab
      set({
        pageTabs: [...state.pageTabs, { id, label }],
        activePageTabId: id,
      });
    }
  },

  closePageTab: (id) => {
    const state = get();
    const remaining = state.pageTabs.filter((t) => t.id !== id);

    let newActive = state.activePageTabId;
    if (state.activePageTabId === id) {
      // Pick the nearest remaining tab
      if (remaining.length > 0) {
        const closedIdx = state.pageTabs.findIndex((t) => t.id === id);
        newActive = remaining[Math.min(closedIdx, remaining.length - 1)]?.id ?? null;
      } else {
        newActive = null;
      }
    }

    set({ pageTabs: remaining, activePageTabId: newActive });
  },

  setActivePageTab: (id) => {
    set({ activePageTabId: id });
  },

  openChatTab: (id, title) => {
    const state = get();
    const exists = state.chatTabs.find((t) => t.id === id);
    if (exists) {
      set({ activeChatTabId: id });
    } else {
      set({
        chatTabs: [...state.chatTabs, { id, title: title || "Chat" }],
        activeChatTabId: id,
      });
    }
  },

  closeChatTab: (id) => {
    const state = get();
    const remaining = state.chatTabs.filter((t) => t.id !== id);

    let newActive = state.activeChatTabId;
    if (state.activeChatTabId === id) {
      if (remaining.length > 0) {
        const closedIdx = state.chatTabs.findIndex((t) => t.id === id);
        newActive = remaining[Math.min(closedIdx, remaining.length - 1)]?.id ?? null;
      } else {
        newActive = null;
      }
    }

    set({ chatTabs: remaining, activeChatTabId: newActive });
  },

  setActiveChatTab: (id) => {
    set({ activeChatTabId: id });
  },

  updateChatTabTitle: (id, title) => {
    set((state) => ({
      chatTabs: state.chatTabs.map((t) =>
        t.id === id ? { ...t, title } : t
      ),
    }));
  },
}));
