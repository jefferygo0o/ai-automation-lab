import { useState, useEffect, useCallback } from "react";
import { Space, type SpaceRoute } from "../api";
import {
  Globe, Plus, Trash2, Eye, EyeOff, FileCode, Code,
  ExternalLink, Copy, Check, AlertCircle,
} from "lucide-react";

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

  const selected = routes.find((r) => r.id === selectedId);

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
      if (selectedId === id) { setSelectedId(null); setCodeEdit(""); }
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const handleSaveCode = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await Space.update(selected.id, { code: codeEdit });
      setRoutes((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setSelectedId(updated.id);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    }
    setSaving(false);
  };

  const handleTogglePublic = async (route: SpaceRoute) => {
    try {
      const updated = await Space.publish(route.id, !route.public);
      setRoutes((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    } catch (e: any) {
      setError(e.message || "Failed to update visibility");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const routeUrl = (route: SpaceRoute) => {
    const base = window.location.origin;
    return `${base}/ws${route.path === "/" ? "" : route.path}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-ink-400" />
          <span className="text-sm font-medium text-ink-900">
            Routes {routes.length > 0 && <span className="text-ink-400 font-normal">({routes.length})</span>}
          </span>
        </div>
        <button
          onClick={() => { setShowNew(!showNew); setNewPath("/"); setNewType("page"); }}
          className="btn btn-sm"
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

      {/* New route form */}
      {showNew && (
        <div className="mx-4 mt-2 p-3 border border-line rounded-sm bg-paper-100 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "page" | "api")}
              className="input h-7 w-20 text-xs"
            >
              <option value="page">Page</option>
              <option value="api">API</option>
            </select>
          </div>
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
                  onClick={() => { setSelectedId(route.id); setCodeEdit(route.code); }}
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

        {/* Code editor */}
        <div className="flex-1 flex flex-col">
          {selected ? (
            <>
              {/* Route header */}
              <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium">{selected.path || "/"}</span>
                  <span className="text-2xs text-ink-400">·</span>
                  <span className={`badge ${selected.public ? "badge-ok" : "badge-mute"} text-2xs`}>
                    {selected.public ? "public" : "private"}
                  </span>
                  <span className="badge text-2xs uppercase">{selected.type}</span>
                </div>
                <div className="flex items-center gap-2">
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
                      : <Copy className="w-3 h-3" />
                    }
                    URL
                  </button>
                  <a
                    href={routeUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm text-xs"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </a>
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
              {/* Code textarea */}
              <div className="flex-1 p-0">
                <textarea
                  value={codeEdit}
                  onChange={(e) => setCodeEdit(e.target.value)}
                  className="w-full h-full resize-none border-0 bg-ink-900 text-green-400 font-mono text-xs leading-relaxed p-4 focus:outline-none"
                  spellCheck={false}
                  style={{ tabSize: 2 }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-ink-400">
              <div className="text-center">
                <Code className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Select a route to edit its code</p>
                <p className="mt-1 text-2xs">Or create a new route to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
