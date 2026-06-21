import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Space, type SpaceRoute } from "../api";
import {
  Globe, Plus, Trash2, Eye, EyeOff, FileCode, Code,
  ExternalLink, Copy, Check, AlertCircle, Info,
} from "lucide-react";
import { WebSpacePreview } from "../components/WebSpacePreview";
import { WebSpaceMeta } from "../components/WebSpaceMeta";

type ViewMode = "preview" | "code" | "meta";

export default function WebSpacePage() {
  const [routes, setRoutes] = useState<SpaceRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newPath, setNewPath] = useState("/");
  const [newType, setNewType] = useState<"page" | "api">("page");
  const [codeEdit, setCodeEdit] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [view, setView] = useState<ViewMode>("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const selected = routes.find((r) => r.id === selectedId) ?? null;

  const ownerId = useMemo(() => {
    try {
      const raw = localStorage.getItem("lab.user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.userId) return u.userId as string;
      }
    } catch {}
    return localStorage.getItem("lab.userId") || "me";
  }, [selectedId]);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Space.list();
      setRoutes(res.routes);
    } catch (e: any) {
      setError(e.message || "Failed to load routes");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  useEffect(() => {
    const handler = () => setPreviewKey((k) => k + 1);
    window.addEventListener("webspace:refresh", handler);
    return () => window.removeEventListener("webspace:refresh", handler);
  }, []);

  // When the selected route changes, snap to the most useful view for its type
  useEffect(() => {
    if (!selected) return;
    setView(selected.type === "page" ? "preview" : "code");
    setCodeEdit(selected.code);
  }, [selectedId]);

  const handleCreate = async () => {
    if (!newPath) return;
    setSaving(true);
    try {
      const code = newType === "page"
        ? 'export default function Page() {\n  return (\n    <div className="p-8">\n      <h1 className="text-2xl font-bold">New Page</h1>\n      <p>Edit this route in the code editor.</p>\n    </div>\n  );\n}'
        : 'import type { Context } from "hono";\nexport default (c: Context) => c.json({ message: "Hello from API" });';
      const route = await Space.create(newPath, newType, code, false);
      setRoutes((prev) => [...prev, route]);
      setSelectedId(route.id);
      setCodeEdit(route.code);
      setShowNew(false);
      setNewPath("/");
      setView(route.type === "page" ? "preview" : "code");
      if (route.type === "page") setPreviewKey((k) => k + 1);
    } catch (e: any) {
      setError(e.message || "Failed to create route");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this route?")) return;
    try {
      await Space.delete(id);
      setRoutes((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setCodeEdit("");
      }
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const handleSaveCode = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await Space.update(selected.id, { code: codeEdit });
      setRoutes((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, code: codeEdit } : r))
      );
      setPreviewKey((k) => k + 1);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    }
    setSaving(false);
  };

  const handleTogglePublic = async (route: SpaceRoute) => {
    try {
      await Space.publish(route.id, !route.public);
      setRoutes((prev) =>
        prev.map((r) => (r.id === route.id ? { ...r, public: !route.public } : r))
      );
    } catch (e: any) {
      setError(e.message || "Failed to update visibility");
    }
  };

  const handleSelect = (route: SpaceRoute) => {
    setSelectedId(route.id);
    setView(route.type === "page" ? "preview" : "code");
    if (route.type === "page") setPreviewKey((k) => k + 1);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const routeUrl = (route: SpaceRoute) => {
    const base = window.location.origin;
    const p = route.path.startsWith("/") ? route.path : `/${route.path}`;
    return `${base}/ws/${ownerId}${p === "" ? "/" : p}`;
  };

  // Sliding indicator for the segmented control
  const segRef = useRef<HTMLDivElement>(null);
  const [segStyle, setSegStyle] = useState<{ x: number; w: number; opacity: number }>({
    x: 1, w: 68, opacity: 1,
  });
  useEffect(() => {
    if (!segRef.current) return;
    const map: Record<ViewMode, string> = { preview: "preview", code: "code", meta: "meta" };
    const btn = segRef.current.querySelector<HTMLButtonElement>(`[data-seg="${map[view]}"]`);
    if (!btn) return;
    const parent = segRef.current.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    setSegStyle({ x: r.left - parent.left, w: r.width, opacity: 1 });
  }, [view, selectedId]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Globe className="w-4 h-4 text-ink-400" />
          <span className="text-sm font-medium text-ink-900">
            Routes {routes.length > 0 && <span className="text-ink-400 font-normal">({routes.length})</span>}
          </span>
        </div>

        {/* Segmented control — matches the reference markup */}
        <div
          ref={segRef}
          className="relative isolate flex items-stretch flex-shrink-0 rounded-xl bg-muted/50 border border-border/20 p-px"
          style={{
            boxShadow:
              "rgba(0, 0, 0, 0.04) 0px 2px 3px inset, rgba(0, 0, 0, 0.03) 0px 1px 1px inset, rgba(255, 255, 255, 0.06) 0px -1px 0px inset",
          }}
        >
          <div
            className="pointer-events-none inset-y-px left-0 rounded-xl bg-background/60 border border-border/30 transition-[transform,width,opacity] duration-200 ease-out motion-reduce:transition-none"
            style={{
              position: "absolute",
              transform: `translateX(${segStyle.x}px)`,
              width: `${segStyle.w}px`,
              opacity: segStyle.opacity,
              boxShadow:
                "rgba(255, 255, 255, 0.45) 0px 1px 0px inset, rgba(0, 0, 0, 0.04) 0px -1px 0px inset, rgba(0, 0, 0, 0.05) 0px 1px 2px",
            }}
          />
          <button
            type="button"
            data-seg="preview"
            onClick={() => setView("preview")}
            disabled={!selected || selected.type !== "page"}
            className={`relative inline-flex font-medium shrink-0 transition-[color,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl px-3 py-1.5 border flex-col items-center justify-center gap-0.5 text-xs leading-tight min-w-[3.25rem] z-10 bg-transparent ${
              view === "preview"
                ? "text-foreground border-transparent"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent"
            } ${!selected || selected.type !== "page" ? "opacity-40 cursor-not-allowed" : ""}`}
            aria-pressed={view === "preview"}
            title="Live preview of this page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" color="currentColor" className={view === "preview" ? "text-foreground" : ""} strokeWidth="1.5" stroke="currentColor">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <ellipse cx="12" cy="12" rx="4" ry="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 12H22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            <span>Preview</span>
          </button>
          <button
            type="button"
            data-seg="code"
            onClick={() => setView("code")}
            disabled={!selected}
            className={`relative inline-flex font-medium shrink-0 transition-[color,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl px-3 py-1.5 border border-transparent flex-col items-center justify-center gap-0.5 text-xs leading-tight min-w-[3.25rem] z-10 bg-transparent ${
              view === "code"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            } ${!selected ? "opacity-40 cursor-not-allowed" : ""}`}
            aria-pressed={view === "code"}
            title="Edit source code"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" color="currentColor" strokeWidth="1.5" stroke="currentColor">
              <path d="M16 6.99998L19.0664 9.64296C20.3554 10.7541 21 11.3096 21 12C21 12.6903 20.3555 13.2459 19.0664 14.357L16 17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <path d="M8 6.99998L4.93365 9.64296C3.64455 10.7541 3 11.3096 3 12C3 12.6903 3.64455 13.2459 4.93365 14.357L8 17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            <span>Code</span>
          </button>
          <button
            type="button"
            data-seg="meta"
            onClick={() => setView("meta")}
            disabled={!selected}
            className={`relative inline-flex font-medium shrink-0 transition-[color,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl px-3 py-1.5 border border-transparent flex-col items-center justify-center gap-0.5 text-xs leading-tight min-w-[3.25rem] z-10 bg-transparent ${
              view === "meta"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            } ${!selected ? "opacity-40 cursor-not-allowed" : ""}`}
            aria-pressed={view === "meta"}
            title="Route metadata"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" color="currentColor" strokeWidth="1.5" stroke="currentColor">
              <circle cx="1.5" cy="1.5" r="1.5" transform="matrix(1 0 0 -1 16 8.00024)" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <path d="M2.77423 11.1439C1.77108 12.2643 1.7495 13.9546 2.67016 15.1437C4.49711 17.5033 6.49674 19.5029 8.85633 21.3298C10.0454 22.2505 11.7357 22.2289 12.8561 21.2258C15.8979 18.5022 18.6835 15.6559 21.3719 12.5279C21.6377 12.2187 21.8039 11.8397 21.8412 11.4336C22.0062 9.63798 22.3452 4.46467 20.9403 3.05974C19.5353 1.65481 14.362 1.99377 12.5664 2.15876C12.1603 2.19608 11.7813 2.36233 11.472 2.62811C8.34412 5.31646 5.49781 8.10211 2.77423 11.1439Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7.00002 14.0002L10 17.0002" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            <span>Meta</span>
          </button>
        </div>

        <button
          onClick={() => { setShowNew(!showNew); setNewPath("/"); setNewType("page"); }}
          className="btn btn-sm shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Route</span>
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 bg-err/5 border border-err/30 rounded-sm text-xs text-err flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto btn btn-ghost btn-xs">Dismiss</button>
        </div>
      )}

      {showNew && (
        <div className="mx-4 mt-2 p-3 border border-line rounded-sm bg-paper-100 flex items-center gap-3">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "page" | "api")}
            className="input h-7 w-20 text-xs"
          >
            <option value="page">Page</option>
            <option value="api">API</option>
          </select>
          <span className="text-ink-400 text-xs font-mono">/</span>
          <input
            value={newPath === "/" ? "" : newPath.replace(/^\//, "")}
            onChange={(e) => setNewPath("/" + e.target.value.replace(/^\//, ""))}
            placeholder="path-name"
            className="input h-7 flex-1 text-xs font-mono"
          />
          <button onClick={handleCreate} disabled={saving || !newPath} className="btn btn-primary btn-sm">
            {saving ? "Creating..." : "Create"}
          </button>
          <button onClick={() => setShowNew(false)} className="btn btn-ghost btn-sm">Cancel</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Route list */}
        <div className="w-64 border-r border-line overflow-y-auto shrink-0">
          {loading ? (
            <div className="p-4 text-xs text-ink-400">Loading routes...</div>
          ) : routes.length === 0 ? (
            <div className="p-4 text-xs text-ink-400 text-center">
              <Globe className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No routes yet.<br />Click "New Route" to begin.
            </div>
          ) : (
            <div className="p-2 space-y-px">
              {routes.map((route) => (
                <div
                  key={route.id}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-sm cursor-pointer text-sm transition-colors ${
                    selectedId === route.id
                      ? "bg-paper-200 text-ink-900"
                      : "text-ink-500 hover:text-ink-900 hover:bg-paper-200/40"
                  }`}
                  onClick={() => handleSelect(route)}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-mono text-xs">{route.path || "/"}</div>
                    <div className="text-2xs text-ink-400 flex items-center gap-1.5 mt-0.5">
                      <span className={`badge ${route.public ? "badge-ok" : "badge-mute"} text-2xs`}>
                        {route.public ? "public" : "private"}
                      </span>
                      <span className="uppercase tracking-wider">{route.type}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(route.id); }}
                    className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-icon text-err"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main pane — switches based on segmented control */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Sub-header showing selected route + secondary actions */}
            <div className="h-10 border-b border-line flex items-center justify-between px-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono font-medium truncate">{selected.path || "/"}</span>
                <span className={`badge ${selected.public ? "badge-ok" : "badge-mute"} text-2xs`}>
                  {selected.public ? "public" : "private"}
                </span>
                <span className="badge text-2xs uppercase">{selected.type}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleTogglePublic(selected)}
                  className="btn btn-ghost btn-sm text-xs"
                  title={selected.public ? "Make private" : "Make public"}
                >
                  {selected.public ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {selected.public ? "Private" : "Public"}
                </button>
                <button
                  onClick={() => copyToClipboard(routeUrl(selected), selected.id)}
                  className="btn btn-ghost btn-sm text-xs"
                  title="Copy URL"
                >
                  {copiedId === selected.id
                    ? <Check className="w-3 h-3 text-ok" />
                    : <Copy className="w-3 h-3" />}
                </button>
                {selected.type === "page" && (
                  <a
                    href={`/ws/${ownerId}${selected.path.startsWith("/") ? selected.path : "/" + selected.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm text-xs"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <div className="w-px h-4 bg-line mx-1" />
                <button
                  onClick={handleSaveCode}
                  disabled={saving}
                  className="btn btn-primary btn-sm"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Active view */}
            {view === "preview" && selected.type === "page" && (
              <div className={`${previewFullscreen ? "flex-1" : "flex-1"} flex flex-col min-h-0`}>
                <WebSpacePreview
                  ownerId={ownerId}
                  routePath={selected.path}
                  previewKey={previewKey}
                  fullscreen={previewFullscreen}
                  onToggleFullscreen={() => setPreviewFullscreen((f) => !f)}
                  onRefresh={() => setPreviewKey((k) => k + 1)}
                />
              </div>
            )}

            {view === "code" && (
              <div className="flex-1 min-h-0">
                <textarea
                  value={codeEdit}
                  onChange={(e) => setCodeEdit(e.target.value)}
                  className="w-full h-full resize-none border-0 bg-ink-900 text-green-400 font-mono text-xs leading-relaxed p-4 focus:outline-none"
                  spellCheck={false}
                  style={{ tabSize: 2 }}
                />
              </div>
            )}

            {view === "meta" && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <WebSpaceMeta
                  route={selected}
                  ownerId={ownerId}
                  routeUrl={routeUrl(selected)}
                  onCopy={(id) => copyToClipboard(routeUrl(selected), id)}
                  copied={copiedId === selected.id}
                  onTogglePublic={() => handleTogglePublic(selected)}
                />
              </div>
            )}

            {/* Fallback: API route on Preview tab */}
            {view === "preview" && selected.type !== "page" && (
              <div className="flex-1 flex items-center justify-center text-xs text-ink-400">
                <div className="text-center">
                  <Code className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>API routes don't have a preview — switch to <b>Code</b> to edit</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-ink-400">
            <div className="text-center">
              <Code className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Select a route to edit and preview it</p>
              <p className="mt-1 text-2xs">Or create a new route to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
