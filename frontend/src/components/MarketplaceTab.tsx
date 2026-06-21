/**
 * MarketplaceTab — browse and one-click install MCP servers from the
 * curated marketplace. Uses tailwind classes consistent with the rest of
 * the lab. Filtering is client-side, instant.
 */
import { useMemo, useState } from "react";
import { Search, Download, Star, Package, AlertCircle, ChevronRight, ExternalLink, Circle, CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

type McpItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  downloads: number;
  status: "installed" | "available" | "error";
  installedVersion?: string;
  latestVersion: string;
  url?: string;
};

const CATEGORY_BADGE: Record<string, string> = {
  data: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  dev: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  productivity: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  research: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  finance: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  comms: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  utility: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export default function MarketplaceTab({
  items,
  onInstall,
  onUninstall,
  onRefresh,
  loading,
  query,
  setQuery,
  category,
  setCategory,
}: {
  items: McpItem[];
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  onRefresh: () => void;
  loading: boolean;
  query: string;
  setQuery: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
}) {
  const categories = useMemo(() => {
    const set = new Set<string>(items.map((i) => i.category));
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.author.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q)
      );
    });
  }, [items, query, category]);

  const counts = useMemo(() => {
    const c = { installed: 0, available: 0, error: 0 };
    items.forEach((i) => (c[i.status] += 1));
    return c;
  }, [items]);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 text-emerald-400" />
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              MCP Marketplace
            </h1>
          </div>
          <p className="text-sm text-zinc-400 max-w-xl">
            Discover and one-click install Model Context Protocol servers. Each MCP
            adds a new tool surface to every agent in the lab.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh index"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 max-w-2xl">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Installed</div>
          <div className="text-2xl font-semibold text-emerald-400 mt-1">{counts.installed}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Available</div>
          <div className="text-2xl font-semibold text-zinc-200 mt-1">{counts.available}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Errors</div>
          <div className="text-2xl font-semibold text-rose-400 mt-1">{counts.error}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search marketplace…"
            className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={
                "px-2.5 py-1 rounded-md text-xs font-medium border transition " +
                (category === cat
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200")
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-10 text-center text-zinc-500">
          <AlertCircle className="w-6 h-6 mx-auto mb-2 text-zinc-600" />
          <div>No MCP servers match your filters.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item, idx) => (
            <motion.div
              key={item.slug}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.015 }}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3 hover:border-emerald-500/40 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100 truncate">
                      {item.name}
                    </h3>
                    <span
                      className={
                        "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border " +
                        (CATEGORY_BADGE[item.category] ?? CATEGORY_BADGE.utility)
                      }
                    >
                      {item.category}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">
                    by {item.author} · v{item.latestVersion}
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 min-h-[3.2em]">
                {item.description}
              </p>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {item.stars.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {item.downloads.toLocaleString()}
                  </span>
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300"
                  >
                    Docs <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-zinc-800">
                {item.status === "installed" ? (
                  <>
                    <span className="text-xs text-emerald-400 flex-1">
                      v{item.installedVersion ?? item.latestVersion} installed
                    </span>
                    <button
                      onClick={() => onUninstall(item.slug)}
                      className="px-2.5 py-1 rounded-md text-xs border border-zinc-700 bg-zinc-800 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/30 text-zinc-300"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onInstall(item.slug)}
                    className="ml-auto px-2.5 py-1 rounded-md text-xs border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Install
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: McpItem["status"] }) {
  if (status === "installed") {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        <CheckCircle2 className="w-3 h-3" />
        Installed
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300">
        <XCircle className="w-3 h-3" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400">
      <Circle className="w-3 h-3" />
      Available
    </span>
  );
}
