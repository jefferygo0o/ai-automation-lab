import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ChatPanelState {
  chatId: string | null;
  openChat: (id: string) => void;
  closeChat: () => void;
}

const ChatPanelCtx = createContext<ChatPanelState>({
  chatId: null,
  openChat: () => {},
  closeChat: () => {},
});

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [chatId, setChatId] = useState<string | null>(null);

  const openChat = useCallback((id: string) => {
    setChatId(id);
  }, []);

  const closeChat = useCallback(() => {
    setChatId(null);
  }, []);

  return (
    <ChatPanelCtx.Provider value={{ chatId, openChat, closeChat }}>
      {children}
    </ChatPanelCtx.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelCtx);
}
