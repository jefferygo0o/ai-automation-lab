import { useEffect, useMemo, useState } from "react";
import { MCP, McpServer, McpTool } from "../api";
import {
  Plus, Plug, Unplug, Trash2, Server, Terminal, Circle, ChevronDown, ChevronRight, Wrench, Search, Download, Star, Package, AlertCircle,
} from "lucide-react";

function MarketplacePanel({
  entries,
  search,
  onSearch,
  category,
  onCategory,
  installing,
  installError,
  installStatus,
  onInstall,
  token,
}: {
  entries: any[];
  search: string;
  onSearch: (s: string) => void;
  category: string;
  onCategory: (c: string) => void;
  installing: Record<string, "installing" | "ready" | "error">;
  installError: Record<string, string>;
  installStatus: Record<string, "installing" | "ready" | "error">;
  onInstall: (e: any) => void;
  token: string;
}) {
  const [localSearch, setLocalSearch] = useState(search);
  const [localCategory, setLocalCategory] = useState(category);

  return (
    <div className="border border-line rounded bg-paper p-5">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <h2 className="serif text-xl text-ink-900">Marketplace</h2>
        <button
          onClick={() => { onSearch(""); onCategory("all"); }}
          className="btn btn-ghost text-ink-700"
        >
          <Search className="w-3.5 h-3.5 stroke-[1.75]" /> Refresh
        </button>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search..."
          className="input font-mono flex-1"
        />
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <button
          onClick={() => onCategory("all")}
          className={`px-2 py-1 text-xs border border-line rounded ${
            localCategory === "all" ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700"
          }`}
        >
          All
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {entries.map((e: any) => {
          const isInstalling = installing[e.id] === "installing";
          const isInstalled = installing[e.id] === "ready";
          const isError = installing[e.id] === "error";
          const error = installError[e.id];
          return (
            <div key={e.id} className="border border-line rounded bg-paper p-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 border border-line rounded bg-paper-50 flex items-center justify-center">
                  <img
                    src={e.icon}
                    alt={e.name}
                    className="w-6 h-6"
                    onError={(ev) => {
                      (ev.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='20' x='2' y='2' rx='4'/%3E%3Cpath d='M12 12h.01'/%3E%3C/svg%3E";
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate">{e.name}</div>
                  <div className="text-2xs text-ink-400 truncate">{e.description}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {e.categories.map((c: string) => (
                  <span key={c} className="px-1.5 py-0.5 text-xs border border-line rounded bg-paper-50 text-ink-400">
                    {c}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 stroke-[1.75] text-ink-400" />
                  <span className="text-xs text-ink-400">{e.stars}</span>
                </div>
                <a
                  href={e.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ink-400 hover:text-ink-700"
                >
                  {e.homepage}
                </a>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex-1">
                  {isInstalling && (
                    <span className="text-xs text-ink-400">Installing...</span>
                  )}
                  {isInstalled && (
                    <span className="text-xs text-emerald-700">Installed ✓</span>
                  )}
                  {isError && (
                    <span className="text-xs text-rose-700">
                      {error || "Failed to install"}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onInstall(e)}
                  disabled={isInstalling || isInstalled || isError}
                  className="btn btn-primary text-xs"
                >
                  {isInstalling ? "Installing..." : isInstalled ? "Installed" : "Install"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ name: "", command: "", args: "" });
  const [saving, setSaving] = useState(false);
  // --- Marketplace tab state ---
  const [tab, setTab] = useState<"connected" | "marketplace">("connected");
  interface MarketEntry {
    id: string; name: string; description: string; longDescription: string;
    categories: string[]; stars: number; homepage: string; command: string;
    args: string[]; envVars: { name: string; description: string; required: boolean }[];
    icon: string; tags: string[]; installed: boolean;
  }
  interface InstallResult { server: any; status: string; error?: string; needs_env: string[]; }
  const [market, setMarket] = useState<MarketEntry[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketErr, setMarketErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [installing, setInstalling] = useState<Record<string, "installing" | "ready" | "error">>({});
  const [installErr, setInstallErr] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  function showToast(text: string, ok: boolean) {
    setToast({ id: Date.now(), text, ok });
    setTimeout(() => setToast(null), 3500);
  }
  async function loadMarket() {
    setMarketLoading(true);
    setMarketErr(null);
    try {
      const r = await fetch("/api/mcp/marketplace", { headers: { Authorization: `Bearer ${localStorage.getItem("lab.token") ?? ""}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setMarket(d.entries || []);
    } catch (e: any) { setMarketErr(e.message || "Failed to load marketplace"); }
    setMarketLoading(false);
  }
  useEffect(() => {
    if (tab === "marketplace" && market.length === 0 && !marketLoading) loadMarket();
  }, [tab]);
  async function installEntry(e: MarketEntry) {
    if (e.installed) { showToast(`${e.name} is already installed`, true); return; }
    setInstalling((p) => ({ ...p, [e.id]: "installing" }));
    setInstallErr((p) => ({ ...p, [e.id]: "" }));
    try {
      const r = await fetch(`/api/mcp/marketplace/${e.id}/install`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("lab.token") ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      const data: InstallResult = await r.json();
      setInstalling((p) => ({ ...p, [e.id]: data.status === "ready" ? "ready" : "error" }));
      setMarket((prev) => prev.map((m) => m.id === e.id ? { ...m, installed: true } : m));
      // Refresh the connected-servers list so the user sees the result.
      reload();
      const envWarn = data.needs_env && data.needs_env.length > 0
        ? ` (needs env: ${data.needs_env.join(", ")})` : "";
      showToast(`${e.name} installed${envWarn}`, data.status === "ready");
    } catch (err: any) {
      setInstalling((p) => ({ ...p, [e.id]: "error" }));
      setInstallErr((p) => ({ ...p, [e.id]: err.message || String(err) }));
      showToast(`Failed: ${err.message || err}`, false);
    }
  }

  async function reload() {
    try {
      const { servers } = await MCP.list();
      setServers(servers);
      const t: Record<string, McpTool[]> = {};
      for (const s of servers) {
        if (s.connected) {
          try { const r = await MCP.tools(s.id); t[s.id] = r.tools; } catch { t[s.id] = []; }
        }
      }
      setTools(t);
    } catch (err) {
      console.warn("MCP.list failed:", err);
      setServers([]); setTools({});
    }
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

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-line mb-6">
        <button
          onClick={() => setTab("connected")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "connected" ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Server className="w-3.5 h-3.5 stroke-[1.75]" /> Connected Servers
            <span className="text-2xs text-ink-400">({servers.length})</span>
          </span>
        </button>
        <button
          onClick={() => setTab("marketplace")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "marketplace" ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Package className="w-3.5 h-3.5 stroke-[1.75]" /> 📦 Marketplace
            <span className="text-2xs text-ink-400">({market.length || 20})</span>
          </span>
        </button>
      </div>

      {tab === "connected" && (
        <>
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
        </>
      )}

      {tab === "marketplace" && (
        <MarketplacePanel
          entries={market}
          search={search}
          onSearch={setSearch}
          category={category}
          onCategory={setCategory}
          installing={installing}
          installError={installErr}
          installStatus={installing}
          onInstall={installEntry}
          token={typeof localStorage !== "undefined" ? localStorage.getItem("lab.token") ?? "" : ""}
        />
      )}
    </div>
  );
}
