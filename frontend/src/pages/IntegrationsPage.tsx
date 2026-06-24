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
import AnimatedDots from "../components/AnimatedDots";

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
            {saving ? <AnimatedDots invert size={16} /> : <Check className="w-3.5 h-3.5" />}
            {saving ? "Saving Key..." : "Save Key"}
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

// Featured apps for Quick Connect section
// These serve as both slug references and fallback data when the catalog cache is empty.
const FEATURED_APPS = [
  { slug: "gmail", name: "Gmail", auth_type: "oauth" as const, description: "Send and receive emails via Google Gmail" },
  { slug: "microsoft_outlook", name: "Microsoft Outlook", auth_type: "oauth" as const, description: "Email, calendar, and contacts via Microsoft 365" },
  { slug: "twitter", name: "X / Twitter", auth_type: "oauth" as const, description: "Post tweets and send direct messages" },
  { slug: "slack", name: "Slack", auth_type: "oauth" as const, description: "Send messages and notifications to channels" },
  { slug: "n8n", name: "n8n", auth_type: "oauth" as const, description: "Advanced workflow automation" },
  { slug: "github", name: "GitHub", auth_type: "oauth" as const, description: "Manage repos, issues, PRs, and Actions" },
  { slug: "cloudflare", name: "Cloudflare", auth_type: "api_key" as const, description: "DNS, Workers, and other Cloudflare services" },
  { slug: "stripe", name: "Stripe", auth_type: "oauth" as const, description: "Payment processing and billing" },
  { slug: "linkedin", name: "LinkedIn", auth_type: "oauth" as const, description: "Share updates and manage LinkedIn presence" },
  { slug: "moltbook", name: "MoltBook", auth_type: "oauth" as const, description: "AI-powered bookkeeping and accounting" },
];

