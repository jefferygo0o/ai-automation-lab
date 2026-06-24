import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Agents, Agent } from "../api";
import {
  Plus, Copy, Trash2, Edit3, MessageSquare, Upload, Download,
  ArrowUpRight, Bot, MoreHorizontal, Search,
} from "lucide-react";

export default function AgentsPage() {
  const nav = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  async function reload() {
    try {
      const { agents } = await Agents.list();
      setAgents(agents);
    } catch (err) {
      console.warn("Agents.list failed:", err);
      setAgents([]);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch (err) {
        console.warn("reload() in useEffect failed:", err);
      }
    })();
  }, []);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { agent } = await Agents.create(newName, newDesc);
      setNewName(""); setNewDesc("");
      nav(`/agents/${agent.id}`);
    } catch (err: any) {
      console.warn("Agents.create failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function clone(id: string) {
    try {
      const { agent } = await Agents.clone(id);
      reload();
      nav(`/agents/${agent.id}`);
    } catch (err) {
      console.warn("Agents.clone failed:", err);
    }
  }
  async function del(id: string) {
    if (!confirm("Delete this agent and all its files?")) return;
    try {
      await Agents.remove(id);
      reload();
    } catch (err) {
      console.warn("Agents.remove failed:", err);
    }
  }
  async function startChat(id: string) {
    try {
      const { chat } = await import("../api").then(m => m.Chats.create(id));
      nav(`/chats/${chat.id}`);
    } catch (err) {
      console.warn("Chats.create failed:", err);
    }
  }
  async function exportOne(id: string) {
    const pack = await Agents.exportPack(id);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${pack.manifest.agentId}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const pack = JSON.parse(text);
    const { agent } = await Agents.importPack(pack);
    reload();
    nav(`/agents/${agent.id}`);
  }

  const filtered = agents.filter(a =>
    !filter || a.name.toLowerCase().includes(filter.toLowerCase()) ||
    a.description?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6">
      {/* Create new — top of page, prominent */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-4">
            <div className="eyebrow">New</div>
            <div className="text-sm font-medium">Create an agent</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input"
              placeholder="Agent name"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="input"
              placeholder="What does this agent do?"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button
              onClick={create}
              disabled={busy || !newName.trim()}
              className="btn btn-primary"
            >
              {busy ? <span className="spinner" /> : <Plus className="w-3.5 h-3.5 stroke-[1.75]" />}
              <span>Create</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-ink-400">
            {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-300 stroke-[1.75]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="input pl-7 py-1 text-xs w-40"
            />
          </div>
        </div>
        <label className="btn">
          <Upload className="w-3.5 h-3.5 stroke-[1.75]" />
          <span>Import pack</span>
          <input type="file" accept="application/json" className="hidden" onChange={importFile} />
        </label>
      </div>

      {/* Agent list — table-like rows */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="inline-grid place-items-center w-10 h-10 bg-paper-200 mb-3">
              <Bot className="w-5 h-5 text-ink-300 stroke-[1.5]" />
            </div>
            <div className="text-sm text-ink-700 mb-1">
              {agents.length === 0 ? "No agents yet" : "No agents match that filter"}
            </div>
            <div className="text-xs text-ink-400">
              {agents.length === 0
                ? "Create your first agent above. Each agent is a filesystem."
                : "Try a different search term."}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="group px-4 py-3 hover:bg-paper-100 transition-colors flex items-center gap-4"
              >
                <div className="w-8 h-8 shrink-0 grid place-items-center bg-paper-200 group-hover:bg-paper-50 transition-colors">
                  <Bot className="w-4 h-4 text-ink-600 stroke-[1.5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/agents/${a.id}`}
                      className="font-medium text-sm text-ink-900 hover:underline underline-offset-2 decoration-ink-300"
                    >
                      {a.name}
                    </Link>
                    <span className="text-2xs font-mono text-ink-300">{a.id.slice(0, 10)}</span>
                  </div>
                  <div className="text-xs text-ink-400 truncate">
                    {a.description || <span className="italic">No description</span>}
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startChat(a.id)}
                    className="btn btn-ghost btn-sm"
                    title="Start chat"
                  >
                    <MessageSquare className="w-3.5 h-3.5 stroke-[1.75]" />
                    <span>Chat</span>
                  </button>
                  <button
                    onClick={() => clone(a.id)}
                    className="btn btn-ghost btn-sm"
                    title="Clone"
                  >
                    <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                  </button>
                  <button
                    onClick={() => exportOne(a.id)}
                    className="btn btn-ghost btn-sm"
                    title="Export"
                  >
                    <Download className="w-3.5 h-3.5 stroke-[1.75]" />
                  </button>
                  <button
                    onClick={() => del(a.id)}
                    className="btn btn-ghost btn-sm hover:!text-rose-700"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                  </button>
                  <button
                    onClick={() => nav(`/agents/${a.id}`)}
                    className="btn btn-ghost btn-sm"
                    title="Edit"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 stroke-[1.75]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
