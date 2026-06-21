import { useEffect, useMemo, useState, useCallback } from "react";
import { Integrations, type PdApp, type PdComponent, type IntegrationConnection, type IntegrationAction } from "../api";
import {
  Plus, Plug, Unplug, Trash2, Search, ExternalLink,
  RefreshCw, Check, X, AlertCircle, Key, Globe,
  Loader2, ChevronDown, ChevronRight, Zap, BookOpen,
  Puzzle, Shield, ArrowLeft, Settings2, Grid3X3,
  List, ChevronLeft, ChevronRight as ChevronRightIcon,
  Wifi, WifiOff,
} from "lucide-react";

// ---- ChevronLeft icon inline (used by page) ----
function ChevronLeftIcon(props: any) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ==============================================================
// SECTION: Pipedream API Key Setup
// ==============================================================

function PipedreamKeySetup({
  onConfigured,
}: {
  onConfigured: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError("");
    try {
      await Integrations.setPipedreamKey(key.trim());
      onConfigured();
    } catch (e: any) {
      setError(e?.message || "Failed to save key");
    }
    setSaving(false);
  };

  return (
    <div className="border border-line rounded bg-paper overflow-hidden">
      <div className="px-5 py-4 border-b border-line bg-amber-50/50">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-600" />
          <h3 className="font-medium text-ink-900 text-sm">Pipedream API Key Required</h3>
        </div>
        <p className="text-xs text-ink-500 mt-1 ml-6">
          The app catalog and action execution are powered by Pipedream's API.
          Get your key from{" "}
          <a
            href="https://pipedream.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="underline text-amber-700 hover:text-amber-800"
          >
            pipedream.com/settings/keys
          </a>
        </p>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="pd_key_..."
              className="input pl-9 font-mono w-full"
              autoComplete="off"
            />
          </div>
          <button
            onClick={() => setShowKey(!showKey)}
            className="btn btn-ghost btn-icon"
            title={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <X className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim() || saving}
            className="btn btn-primary"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save Key
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ==============================================================
// SECTION: Pipedream Key Status
// ==============================================================

function PipedreamKeyBanner({
  status,
  onOpenKeySetup,
}: {
  status: { configured: boolean; valid: boolean; message: string } | null;
  onOpenKeySetup: () => void;
}) {
  if (!status) return null;
  if (status.configured && status.valid) return null;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded text-xs ${
      !status.configured
        ? "bg-amber-50 border border-amber-200 text-amber-800"
        : "bg-red-50 border border-red-200 text-red-700"
    }`}>
      {!status.configured ? (
        <>
          <Key className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Pipedream API key not configured — the app catalog and action execution require one.</span>
          <button onClick={onOpenKeySetup} className="underline font-medium">Configure</button>
        </>
      ) : (
        <>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Pipedream API key is invalid or expired.</span>
          <button onClick={onOpenKeySetup} className="underline font-medium">Update</button>
        </>
      )}
    </div>
  );
}

// ==============================================================
// SECTION: App Card (Catalog Grid)
// ==============================================================

function AppCard({
  app,
  onConnect,
  onRefresh,
}: {
  app: PdApp;
  onConnect: (app: PdApp) => void;
  onRefresh: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [appData, setAppData] = useState<{ actions: PdComponent[]; triggers: PdComponent[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!appData) {
      setLoading(true);
      setError("");
      try {
        const res = await Integrations.getCatalogApp(app.name_slug);
        setAppData({ actions: res.actions, triggers: res.triggers });
      } catch (e: any) {
        setError(e?.message || "Failed to load app details");
      }
      setLoading(false);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await Integrations.refreshCatalogCache(app.name_slug);
      setAppData(null);
      setOpen(false);
    } catch {}
  };

  const authBadge = app.auth_type === "oauth" ? "OAuth" : app.auth_type === "api_key" ? "API Key" : app.auth_type === "keys" ? "Keys" : "No Auth";
  const totalActions = (appData?.actions.length ?? app.action_count) + (appData?.triggers.length ?? app.trigger_count);

  return (
    <div className="border border-line rounded bg-paper overflow-hidden transition-shadow hover:shadow-sm">
      {/* Card header — always visible */}
      <button
        onClick={toggle}
        className="w-full text-left p-3 hover:bg-paper-200/50 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          {/* Logo */}
          <div className="w-8 h-8 rounded-md bg-ink-100 flex items-center justify-center text-sm font-bold text-ink-600 shrink-0 overflow-hidden border border-line/50">
            {app.logo_url ? (
              <img src={app.logo_url} alt="" className="w-full h-full object-contain" />
            ) : (
              app.name.charAt(0).toUpperCase()
            )}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-ink-900 truncate">{app.name}</span>
              {app.connected && (
                <span className="shrink-0 px-1.5 py-0.5 text-2xs bg-emerald-50 text-emerald-700 rounded-full font-medium">
                  Connected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xs font-mono text-ink-400 uppercase tracking-wide">{authBadge}</span>
              <span className="text-2xs text-ink-300">·</span>
              <span className="text-2xs text-ink-400">{totalActions} {totalActions === 1 ? "action" : "actions"}</span>
            </div>
          </div>
          {/* Expand arrow */}
          <div className="shrink-0 mt-0.5">
            {open ? (
              <ChevronDown className="w-3.5 h-3.5 text-ink-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-ink-400" />
            )}
          </div>
        </div>
        {app.description && (
          <p className="text-xs text-ink-500 mt-1.5 line-clamp-2 leading-relaxed">{app.description}</p>
        )}
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div className="border-t border-line">
          {/* Action/trigger lists */}
          <div className="p-3 max-h-[240px] overflow-y-auto space-y-1.5">
            {loading && (
              <div className="flex items-center gap-2 py-3 text-xs text-ink-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading actions...
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 py-2 text-xs text-red-600">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {error}
              </div>
            )}
            {appData && (
              <>
                {appData.actions.length === 0 && appData.triggers.length === 0 && (
                  <p className="text-xs text-ink-400 py-2 italic">No components catalogued yet.</p>
                )}
                {appData.actions.slice(0, 8).map((ac) => (
                  <div key={ac.id} className="flex items-center gap-2 text-xs text-ink-600">
                    <Zap className="w-3 h-3 text-ink-400 shrink-0" />
                    <span className="truncate font-medium">{ac.name}</span>
                    {ac.description && (
                      <span className="text-ink-400 truncate hidden md:inline">— {ac.description}</span>
                    )}
                  </div>
                ))}
                {appData.actions.length > 8 && (
                  <p className="text-2xs text-ink-400 pl-5">+{appData.actions.length - 8} more actions</p>
                )}
                {appData.triggers.length > 0 && (
                  <div className="pt-1.5 border-t border-line/50 mt-1.5">
                    <p className="text-2xs text-ink-400 font-medium uppercase tracking-wider mb-1">Triggers</p>
                    {appData.triggers.slice(0, 4).map((tr) => (
                      <div key={tr.id} className="flex items-center gap-2 text-xs text-ink-600">
                        <BookOpen className="w-3 h-3 text-ink-400 shrink-0" />
                        <span className="truncate font-medium">{tr.name}</span>
                      </div>
                    ))}
                    {appData.triggers.length > 4 && (
                      <p className="text-2xs text-ink-400 pl-5">+{appData.triggers.length - 4} more triggers</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action bar */}
          <div className="border-t border-line p-3 flex items-center justify-between bg-paper-100/50">
            <div className="flex items-center gap-2">
              <span className="text-2xs px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-600 font-mono uppercase">
                {app.auth_type}
              </span>
              {app.auth_description && (
                <span className="text-2xs text-ink-400 truncate max-w-[160px]">{app.auth_description}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRefresh}
                className="btn btn-ghost btn-icon btn-sm text-ink-400 hover:text-ink-700"
                title="Refresh cached actions from Pipedream"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <a
                href={`https://pipedream.com/apps/${app.name_slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-icon btn-sm text-ink-400 hover:text-ink-700"
                title="View on Pipedream"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              {app.connected ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-medium">
                  <Wifi className="w-3 h-3" /> Connected
                </span>
              ) : (
                <button
                  onClick={() => onConnect(app)}
                  className="btn btn-sm"
                >
                  <Plug className="w-3 h-3" /> Connect
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==============================================================
// SECTION: Catalog Browser
// ==============================================================

function CatalogView({
  onConnect,
  onBack,
  pdConfigured,
}: {
  onConnect: (app: PdApp) => void;
  onBack: () => void;
  pdConfigured: boolean;
}) {
  const [apps, setApps] = useState<PdApp[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  const fetchPage = useCallback(async (p: number, q: string, cat: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await Integrations.catalog({
        q: q || undefined,
        page: p,
        per_page: perPage,
        category: cat || undefined,
      });
      setApps(res.apps);
      setTotal(res.total);
      setPages(res.pages);
      setPage(res.page);
    } catch (e: any) {
      setError(e?.message || "Failed to load catalog");
    }
    setLoading(false);
  }, [perPage]);

  // Initial load and when search/submit changes
  const doSearch = useCallback(() => {
    setPage(1);
    fetchPage(1, searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory, fetchPage]);

  const goToPage = useCallback((p: number) => {
    fetchPage(p, searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory, fetchPage]);

  // Load categories on mount
  useEffect(() => {
    Integrations.categories()
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  // Initial load
  useEffect(() => {
    fetchPage(1, "", "");
  }, [fetchPage]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setSearchQuery(search);
      setPage(1);
    }
  };

  const handleCategoryClick = (cat: string) => {
    const next = cat === selectedCategory ? "" : cat;
    setSelectedCategory(next);
    setSearchQuery("");
    setSearch("");
    setPage(1);
    fetchPage(1, "", next);
  };

  const handleClearSearch = () => {
    setSearch("");
    setSearchQuery("");
    setSelectedCategory("");
    setPage(1);
    fetchPage(1, "", "");
  };

  // Pagination range
  const pageRange = useMemo(() => {
    const range: (number | "...")[] = [];
    const totalP = Math.max(1, pages);
    if (totalP <= 7) {
      for (let i = 1; i <= totalP; i++) range.push(i);
    } else {
      range.push(1);
      if (page > 3) range.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalP - 1, page + 1); i++) {
        range.push(i);
      }
      if (page < totalP - 2) range.push("...");
      range.push(totalP);
    }
    return range;
  }, [pages, page]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn btn-ghost text-ink-600">
          <ChevronLeftIcon /> Back
        </button>
        <h2 className="serif text-xl text-ink-900">App Catalog</h2>
        <button
          onClick={() => fetchPage(page, searchQuery, selectedCategory)}
          className="btn btn-ghost text-ink-600"
          title="Refresh catalog"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!pdConfigured && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <Key className="w-3.5 h-3.5 shrink-0" />
          Set up your Pipedream API key above to browse the full catalog.
        </div>
      )}

      {/* Search + Clear */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={`Search ${total || "2,500+"} apps...`}
            className="input pl-9 font-mono w-full"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setSearchQuery(""); setPage(1); fetchPage(1, "", selectedCategory); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={doSearch}
          disabled={!search.trim()}
          className="btn btn-primary"
        >
          <Search className="w-3.5 h-3.5" /> Search
        </button>
        {(searchQuery || selectedCategory) && (
          <button onClick={handleClearSearch} className="btn btn-ghost text-ink-600">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Category chips */}
      {categories.length > 0 && !searchQuery && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => handleCategoryClick("")}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              selectedCategory === ""
                ? "bg-ink-900 text-paper border-ink-900"
                : "border-line text-ink-500 hover:text-ink-900 hover:border-ink-300"
            }`}
          >
            All
          </button>
          {categories.slice(0, 24).map((c) => (
            <button
              key={c}
              onClick={() => handleCategoryClick(c)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors capitalize ${
                selectedCategory === c
                  ? "bg-ink-900 text-paper border-ink-900"
                  : "border-line text-ink-500 hover:text-ink-900 hover:border-ink-300"
              }`}
            >
              {c.replace(/-/g, " ")}
            </button>
          ))}
          {categories.length > 24 && (
            <span className="text-2xs text-ink-400 self-center">+{categories.length - 24} more</span>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-ink-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading catalog...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Failed to load catalog</p>
            <p className="text-xs mt-1 text-red-500">{error}</p>
          </div>
        </div>
      )}

      {/* App grid */}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {apps.map((app) => (
              <AppCard
                key={app.name_slug}
                app={app}
                onConnect={onConnect}
                onRefresh={(slug) => {
                  Integrations.refreshCatalogCache(slug).then(() => {
                    fetchPage(page, searchQuery, selectedCategory);
                  }).catch(() => {});
                }}
              />
            ))}
            {apps.length === 0 && (
              <div className="col-span-full text-center py-16 text-ink-400">
                <div className="flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 stroke-[1]" />
                  <p className="text-sm">
                    {searchQuery
                      ? `No apps matching "${searchQuery}"`
                      : selectedCategory
                      ? `No apps in "${selectedCategory}"`
                      : "No apps found"}
                  </p>
                  <button onClick={handleClearSearch} className="btn btn-sm btn-ghost">
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="btn btn-ghost btn-icon btn-sm disabled:opacity-30"
              >
                <ChevronLeftIcon />
              </button>
              {pageRange.map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="text-xs text-ink-400 px-1">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p as number)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      p === page
                        ? "bg-ink-900 text-paper font-medium"
                        : "text-ink-500 hover:text-ink-900 hover:bg-paper-200"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= pages}
                className="btn btn-ghost btn-icon btn-sm disabled:opacity-30"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="text-2xs text-ink-400 text-center mt-2">
            Powered by{" "}
            <a href="https://pipedream.com" target="_blank" rel="noreferrer" className="underline hover:text-ink-700">Pipedream</a>
            {" "}— {total.toLocaleString()}+ apps available · page {page} of {pages}
          </p>
        </>
      )}
    </div>
  );
}

