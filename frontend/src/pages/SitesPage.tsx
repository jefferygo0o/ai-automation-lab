import { useEffect, useState } from "react";
import { Globe, Plus, Server, ExternalLink, Trash2, Play, Square, RotateCcw, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { Sites, Services, type Site, type UserService } from "../api";

export default function SitesPage() {
  const [tab, setTab] = useState<"sites" | "services">("sites");
  const [sites, setSites] = useState<Site[]>([]);
  const [services, setServices] = useState<UserService[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const [s, sv] = await Promise.all([Sites.list(), Services.list()]);
      setSites(s.sites ?? []);
      setServices(sv.services ?? []);
    } catch { setSites([]); setServices([]); }
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">Hosting</div>
        <h1 className="serif text-3xl text-ink-900">Sites & Services</h1>
        <p className="text-sm text-ink-400 mt-1">Create websites and manage long-running services.</p>
      </div>
      <div className="flex gap-1 border-b border-line mb-6">
        {(["sites", "services"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700"
            }`}
          >
            {t === "sites" ? <Globe className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
            <span className="capitalize">{t}</span>
          </button>
        ))}
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-ink-400 mx-auto mt-8" />
      ) : tab === "sites" ? (
        <SitesPanel sites={sites} onReload={reload} />
      ) : (
        <ServicesPanel services={services} onReload={reload} />
      )}
    </div>
  );
}

function SitesPanel({ sites, onReload }: { sites: Site[]; onReload: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [variant, setVariant] = useState("blank");
  const [creating, setCreating] = useState(false);

  async function createSite() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { site } = await Sites.create(name.trim(), variant);
      setShowCreate(false); setName(""); setVariant("blank");
      onReload();
    } catch (e: any) { alert(e?.message ?? "create failed"); }
    setCreating(false);
  }

  async function deleteSite(id: string, name: string) {
    if (!confirm(`Delete site "${name}"? This removes all files.`)) return;
    try { await Sites.delete(id); onReload(); } catch {}
  }

  async function startDev(site: Site) {
    try { await Sites.startDevServer(site.id); onReload(); } catch {}
  }

  async function stopDev(site: Site) {
    try { await Sites.stopDevServer(site.id); onReload(); } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-ink-400">{sites.length} site{sites.length !== 1 ? "s" : ""}</p>
        {!showCreate && <button onClick={() => setShowCreate(true)} className="btn btn-outline btn-xs"><Plus className="w-3 h-3" /> New Site</button>}
      </div>

      {showCreate && (
        <div className="border border-line rounded bg-paper p-4 mb-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Site name" className="input text-sm" autoFocus />
          <div className="flex gap-2">
            {["blank", "blog", "marketing", "event", "slides", "data"].map((v) => (
              <button key={v} onClick={() => setVariant(v)}
                className={`px-3 py-1.5 rounded text-xs font-medium border ${
                  variant === v ? "bg-ink-900 text-paper border-ink-900" : "bg-paper text-ink-600 border-line hover:border-ink-400"
                }`}
              >{v}</button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="btn btn-xs">Cancel</button>
            <button onClick={createSite} disabled={creating || !name.trim()} className="btn btn-primary btn-xs">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {sites.map((s) => (
          <div key={s.id} className="border border-line rounded bg-paper px-3 py-2 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-ink-900 truncate">{s.name}</div>
              <div className="text-2xs text-ink-400 space-x-2">
                <span className="capitalize">{s.variant}</span>
                <span className={`${s.devStatus === 'running' ? 'text-emerald-600' : 'text-ink-300'}`}>
                  {s.devStatus}
                </span>
                {s.publishedServiceId && <span className="text-blue-600">published</span>}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {s.devStatus !== "running" ? (
                <button onClick={() => startDev(s)} className="btn btn-ghost btn-xs" title="Start dev server">
                  <Play className="w-3 h-3 text-emerald-600" />
                </button>
              ) : (
                <button onClick={() => stopDev(s)} className="btn btn-ghost btn-xs" title="Stop dev server">
                  <Square className="w-3 h-3 text-rose-600" />
                </button>
              )}
              <button onClick={() => deleteSite(s.id, s.name)} className="btn btn-ghost btn-xs text-rose-700" title="Delete">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        {sites.length === 0 && !showCreate && (
          <div className="text-xs text-ink-400 italic text-center py-8">No sites yet. Create one to get started.</div>
        )}
      </div>
    </div>
  );
}

function ServicesPanel({ services, onReload }: { services: UserService[]; onReload: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [entrypoint, setEntrypoint] = useState("");
  const [mode, setMode] = useState("http");
  const [workdir, setWorkdir] = useState("");
  const [creating, setCreating] = useState(false);

  async function createService() {
    if (!label.trim() || !entrypoint.trim()) return;
    setCreating(true);
    try {
      await Services.create(label.trim(), mode, entrypoint.trim(), { workdir: workdir.trim() || undefined });
      setShowCreate(false); setLabel(""); setEntrypoint(""); setMode("http"); setWorkdir("");
      onReload();
    } catch (e: any) { alert(e?.message ?? "create failed"); }
    setCreating(false);
  }

  async function toggle(svc: UserService) {
    try {
      if (svc.status === "running") await Services.stop(svc.id);
      else await Services.start(svc.id);
      onReload();
    } catch {}
  }

  async function restart(svc: UserService) {
    try { await Services.restart(svc.id); onReload(); } catch {}
  }

  async function del(svc: UserService) {
    if (!confirm(`Delete service "${svc.label}"?`)) return;
    try { await Services.delete(svc.id); onReload(); } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-ink-400">{services.length} service{services.length !== 1 ? "s" : ""}</p>
        {!showCreate && <button onClick={() => setShowCreate(true)} className="btn btn-outline btn-xs"><Plus className="w-3 h-3" /> New Service</button>}
      </div>

      {showCreate && (
        <div className="border border-line rounded bg-paper p-4 mb-4 space-y-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="input text-sm" />
          <div className="flex gap-2">
            {["http", "tcp", "process"].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-xs font-medium border ${
                  mode === m ? "bg-ink-900 text-paper border-ink-900" : "bg-paper text-ink-600 border-line"
                }`}
              >{m}</button>
            ))}
          </div>
          <textarea value={entrypoint} onChange={(e) => setEntrypoint(e.target.value)}
            placeholder="Entrypoint command (e.g. bash -c 'node server.js')" className="input text-xs font-mono min-h-[40px] resize-y" />
          <input value={workdir} onChange={(e) => setWorkdir(e.target.value)} placeholder="Work directory (optional)" className="input text-xs font-mono" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="btn btn-xs">Cancel</button>
            <button onClick={createService} disabled={creating || !label.trim() || !entrypoint.trim()} className="btn btn-primary btn-xs">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {services.map((s) => (
          <div key={s.id} className="border border-line rounded bg-paper px-3 py-2 flex items-center gap-2">
            <Server className="w-4 h-4 shrink-0 text-amber-500" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-ink-900 truncate">{s.label}</div>
              <div className="text-2xs text-ink-400 space-x-2">
                <span className="uppercase text-[10px]">{s.mode}</span>
                <span className={s.status === "running" ? "text-emerald-600" : s.status === "error" ? "text-rose-600" : "text-ink-300"}>
                  {s.status}
                </span>
                {s.httpUrl && (
  <span className="flex items-center gap-1">
    <a
      href={`/api/services/${s.id}/proxy/`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 underline text-[11px]"
    >
      Open ↗
    </a>
    <span className="text-ink-300 text-[10px]">{s.httpUrl}</span>
  </span>
)}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => toggle(s)} className="btn btn-ghost btn-xs" title={s.status === "running" ? "Stop" : "Start"}>
                {s.status === "running" ? <Square className="w-3 h-3 text-rose-600" /> : <Play className="w-3 h-3 text-emerald-600" />}
              </button>
              <button onClick={() => restart(s)} className="btn btn-ghost btn-xs" title="Restart">
                <RotateCcw className="w-3 h-3 text-ink-400" />
              </button>
              <button onClick={() => del(s)} className="btn btn-ghost btn-xs text-rose-700"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
        {services.length === 0 && !showCreate && (
          <div className="text-xs text-ink-400 italic text-center py-8">No services yet.</div>
        )}
      </div>
    </div>
  );
}
