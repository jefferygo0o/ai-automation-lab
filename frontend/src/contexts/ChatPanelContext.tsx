import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ChatPanelState {
  isOpen: boolean;
  chatId: string | null;
  openChat: (id: string) => void;
  closeChat: () => void;
  toggleChat: () => void;
}

const ChatPanelCtx = createContext<ChatPanelState>({
  isOpen: false,
  chatId: null,
  openChat: () => {},
  closeChat: () => {},
  toggleChat: () => {},
});

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(true); // always open by default
  const [chatId, setChatId] = useState<string | null>(null);

  const openChat = useCallback((id: string) => {
    setChatId(id);
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setOpen(false);
    setChatId(null);
  }, []);

  const toggleChat = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  return (
    <ChatPanelCtx.Provider value={{ isOpen, chatId, openChat, closeChat, toggleChat }}>
      {children}
    </ChatPanelCtx.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelCtx);
}