function FeaturedAppCard({
  app,
  onConnect,
}: {
  app: PdApp;
  onConnect: (app: PdApp) => void;
}) {
  return (
    <button
      onClick={() => onConnect(app)}
      className="flex items-center gap-3 p-3.5 rounded-lg border border-line bg-paper hover:bg-paper-200/60 hover:shadow-sm transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-ink-100 flex items-center justify-center text-sm font-bold text-ink-600 shrink-0 overflow-hidden border border-line/50">
        {app.logo_url ? (
          <img src={app.logo_url} alt="" className="w-full h-full object-contain" />
        ) : (
          app.name.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink-900 truncate">{app.name}</div>
        <div className="text-2xs font-mono text-ink-400 uppercase mt-0.5">
          {app.auth_type === "oauth" ? "OAuth" : app.auth_type === "api_key" ? "API Key" : app.auth_type}
        </div>
      </div>
      <span className="shrink-0 text-xs text-ink-400 hover:text-ink-700">
        <Plus className="w-4 h-4" />
      </span>
    </button>
  );
}

function CatalogView({
  onConnect,
  onBack,
  pdConfigured,
}: {
  onConnect: (app: PdApp) => void;
  onBack: () => void;
  pdConfigured: boolean;
}) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PdApp[] | null>(null);
  const [featured, setFeatured] = useState<PdApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch featured apps on mount — with fallback data so Quick Connect
  // always shows cards even when the catalog cache hasn't been populated yet.
  useEffect(() => {
    setFeaturedLoading(true);
    Promise.all(
      FEATURED_APPS.map((fallback) =>
        Integrations.catalog({ q: fallback.slug, per_page: 5 })
          .then((res) => {
            const match = res.apps.find(
              (a) => a.name_slug === fallback.slug || a.name.toLowerCase().replace(/[^a-z0-9]/g, "_") === fallback.slug
            );
            if (match) return match;
            // Fallback to hardcoded info when catalog doesn't have it yet
            return {
              id: fallback.slug,
              name: fallback.name,
              name_slug: fallback.slug,
              description: fallback.description,
              auth_type: fallback.auth_type,
              auth_description: "",
              action_count: 0,
              trigger_count: 0,
              logo_url: "",
              categories: [],
              connected: false,
            } as PdApp;
          })
          .catch(() => ({
            id: fallback.slug,
            name: fallback.name,
            name_slug: fallback.slug,
            description: fallback.description,
            auth_type: fallback.auth_type,
            auth_description: "",
            action_count: 0,
            trigger_count: 0,
            logo_url: "",
            categories: [],
            connected: false,
          } as PdApp))
      )
    ).then((apps) => {
      setFeatured(apps);
      setFeaturedLoading(false);
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearchQuery(search);
    setLoading(true);
    setError("");
    try {
      const res = await Integrations.catalog({ q: search.trim(), per_page: 50 });
      setSearchResults(res.apps);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setSearchResults(null);
    }
    setLoading(false);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const clearSearch = () => {
    setSearch("");
    setSearchQuery("");
    setSearchResults(null);
    setError("");
  };

  const showFeatured = !searchQuery && !searchResults;

  return (
    <div className="flex flex-col gap-5">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn btn-ghost text-ink-600 shrink-0">
          <ChevronLeftIcon /> Back
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all 2,500+ Pipedream apps..."
            className="input pl-10 w-full"
            autoFocus
          />
          {search && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={!search.trim() || loading}
          className="btn btn-primary"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          Search
        </button>
      </div>

      {!pdConfigured && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <Key className="w-3.5 h-3.5 shrink-0" />
          Set up your Pipedream API key above to browse the full catalog and connect apps.
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Loading search */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-ink-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Searching Pipedream catalog...</span>
        </div>
      )}

      {/* Search results */}
      {searchResults && !loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="serif text-lg text-ink-900">
              Search results for "{searchQuery}"
            </h2>
            <span className="text-xs text-ink-400">{searchResults.length} found</span>
          </div>
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-ink-400 gap-2">
              <Search className="w-8 h-8 stroke-[1]" />
              <p className="text-sm">No apps matching "{searchQuery}"</p>
              <button onClick={clearSearch} className="btn btn-sm btn-ghost mt-2">Clear search</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {searchResults.map((app) => (
                <AppCard
                  key={app.name_slug}
                  app={app}
                  onConnect={onConnect}
                  onRefresh={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Featured apps (Quick Connect) */}
      {showFeatured && (
        <div className="space-y-4">
          <div>
            <h2 className="serif text-lg text-ink-900">Quick Connect</h2>
            <p className="text-xs text-ink-500 mt-1">
              Popular integrations to connect your agents in one click
            </p>
          </div>
          {featuredLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-[68px] rounded-lg bg-paper-100/50 border border-line animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {featured.map((app) => (
                <FeaturedAppCard key={app.name_slug} app={app} onConnect={onConnect} />
              ))}
            </div>
          )}
          <div className="text-center pt-2">
            <p className="text-xs text-ink-400">
              Can't find what you need? Search the full{" "}
              <a
                href="https://pipedream.com/apps"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-ink-700"
              >
                Pipedream catalog
              </a>{" "}
              of 2,500+ apps above.
            </p>
          </div>
        </div>
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
          <Search className="w-3.5 h-3.5" /> Browse Integrations
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
  const [step, setStep] = useState<"connect" | "credentials" | "oauth" | "oauth-verify">("connect");
  const [connectLinkUrl, setConnectLinkUrl] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [oauthStatus, setOauthStatus] = useState("");

  const isOAuth = app.auth_type === "oauth";

  const handleConnect = async () => {
    setSaving(true);
    setError("");
    try {
      const res: any = await Integrations.connect(app.name_slug);

      if (isOAuth && res.connect_link_url) {
        // OAuth flow — open Pipedream Connect Link
        setConnectionId(res.connection?.id || "");
        setConnectLinkUrl(res.connect_link_url);
        setStep("oauth");
        // Open the link in a new window/tab
        window.open(res.connect_link_url, "_blank", "noopener,noreferrer");
      } else if (res.connection) {
        // API key or non-OAuth — show credentials step
        setConnectionId(res.connection.id);
        setStep("credentials");
      } else {
        setError("Failed to create connection");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to connect");
    }
    setSaving(false);
  };

  const handleVerifyOAuth = async () => {
    if (!connectionId) return;
    setSaving(true);
    setError("");
    setOauthStatus("checking...");
    try {
      const res = await Integrations.verifyOAuth(connectionId);
      if (res.connected && res.connectedAccountId) {
        setOauthStatus("connected");
        onConnected();
      } else {
        setOauthStatus("not_connected");
        if (res.message) setError(res.message);
      }
    } catch (e: any) {
      setOauthStatus("not_connected");
      setError(e?.message || "Not connected yet. Complete the authorization in the new window, then click Verify.");
    }
    setSaving(false);
  };

  const handleSetCredentials = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError("");
    try {
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
          {step === "connect" && !isOAuth && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                This app uses <strong>API Key</strong> authentication.
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
                  <AnimatedDots invert size={16} />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                {saving ? "Connecting..." : `Connect ${app.name}`}
              </button>
            </div>
          )}

          {step === "connect" && isOAuth && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                This app uses <strong>OAuth</strong> authentication.
              </p>
              <p className="text-xs text-ink-500">
                {app.auth_description || `${app.name} will be authorized via Pipedream.`}
              </p>
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
                  <AnimatedDots invert size={16} />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                {saving ? "Connecting..." : `Connect ${app.name}`}
              </button>
            </div>
          )}

          {step === "oauth" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>
                  A new window opened to authorize {app.name} on Pipedream. Complete the authorization there, then come back.
                </span>
              </div>
              {connectLinkUrl && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-ink-400">Didn't open? </span>
                  <a
                    href={connectLinkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-blue-600 hover:text-blue-800"
                  >
                    Open again
                  </a>
                </div>
              )}
              <button
                onClick={handleVerifyOAuth}
                disabled={saving}
                className="btn btn-primary w-full justify-center"
              >
                {saving ? (
                  <AnimatedDots invert size={16} />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {saving ? "Verifying..." : "I've Authorized — Verify Connection"}
              </button>
              <button
                onClick={() => { setConnectionId(""); setStep("connect"); }}
                className="btn btn-ghost w-full text-xs text-ink-400"
              >
                Cancel
              </button>
            </div>
          )}

          {step === "credentials" && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Enter your {app.name} API key to complete the connection.
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
                  {saving ? <AnimatedDots invert size={16} /> : <Check className="w-3.5 h-3.5" />}
                  {saving ? "Saving..." : "Save & Connect"}
                </button>
              </div>
            </div>
          )}

          {error && step !== "connect" && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2.5 mt-4">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
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
            Add Integration
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
