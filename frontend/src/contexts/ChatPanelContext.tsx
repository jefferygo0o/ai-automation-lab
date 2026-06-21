import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ChatPanelState {
  isOpen: boolean;
  chatId: string | null;
  openChat: (id: string) => void;
  closeChat: () => void;
  toggleChat: () => void;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
}

const ChatPanelCtx = createContext<ChatPanelState>({
  isOpen: false,
  chatId: null,
  openChat: () => {},
  closeChat: () => {},
  toggleChat: () => {},
  panelWidth: 420,
  setPanelWidth: () => {},
});

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(true);
  const [chatId, setChatId] = useState<string | null>(null);
  const [panelWidth, setPanelWidthState] = useState<number>(420);

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

  const setPanelWidth = useCallback((width: number) => {
    setPanelWidthState((v) => Math.max(280, Math.min(800, width)));
  }, []);

  return (
    <ChatPanelCtx.Provider value={{ isOpen, chatId, openChat, closeChat, toggleChat, panelWidth, setPanelWidth }}>
      {children}
    </ChatPanelCtx.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelCtx);
}
