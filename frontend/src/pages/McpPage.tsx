import { useEffect, useState } from "react";
import { MCP, McpServer, McpTool } from "../api";
import {
  Plus, Plug, Unplug, Trash2, Server, Terminal, Circle, ChevronDown, ChevronRight, Wrench,
} from "lucide-react";

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ name: "", command: "", args: "" });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const { servers } = await MCP.list();
    setServers(servers);
    const t: Record<string, McpTool[]> = {};
    for (const s of servers) {
      if (s.connected) {
        try { const r = await MCP.tools(s.id); t[s.id] = r.tools; } catch { t[s.id] = []; }
      }
    }
    setTools(t);
  }
  useEffect(() => { reload(); }, []);

  async function save() {
    if (!draft.name.trim() || !draft.command.trim()) return;
    setSaving(true);
    try {
      await MCP.save(draft.name, draft.command, draft.args.split(/\s+/).filter(Boolean));
      setDraft({ name: "", command: "", args: "" });
      await reload();
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("Remove this MCP server?")) return;
    await MCP.remove(id);
    reload();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">Library</div>
        <h1 className="serif text-3xl text-ink-900">MCP Servers</h1>
        <p className="text-sm text-ink-400 mt-1 max-w-2xl">
          Connect external Model Context Protocol servers to expose their tools to your agents.
          Each server runs in its own child process; tools are registered into the shared tool registry.
        </p>
      </div>

      {/* Add server */}
      <div className="border border-line rounded bg-paper mb-6">
        <div className="px-5 py-3 border-b border-line flex items-center gap-2">
          <Server className="w-3.5 h-3.5 stroke-[1.75] text-ink-700" />
          <span className="text-sm font-medium text-ink-700">Add a server</span>
        </div>
        <div className="p-5 grid grid-cols-[180px_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="label">name</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="my-server"
              className="input font-mono"
            />
          </div>
          <div>
            <label className="label">command</label>
            <input
              value={draft.command}
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
              placeholder="npx"
              className="input font-mono"
            />
          </div>
          <div>
            <label className="label">args</label>
            <input
              value={draft.args}
              onChange={(e) => setDraft({ ...draft, args: e.target.value })}
              placeholder="-y @some/mcp-server"
              className="input font-mono"
            />
          </div>
          <button
            onClick={save}
            disabled={!draft.name.trim() || !draft.command.trim() || saving}
            className="btn btn-primary"
          >
            <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> Add
          </button>
        </div>
      </div>

      {/* Server list */}
      <div className="space-y-2">
        {servers.length === 0 && (
          <div className="text-sm text-ink-400 italic text-center py-16">
            No MCP servers configured yet.
          </div>
        )}
        {servers.map((s) => {
          const isOpen = open[s.id] ?? (s.connected && (tools[s.id]?.length ?? 0) > 0);
          return (
            <div key={s.id} className="border border-line rounded bg-paper">
              <div className="px-4 py-3 flex items-center gap-3">
                <button onClick={() => setOpen((p) => ({ ...p, [s.id]: !isOpen }))} className="text-ink-400">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 stroke-[1.75]" /> : <ChevronRight className="w-3.5 h-3.5 stroke-[1.75]" />}
                </button>
                <Terminal className="w-3.5 h-3.5 stroke-[1.75] text-ink-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{s.name}</span>
                    <span className={`inline-flex items-center gap-1 text-2xs font-mono ${
                      s.connected ? "text-emerald-700" : "text-ink-300"
                    }`}>
                      <Circle className={`w-1.5 h-1.5 fill-current ${s.connected ? "" : ""}`} />
                      {s.connected ? "connected" : "disconnected"}
                    </span>
                  </div>
                  <div className="font-mono text-2xs text-ink-400 mt-0.5 truncate">
                    {s.command} {s.args?.join(" ")}
                  </div>
                </div>
                {s.connected ? (
                  <button onClick={() => MCP.disconnect(s.id).then(reload)} className="btn btn-ghost text-ink-700">
                    <Unplug className="w-3 h-3 stroke-[1.75]" /> Disconnect
                  </button>
                ) : (
                  <button onClick={() => MCP.connect(s.id).then(reload)} className="btn">
                    <Plug className="w-3 h-3 stroke-[1.75]" /> Connect
                  </button>
                )}
                <button onClick={() => del(s.id)} className="btn btn-ghost text-rose-700 hover:text-rose-800">
                  <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                </button>
              </div>
              {isOpen && tools[s.id] && tools[s.id].length > 0 && (
                <div className="border-t border-line bg-paper-50 px-4 py-3">
                  <div className="eyebrow mb-2">Tools exposed ({tools[s.id].length})</div>
                  <div className="grid grid-cols-2 gap-2">
                    {tools[s.id].map((t) => (
                      <div key={t.name} className="border border-line bg-paper rounded p-2.5">
                        <div className="flex items-center gap-1.5">
                          <Wrench className="w-3 h-3 stroke-[1.75] text-clay-700" />
                          <span className="font-mono text-xs text-ink-900">{t.name}</span>
                        </div>
                        {t.description && (
                          <div className="text-2xs text-ink-400 mt-1 line-clamp-2">{t.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
