import { createContext, useContext, type ReactNode } from "react";
import { useTabStore, type ChatTab } from "../stores/tabStore";

interface ChatPanelState {
  chatId: string | null;
  openChat: (id: string, title?: string) => void;
  closeChat: () => void;
  chatTabs: ChatTab[];
  activeChatTabId: string | null;
  setActiveChatTab: (id: string | null) => void;
  closeChatTab: (id: string) => void;
  updateChatTabTitle: (id: string, title: string) => void;
}

const ChatPanelCtx = createContext<ChatPanelState>({
  chatId: null,
  openChat: () => {},
  closeChat: () => {},
  chatTabs: [],
  activeChatTabId: null,
  setActiveChatTab: () => {},
  closeChatTab: () => {},
  updateChatTabTitle: () => {},
});

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const chatId = useTabStore((s) => s.activeChatTabId);
  const openChat = useTabStore((s) => s.openChatTab);
  const closeChat = useTabStore((s) => s.closeChatTab);
  const chatTabs = useTabStore((s) => s.chatTabs);
  const activeChatTabId = useTabStore((s) => s.activeChatTabId);
  const setActiveChatTab = useTabStore((s) => s.setActiveChatTab);
  const closeChatTab = useTabStore((s) => s.closeChatTab);
  const updateChatTabTitle = useTabStore((s) => s.updateChatTabTitle);

  return (
    <ChatPanelCtx.Provider
      value={{
        chatId,
        openChat,
        closeChat: () => {
          if (activeChatTabId) closeChatTab(activeChatTabId);
        },
        chatTabs,
        activeChatTabId,
        setActiveChatTab,
        closeChatTab,
        updateChatTabTitle,
      }}
    >
      {children}
    </ChatPanelCtx.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelCtx);
}
