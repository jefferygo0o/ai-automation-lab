import { useEffect, useState } from "react";
import { MCP, McpServer, McpTool } from "../api";
import {
  Plus, Plug, Unplug, Trash2, Server, Terminal, Circle, ChevronDown, ChevronRight, Wrench, Search, Star, Package, AlertCircle, ExternalLink, Check, X, Key,
} from "lucide-react";
import AnimatedDots from "../components/AnimatedDots";

// ==============================================================
// SECTION: OAuth Connect Dialog
// ==============================================================

function OAuthConnectDialog({
  serverId,
  serverName,
  connectLinkUrl,
  needsEnv,
  onVerified,
  onClose,
}: {
  serverId: string;
  serverName: string;
  connectLinkUrl: string;
  needsEnv: string[];
  onVerified: () => void;
  onClose: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleOpenAuth = () => {
    window.open(connectLinkUrl, "_blank", "noopener,noreferrer");
  };

  const handleVerify = async () => {
    setVerifying(true);
    setError("");
    try {
      const res = await MCP.verifyOAuth(serverId);
      if (res.connected) {
        setDone(true);
        onVerified();
      } else {
        setError(res.error || "Not connected yet. Complete the authorization in the Foundry Connect window.");
      }
    } catch (e: any) {
      setError(e?.message || "Verification failed");
    }
    setVerifying(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-paper border border-line rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h3 className="font-medium text-ink-900 text-sm flex items-center gap-2">
            <Plug className="w-4 h-4" />
            Connect {serverName}
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Check className="w-10 h-10 text-emerald-500" />
              <p className="text-sm text-ink-600 text-center">{serverName} connected successfully!</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>
                  A new window opened to authorize {serverName} on Foundry Connect. Complete the authorization there, then come back.
                </span>
              </div>
              {connectLinkUrl && (
                <button onClick={handleOpenAuth} className="btn btn-ghost w-full text-xs text-ink-500 hover:text-ink-700">
                  <ExternalLink className="w-3 h-3" /> Open authorization window
                </button>
              )}
              {needsEnv.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
                  <p className="font-medium">This server also requires env vars:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {needsEnv.map((v) => (
                      <li key={v}><code className="text-amber-900 bg-amber-100 px-1 rounded">{v}</code></li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="btn btn-primary w-full justify-center"
              >
                {verifying ? <AnimatedDots invert size={16} /> : <Check className="w-3.5 h-3.5" />}
                {verifying ? "Verifying..." : "I've Authorized — Verify Connection"}
              </button>
              {error && (
                <div className="flex items-center gap-1.5 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ==============================================================
// SECTION: Env Vars Dialog
// ==============================================================

function EnvDialog({
  serverId,
  fields,
  onSave,
  onClose,
}: {
  serverId: string;
  fields: Array<{ name: string; description: string }>;
  onSave: (env: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await MCP.setEnv(serverId, values);
      if (res.ok) {
        onSave(values);
      } else {
        setError(res.error || "Failed to set env vars");
      }
    } catch (e: any) {
      setError(e?.message || "Failed");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-paper border border-line rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h3 className="font-medium text-ink-900 text-sm flex items-center gap-2">
            <Key className="w-4 h-4" />
            Set Environment Variables
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-icon"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-ink-500">This server requires the following environment variables to connect.</p>
          {fields.map((f) => (
            <div key={f.name}>
              <label className="label text-xs text-ink-500 mb-1">{f.name}</label>
              {f.description && <p className="text-2xs text-ink-400 mb-1.5">{f.description}</p>}
              <input
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                placeholder={f.name}
                className="input font-mono w-full"
                autoComplete="off"
                type="password"
              />
            </div>
          ))}
          {error && (
            <div className="flex items-center gap-1.5 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn btn-ghost text-xs">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? <AnimatedDots invert size={16} /> : <Check className="w-3 h-3" />}
              {saving ? "Saving..." : "Save & Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==============================================================
// SECTION: Marketplace Panel
// ==============================================================

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
                  {isInstalling ? <><AnimatedDots invert size={14} /> Installing...</> : isInstalled ? "Installed" : "Install"}
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
  // --- Connecting / OAuth state ---
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [oauthServer, setOauthServer] = useState<{
    id: string;
    name: string;
    connectLinkUrl: string;
    needsEnv: string[];
  } | null>(null);
  const [envDialog, setEnvDialog] = useState<{
    id: string;
    fields: Array<{ name: string; description: string }>;
  } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
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

  // Connect a server — may trigger OAuth flow or env var dialog
  async function connectServer(server: McpServer) {
    setConnectingId(server.id);
    setConnectError(null);
    try {
      const res = await MCP.connect(server.id);
      // Response can have: oauth (OAuth link), needsEnv (env var prompt), ok (direct success)
      if ((res as any).oauth?.authorizationUrl) {
        // Need Foundry Connect OAuth
        const oauthData = (res as any).oauth;
        const authUrl = oauthData.authorizationUrl;
        setOauthServer({
          id: server.id,
          name: server.name,
          connectLinkUrl: authUrl,
          needsEnv: (res as any).needsEnv ?? [],
        });
        window.open(authUrl, "_blank", "width=600,height=700");
      } else if ((res as any).needsEnv && (res as any).needsEnv.length > 0) {
        // Need env vars — show env dialog
        setEnvDialog({
          id: server.id,
          fields: (res as any).needsEnv.map((name: string) => ({ name, description: `Enter ${name}` })),
        });
      } else if ((res as any).ok) {
        // Direct success — reload
        await reload();
      } else {
        setConnectError((res as any).message || "Failed to connect");
      }
    } catch (err: any) {
      setConnectError(err?.message || String(err));
    } finally {
      setConnectingId(null);
    }
  }

  // Verify OAuth and then try to connect the server
  async function verifyOAuth() {
    if (!oauthServer) return;
    setConnectingId(oauthServer.id);
    setConnectError(null);
    try {
      const res = await MCP.verifyOAuth(oauthServer.id);
      if ((res as any).connected) {
        setOauthServer(null);
        await reload();
        showToast(`${oauthServer.name} connected`, true);
      } else {
        setConnectError((res as any).error || (res as any).message || "OAuth verification failed — try again");
      }
    } catch (err: any) {
      setConnectError(err?.message || String(err));
    } finally {
      setConnectingId(null);
    }
  }

  // Set env vars and start the server
  async function submitEnv(envVars: Record<string, string>) {
    if (!envDialog) return;
    setConnectingId(envDialog.id);
    setConnectError(null);
    try {
      const res = await MCP.setEnv(envDialog.id, envVars);
      if ((res as any).ok) {
        setEnvDialog(null);
        await reload();
      } else {
        setConnectError((res as any).error || "Failed to set env vars");
      }
    } catch (err: any) {
      setConnectError(err?.message || String(err));
    } finally {
      setConnectingId(null);
    }
  }

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
                {saving ? <AnimatedDots invert size={16} /> : <Plus className="w-3.5 h-3.5 stroke-[1.75]" />}
                <span>{saving ? "Adding..." : "Add"}</span>
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
                      <button
                        onClick={() => connectServer(s)}
                        disabled={connectingId === s.id || (oauthServer?.id === s.id)}
                        className="btn"
                      >
                        {connectingId === s.id ? (
                          <AnimatedDots size={14} />
                        ) : (
                          <Plug className="w-3 h-3 stroke-[1.75]" />
                        )}
                        {connectingId === s.id ? "Connecting..." : "Connect"}
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

      {/* Connect error banner */}
      {connectError && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{connectError}</span>
          <button onClick={() => setConnectError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* OAuth Connect Dialog */}
      {oauthServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Connect {oauthServer.name}</h3>
            <p className="text-sm text-ink-500 mb-4">
              Connect the Foundry Connect integration for {oauthServer.name} to authorize this MCP server.
            </p>
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs mb-4">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>
                A new window should have opened. Complete the authorization there, then come back.
              </span>
            </div>
            <a
              href={oauthServer.connectLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-blue-600 underline mb-4 hover:text-blue-800"
            >
              Didn't open? Click here to try again
            </a>
            <div className="flex items-center gap-2">
              <button
                onClick={() => verifyOAuth()}
                disabled={connectingId === oauthServer.id}
                className="btn btn-primary w-full justify-center"
              >
                {connectingId === oauthServer.id ? (
                  <AnimatedDots invert size={16} />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {connectingId === oauthServer.id ? "Verifying..." : "I've Authorized — Verify"}
              </button>
            </div>
            <button
              onClick={() => { setOauthServer(null); setConnectingId(null); }}
              className="btn btn-ghost w-full text-xs text-ink-400 mt-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Env vars dialog */}
      {envDialog && (
        <EnvDialog
          serverId={envDialog.id}
          fields={envDialog.fields}
          onSave={async (env) => {
            // Use the component-level submitEnv
            await submitEnv(env);
          }}
          onClose={() => { setEnvDialog(null); setConnectingId(null); }}
        />
      )}
    </div>
  );
}