// ==============================================================
// SECTION: Connected Integrations
// ==============================================================

function ConnectedView({
  connections,
  onDisconnect,
  onRefresh,
  onOpenCatalog,
}: {
  connections: IntegrationConnection[];
  onDisconnect: (id: string) => void;
  onRefresh: () => void;
  onOpenCatalog: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [actionsMap, setActionsMap] = useState<Map<string, IntegrationAction[]>>(new Map());
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

  const toggle = async (conn: IntegrationConnection) => {
    if (selected === conn.id) { setSelected(null); return; }
    setSelected(conn.id);
    if (!actionsMap.has(conn.id)) {
      setLoadingActions((prev) => new Set(prev).add(conn.id));
      try {
        const res = await Integrations.listActions(conn.id);
        setActionsMap((prev) => new Map(prev).set(conn.id, res.actions));
      } catch {}
      setLoadingActions((prev) => {
        const next = new Set(prev);
        next.delete(conn.id);
        return next;
      });
    }
  };

  const handleDisconnect = async (conn: IntegrationConnection) => {
    try {
      await Integrations.disconnect(conn.id);
      onDisconnect(conn.id);
    } catch {}
  };

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-ink-400 gap-4">
        <div className="w-16 h-16 rounded-full bg-ink-100 flex items-center justify-center">
          <Puzzle className="w-7 h-7 stroke-[1.5]" />
        </div>
        <p className="text-sm">No integrations connected yet</p>
        <p className="text-xs text-ink-400 max-w-xs text-center">
          Browse the catalog of 2,500+ apps and connect your first one to start building automations.
        </p>
        <button onClick={onOpenCatalog} className="btn btn-primary">
          <Search className="w-3.5 h-3.5" /> Browse Catalog
        </button>
      </div>
    );
  }

  const connected = connections.filter((c) => c.status === "connected");
  const error = connections.filter((c) => c.status === "error");
  const pending = connections.filter((c) => c.status === "disconnected" || c.status === "connecting");

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs text-ink-500">
        <span className="flex items-center gap-1">
          <Wifi className="w-3.5 h-3.5 text-emerald-500" />
          {connected.length} connected
        </span>
        {error.length > 0 && (
          <span className="flex items-center gap-1">
            <WifiOff className="w-3.5 h-3.5 text-red-500" />
            {error.length} error
          </span>
        )}
        {pending.length > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
            {pending.length} pending
          </span>
        )}
      </div>

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <h2 className="serif text-xl text-ink-900">
          Connected <span className="text-sm font-mono text-ink-400 font-normal">({connections.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={onOpenCatalog} className="btn btn-sm">
            <Plus className="w-3.5 h-3.5" /> Add Integration
          </button>
          <button onClick={onRefresh} className="btn btn-ghost btn-icon" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Connection list */}
      <div className="space-y-2">
        {connections.map((conn) => {
          const isSelected = selected === conn.id;
          const connActions = actionsMap.get(conn.id);
          const isLoadingAction = loadingActions.has(conn.id);

          return (
            <div key={conn.id} className="border border-line rounded bg-paper overflow-hidden">
              <button
                onClick={() => toggle(conn)}
                className="w-full text-left p-3.5 hover:bg-paper-200/50 transition-colors flex items-center gap-3"
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  conn.status === "connected" ? "bg-emerald-500" :
                  conn.status === "error" ? "bg-red-500" : "bg-amber-400"
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{conn.app_name}</span>
                    {conn.auth_type && (
                      <span className="text-2xs font-mono text-ink-400 uppercase">{conn.auth_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {conn.app_description && (
                      <span className="text-xs text-ink-500 truncate max-w-[300px]">{conn.app_description}</span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className={`text-2xs px-1.5 py-0.5 rounded-full capitalize font-medium ${
                    conn.status === "connected" ? "bg-emerald-50 text-emerald-700" :
                    conn.status === "error" ? "bg-red-50 text-red-700" :
                    conn.status === "connecting" ? "bg-amber-50 text-amber-700" :
                    "bg-ink-100 text-ink-500"
                  }`}>
                    {conn.status}
                  </span>
                  {isSelected ? (
                    <ChevronDown className="w-3.5 h-3.5 text-ink-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-ink-400" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isSelected && (
                <div className="border-t border-line">
                  {/* Actions list */}
                  <div className="p-3.5 max-h-[240px] overflow-y-auto space-y-1">
                    {isLoadingAction && (
                      <div className="flex items-center gap-2 py-3 text-xs text-ink-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading actions...
                      </div>
                    )}
                    {connActions && connActions.length === 0 && (
                      <p className="text-xs text-ink-400 py-2 italic">
                        No actions cached. Sync from Pipedream to populate.
                      </p>
                    )}
                    {connActions?.slice(0, 12).map((ac) => (
                      <div key={ac.id} className="flex items-center gap-2 text-xs text-ink-600 py-0.5">
                        <Zap className="w-3 h-3 text-ink-400 shrink-0" />
                        <span className="font-medium">{ac.name}</span>
                        {ac.description && (
                          <span className="text-ink-400 truncate hidden sm:inline">— {ac.description}</span>
                        )}
                      </div>
                    ))}
                    {connActions && connActions.length > 12 && (
                      <p className="text-2xs text-ink-400 pl-5">+{connActions.length - 12} more actions</p>
                    )}
                  </div>

                  {/* Actions bar */}
                  <div className="border-t border-line p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-2xs text-ink-400">
                      <Globe className="w-3 h-3" />
                      Connected: {new Date(conn.created_at).toLocaleDateString()}
                      {conn.connected_account_id && (
                        <span className="hidden sm:inline"> · PD account: <code className="font-mono bg-ink-100 px-1 rounded">{conn.connected_account_id.slice(0, 12)}...</code></span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          try {
                            await Integrations.refreshCatalogCache(conn.app_slug);
                            const res = await Integrations.listActions(conn.id);
                            setActionsMap((prev) => new Map(prev).set(conn.id, res.actions));
                          } catch {}
                        }}
                        className="btn btn-ghost btn-icon btn-sm text-ink-400"
                        title="Refresh actions"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDisconnect(conn)}
                        className="btn btn-ghost btn-icon btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Disconnect"
                      >
                        <Unplug className="w-3 h-3" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await Integrations.disconnect(conn.id);
                            onDisconnect(conn.id);
                          } catch {}
                        }}
                        className="btn btn-ghost btn-icon btn-sm text-ink-400 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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

// ==============================================================
// SECTION: API Key Dialog
// ==============================================================

function ApiKeyDialog({
  app,
  onClose,
  onConnected,
}: {
  app: PdApp;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"connect" | "credentials">("connect");

  const handleConnect = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await Integrations.connect(app.name_slug);
      if (res.connection) {
        // Now set the credentials
        setStep("credentials");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to connect");
    }
    setSaving(false);
  };

  const handleSetCredentials = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError("");
    try {
      // We need to get the connection ID first
      const listRes = await Integrations.list();
      const conn = listRes.connections.find((c) => c.app_slug === app.name_slug);
      if (conn) {
        await Integrations.setCredentials(conn.id, key.trim());
        onConnected();
      } else {
        setError("Connection not found. Please try again.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to save credentials");
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-line rounded-lg shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-ink-100 flex items-center justify-center text-sm font-bold text-ink-600 overflow-hidden">
            {app.logo_url ? (
              <img src={app.logo_url} alt="" className="w-full h-full object-contain" />
            ) : (
              app.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h3 className="font-medium text-ink-900 text-sm">{app.name}</h3>
            <p className="text-2xs text-ink-400 uppercase">{app.auth_type} Integration</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === "connect" ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                This app uses <strong>{app.auth_type === "oauth" ? "OAuth" : "API Key"}</strong> authentication.
              </p>
              <p className="text-xs text-ink-500">{app.auth_description || `${app.name} will be added to your connected integrations.`}</p>
              {error && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
              <button
                onClick={handleConnect}
                disabled={saving}
                className="btn btn-primary w-full justify-center"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                {saving ? "Connecting..." : `Connect ${app.name}`}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                {app.auth_type === "api_key"
                  ? `Enter your ${app.name} API key to complete the connection.`
                  : `Enter your ${app.name} credentials.`
                }
              </p>
              <div>
                <label className="label text-xs text-ink-500 mb-1">API Key / Token</label>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={`${app.name} API key...`}
                  className="input font-mono w-full"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              {error && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button onClick={onClose} className="btn btn-ghost">Cancel</button>
                <button
                  onClick={handleSetCredentials}
                  disabled={!key.trim() || saving}
                  className="btn btn-primary"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {saving ? "Saving..." : "Save & Connect"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==============================================================
// MAIN PAGE
// ==============================================================

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);
  const [connectingApp, setConnectingApp] = useState<PdApp | null>(null);
  const [pdStatus, setPdStatus] = useState<{ configured: boolean; valid: boolean; message: string } | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");

    // Check PD key status in parallel with fetching connections
    const statusPromise = Integrations.pipedreamStatus().then(setPdStatus).catch(() => {});
    const statsPromise = Integrations.stats().then(setStats).catch(() => {});

    try {
      const res = await Integrations.list();
      setConnections(res.connections);
    } catch (e: any) {
      setError(e?.message || "Failed to load integrations");
    }

    await Promise.allSettled([statusPromise, statsPromise]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Handle connecting an app
  const handleConnect = useCallback((app: PdApp) => {
    setConnectingApp(app);
  }, []);

  // After successful connect
  const handleConnected = useCallback(() => {
    setConnectingApp(null);
    setShowCatalog(false);
    fetchAll();
  }, [fetchAll]);

  const removeById = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  };

  // Determine if PD is ready
  const pdReady = pdStatus?.configured && pdStatus?.valid;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Puzzle className="w-5 h-5 text-ink-600" />
            <span className="eyebrow">Library</span>
          </div>
          <h1 className="serif text-2xl text-ink-900">Integrations</h1>
          <p className="text-sm text-ink-500 mt-1">
            Connect your agents to {pdReady ? "2,500+" : ""} external services via Pipedream
          </p>
        </div>

        {/* PD Key status indicator */}
        {pdStatus && (
          <div className="flex items-center gap-2">
            {pdReady ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
                <Check className="w-3 h-3" />
                Pipedream Connected
              </span>
            ) : (
              <button
                onClick={() => setShowKeySetup(true)}
                className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors"
              >
                <Key className="w-3 h-3" />
                {pdStatus.configured ? "Invalid Key" : "Set Up Pipedream Key"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pipedream key setup banner (when shown) */}
      {showKeySetup && (!pdReady) && (
        <div className="relative">
          <PipedreamKeySetup
            onConfigured={() => {
              setShowKeySetup(false);
              fetchAll();
            }}
          />
          <button
            onClick={() => setShowKeySetup(false)}
            className="absolute top-3 right-3 text-ink-400 hover:text-ink-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pipedream key warning banner (when not shown but needed) */}
      {!showKeySetup && !pdReady && (
        <PipedreamKeyBanner
          status={pdStatus}
          onOpenKeySetup={() => setShowKeySetup(true)}
        />
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError("")} className="shrink-0"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Stats row */}
      {stats && stats.total > 0 && !showCatalog && (
        <div className="flex items-center gap-4 text-xs text-ink-500 border border-line rounded bg-paper px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <Puzzle className="w-3.5 h-3.5" />
            <strong className="text-ink-700">{stats.total}</strong> total
          </span>
          {Object.entries(stats.byStatus).map(([status, count]) =>
            count > 0 ? (
              <span key={status} className="flex items-center gap-1.5 capitalize">
                <span className={`w-2 h-2 rounded-full ${
                  status === "connected" ? "bg-emerald-500" :
                  status === "error" ? "bg-red-500" :
                  status === "connecting" ? "bg-amber-400" : "bg-ink-300"
                }`} />
                <strong className="text-ink-700">{count}</strong> {status}
              </span>
            ) : null
          )}
        </div>
      )}

      {/* API Key Dialog */}
      {connectingApp && (
        <ApiKeyDialog
          app={connectingApp}
          onClose={() => setConnectingApp(null)}
          onConnected={handleConnected}
        />
      )}

      {/* Main content area */}
      <div>
        {/* View switcher */}
        <div className="flex items-center gap-4 border-b border-line mb-4">
          <button
            onClick={() => setShowCatalog(false)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              !showCatalog
                ? "text-ink-900 border-ink-900"
                : "text-ink-400 border-transparent hover:text-ink-700"
            }`}
          >
            Connected {connections.length > 0 && !loading && (
              <span className="ml-1 text-xs font-mono text-ink-400">({connections.length})</span>
            )}
          </button>
          <button
            onClick={() => setShowCatalog(true)}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              showCatalog
                ? "text-ink-900 border-ink-900"
                : "text-ink-400 border-transparent hover:text-ink-700"
            }`}
          >
            Browse Catalog
            {!loading && (
              <span className="ml-1 text-xs font-mono text-ink-400">(2,500+)</span>
            )}
          </button>
        </div>

        {/* View content */}
        {loading && !showCatalog ? (
          <div className="flex items-center justify-center py-24 text-ink-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading integrations...</span>
          </div>
        ) : showCatalog ? (
          <CatalogView
            onConnect={handleConnect}
            onBack={() => setShowCatalog(false)}
            pdConfigured={!!pdReady}
          />
        ) : (
          <ConnectedView
            connections={connections}
            onDisconnect={removeById}
            onRefresh={fetchAll}
            onOpenCatalog={() => setShowCatalog(true)}
          />
        )}
      </div>
    </div>
  );
}
