import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Chats, Chat } from "../api";
import { Plus, MessageSquare, Bot, Trash2, ArrowUpRight, PanelRightOpen } from "lucide-react";
import { useChatPanel } from "../contexts/ChatPanelContext";

export default function ChatsPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const { openChat, closeChat } = useChatPanel();

  async function reload() {
    const { chats } = await Chats.list();
    setChats(chats);
    const { agents } = await import("../api").then(m => m.Agents.list());
    setAgents(agents);
  }
  useEffect(() => { reload(); }, []);

  async function create() {
    if (!agentId) return;
    setBusy(true);
    await Chats.create(agentId, title || undefined);
    setTitle(""); setCreating(false);
    setBusy(false);
    await reload();
  }
  async function remove(id: string) {
    if (!confirm("Delete this chat?")) return;
    await Chats.remove(id);
    await reload();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-line">
        <div>
          <div className="eyebrow mb-1">Workspace</div>
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">Chats</h1>
          <p className="text-sm text-ink-400 mt-1">Conversations with your agents.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">
          <Plus className="w-3.5 h-3.5 stroke-[1.75]" />
          <span>New chat</span>
        </button>
      </div>

      {creating && (
        <div className="card mb-4">
          <div className="card-body">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input">
                <option value="">Select agent…</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="input"
              />
              <div className="flex gap-2">
                <button onClick={create} disabled={!agentId || busy} className="btn btn-primary">
                  Create
                </button>
                <button onClick={() => setCreating(false)} className="btn">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {chats.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-6 h-6 stroke-[1.5]" />}
          title="No chats yet"
          body="Create a chat to start a conversation with one of your agents."
          action={<button onClick={() => setCreating(true)} className="btn btn-primary">
            <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> <span>New chat</span>
          </button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-line">
            {chats.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-paper-50 transition-colors group">
                <div className="w-8 h-8 rounded-full bg-paper-200 border border-line grid place-items-center shrink-0">
                  <Bot className="w-4 h-4 stroke-[1.5] text-ink-600" />
                </div>
                <Link to={`/chats/${c.id}`} className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate">
                    {c.title || "Untitled chat"}
                  </div>
                  <div className="text-xs text-ink-400 truncate flex items-center gap-1.5">
                    <span>{c.agentName}</span>
                    <span>·</span>
                    <span className="font-mono text-2xs">{c.id}</span>
                    <span>·</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                </Link>
                <Link
                  to={`/chats/${c.id}`}
                  className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-ink-900"
                  onClick={() => closeChat()}
                >
                  <ArrowUpRight className="w-4 h-4 stroke-[1.75]" />
                </Link>
                <button
                  onClick={() => openChat(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-ink-900"
                >
                  <PanelRightOpen className="w-4 h-4 stroke-[1.75]" />
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="text-ink-300 hover:text-rose-700 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, body, action }: {
  icon: React.ReactNode; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="px-6 py-12 text-center flex flex-col items-center gap-2">
        <div className="text-ink-300">{icon}</div>
        <div className="text-sm font-medium text-ink-900">{title}</div>
        <div className="text-xs text-ink-400 max-w-sm">{body}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
