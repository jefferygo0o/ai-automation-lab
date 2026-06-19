import { useChatPanel } from "../contexts/ChatPanelContext";
import { MessagesSquare, ChevronRight, Plus, X, PanelRightClose, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Chats, Agents } from "../api";
import type { Chat, Agent } from "../api";
import ChatPage from "../pages/ChatPage";

/**
 * Persistent side panel for chat. Wraps ChatPage inside a
 * right-side overlay that stays visible across page navigation.
 */
export default function ChatPanel() {
  const { isOpen, chatId, closeChat, openChat } = useChatPanel();
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay backdrop (mobile) */}
      <div className="hidden max-lg:block fixed inset-0 bg-black/20 z-30" onClick={closeChat} />

      <aside className="w-[420px] shrink-0 border-l border-line bg-paper flex flex-col h-full overflow-hidden relative">
        {/* Panel header */}
        <div className="h-11 shrink-0 border-b border-line flex items-center gap-2 px-3 bg-paper-50/80 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <MessagesSquare className="w-3.5 h-3.5 text-ink-400 stroke-[1.5]" />
            <span className="text-xs font-medium text-ink-700">Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <NewChatButton onCreated={openChat} />
            <button
              onClick={closeChat}
              className="rounded-sm p-1.5 text-ink-400 hover:text-ink-900 hover:bg-paper-200/60 transition-colors"
              title="Close chat panel"
            >
              <X className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
          </div>
        </div>

        {/* Chat content - shows either the active chat or a "no chat selected" state */}
        {chatId ? (
          <ChatPage key={chatId} chatIdOverride={chatId} inPanel={true} />
        ) : (
          <ChatPanelEmpty onSelectChat={openChat} />
        )}
      </aside>
    </>
  );
}

/** Floating new-chat button that creates a chat with the first available agent */
function NewChatButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Agents.list().then(r => setAgents(r.agents)).catch(() => {});
  }, []);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const agent = agents[0];
      if (!agent) return;
      const { chat } = await Chats.create(agent.id, "New chat");
      onCreated(chat.id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading || agents.length === 0}
      className="rounded-sm p-1.5 text-ink-400 hover:text-ink-900 hover:bg-paper-200/60 transition-colors disabled:opacity-30"
      title="New chat"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin stroke-[1.5]" />
      ) : (
        <Plus className="w-3.5 h-3.5 stroke-[1.5]" />
      )}
    </button>
  );
}

function ChatPanelEmpty({ onSelectChat }: { onSelectChat: (id: string) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      Chats.list().then(r => setChats(r.chats)),
      Agents.list().then(r => setAgents(r.agents)),
    ]).finally(() => setLoading(false));
  }, []);

  const createAndOpen = useCallback(async () => {
    const firstAgent = agents[0];
    if (!firstAgent) return;
    const { chat } = await Chats.create(firstAgent.id, "New chat");
    onSelectChat(chat.id);
  }, [agents, onSelectChat]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-ink-300 stroke-[1.5]" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-10 h-10 rounded-full border-2 border-line grid place-items-center mb-3 text-ink-400">
        <MessagesSquare className="w-5 h-5 stroke-[1.5]" />
      </div>
      <div className="text-sm font-medium text-ink-900 mb-1">No chat selected</div>
      <div className="text-xs text-ink-400 mb-4 max-w-xs leading-relaxed">
        Select a chat from the list or create a new one to get started.
      </div>
      <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
        {chats.slice(0, 5).map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-left text-ink-700 hover:bg-paper-200/60 rounded-sm border border-transparent hover:border-line transition-colors"
          >
            <MessagesSquare className="w-3 h-3 text-ink-400 shrink-0 stroke-[1.5]" />
            <span className="truncate flex-1">{chat.title}</span>
            <ChevronRight className="w-3 h-3 text-ink-300 shrink-0" />
          </button>
        ))}
        {chats.length === 0 && (
          <div className="text-xs text-ink-400 italic">No conversations yet.</div>
        )}
        <button
          onClick={createAndOpen}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink-700 hover:bg-paper-200/60 rounded-sm border border-dashed border-line transition-colors mt-1"
        >
          <Plus className="w-3 h-3 stroke-[1.5]" />
          <span>New conversation</span>
        </button>
      </div>
    </div>
  );
}
