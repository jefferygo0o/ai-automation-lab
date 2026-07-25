import { useState, useEffect, useCallback } from "react";
import { Workspace, type WorkspaceEntry } from "../api";
import {
  Folder, FolderOpen, File, FileText, Image, FileCode,
  ChevronRight, Search, ArrowUp, FolderTree,
  Trash2, AlertCircle, RefreshCw, Home, FilePlus2,
} from "lucide-react";

function fileIcon(name: string, type: string) {
  if (type === "dir") return null;
  const ext = name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "json", "css", "html", "md", "py", "rb", "go", "rs"].includes(ext || ""))
    return <FileCode className="w-3.5 h-3.5 text-blue-500" />;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext || ""))
    return <Image className="w-3.5 h-3.5 text-purple-500" />;
  if (["txt", "md", "log"].includes(ext || ""))
    return <FileText className="w-3.5 h-3.5 text-ink-400" />;
  return <File className="w-3.5 h-3.5 text-ink-400" />;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface PreviewState {
  path: string;
  content: string;
  encoding: string;
}

export default function FilesPage() {
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const fetchEntries = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await Workspace.tree(path);
      setEntries(res.entries);
    } catch (e: any) {
      setError(e.message || "Failed to load files");
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  function navigateToDir(dirName: string) {
    const next = currentPath === "." ? dirName : `${currentPath}/${dirName}`;
    setCurrentPath(next);
    setPreview(null);
    setSelectedEntry(null);
  }

  function navigateBreadcrumb(index: number) {
    if (currentPath === ".") return;
    const parts = currentPath.split("/");
    const next = parts.slice(0, index + 1).join("/");
    setCurrentPath(next);
    setPreview(null);
    setSelectedEntry(null);
  }

  function navigateUp() {
    if (currentPath === ".") return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.length === 0 ? "." : parts.join("/"));
    setPreview(null);
    setSelectedEntry(null);
  }

  function goToRoot() {
    setCurrentPath(".");
    setPreview(null);
    setSelectedEntry(null);
  }

  const handleEntryClick = async (entry: WorkspaceEntry) => {
    setSelectedEntry(entry.path);
    if (entry.type === "dir") {
      navigateToDir(entry.name);
    } else {
      try {
        const res = await Workspace.read(entry.path);
        setPreview({ path: entry.path, content: res.content, encoding: res.encoding });
      } catch (e: any) {
        setError(e.message || "Failed to read file");
      }
    }
  };

  const handleDelete = async (entry: WorkspaceEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      await Workspace.delete(entry.path);
      await fetchEntries(currentPath);
      if (preview?.path === entry.path) setPreview(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const path = currentPath === "." ? name : `${currentPath}/${name}`;
    try {
      await Workspace.mkdir(path);
      setNewFolderName("");
      setShowNewFolder(false);
      await fetchEntries(currentPath);
    } catch (e: any) {
      setError(e.message || "Failed to create folder");
    }
  };

  const handleCreateFile = async () => {
    const name = prompt("File name:");
    if (!name?.trim()) return;
    const path = currentPath === "." ? name.trim() : `${currentPath}/${name.trim()}`;
    try {
      await Workspace.write(path, "");
      await fetchEntries(currentPath);
    } catch (e: any) {
      setError(e.message || "Failed to create file");
    }
  };

  const pathParts = currentPath === "." ? [] : currentPath.split("/");

  const filteredEntries = searchQuery
    ? entries.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  return (
    <div className="h-full flex flex-col p-3 sm:p-6">
      {/* Header */}
      <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0 gap-2">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <FolderTree className="w-3.5 h-3.5 text-ink-400 shrink-0" />
          <span className="text-xs font-medium text-ink-400">Files</span>

          <div className="ml-2 flex items-center gap-1 text-ink-400">
            <button
              onClick={goToRoot}
              className={`btn btn-ghost btn-icon shrink-0 ${currentPath === "." ? "text-ink-900" : "text-ink-400"}`}
              title="Root"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            {currentPath !== "." && (
              <button onClick={navigateUp} className="btn btn-ghost btn-icon shrink-0" title="Parent directory">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            )}

            {pathParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3 h-3 text-ink-300 shrink-0" />
                <button
                  onClick={() => navigateBreadcrumb(i)}
                  className={`truncate hover:text-ink-900 ${
                    i === pathParts.length - 1 ? "text-ink-900 font-medium" : "text-ink-400"
                  }`}
                >
                  {part}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter..."
              className="input h-7 w-36 pl-7 text-xs"
            />
          </div>
          <button onClick={() => setShowNewFolder(!showNewFolder)} className="btn btn-ghost btn-icon" title="New folder">
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleCreateFile} className="btn btn-ghost btn-icon" title="New file">
            <FilePlus2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => fetchEntries(currentPath)} className="btn btn-ghost btn-icon" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-line">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
            }}
            placeholder="Folder name..."
            className="input h-7 text-xs flex-1"
          />
          <button onClick={handleCreateFolder} className="btn btn-sm">Create</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="btn btn-ghost btn-sm">Cancel</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-2 bg-err/5 border border-err/30 rounded-sm text-xs text-err flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto btn btn-ghost btn-xs">Dismiss</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* File list */}
        <div className={`${preview ? "w-80" : "flex-1"} border-r border-line overflow-y-auto`}>
          {loading ? (
            <div className="p-4 text-xs text-ink-400">Loading files...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-4 text-xs text-ink-400 text-center">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {searchQuery ? "No files matching filter." : "This directory is empty."}
            </div>
          ) : (
            <div className="p-2 space-y-px">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.path}
                  className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-sm cursor-pointer text-xs transition-colors ${
                    selectedEntry === entry.path
                      ? "bg-paper-200 text-ink-900"
                      : "text-ink-500 hover:text-ink-900 hover:bg-paper-200/40"
                  }`}
                  onClick={() => handleEntryClick(entry)}
                >
                  {entry.type === "dir" ? (
                    selectedEntry === entry.path
                      ? <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                      : <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    fileIcon(entry.name, entry.type)
                  )}
                  <span className="flex-1 truncate">{entry.name}</span>
                  <span className="text-2xs text-ink-400 hidden group-hover:block">
                    {entry.type === "file" && formatSize(entry.size)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                    className="opacity-0 group-hover:opacity-100 text-err hover:text-err"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview pane */}
        {preview ? (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="h-9 border-b border-line flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono font-medium truncate">{preview.path}</span>
              </div>
              <button onClick={() => setPreview(null)} className="btn btn-ghost btn-icon shrink-0">
                <span className="text-ink-400 text-xs">✕</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 min-h-0">
              {preview.encoding === "base64" ? (
                <div className="text-xs text-ink-400 italic">Binary file — cannot preview text.</div>
              ) : (
                <pre className="text-xs leading-relaxed text-ink-800 whitespace-pre-wrap font-mono">
                  {preview.content || <span className="text-ink-400 italic">(empty file)</span>}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-ink-400">
            <div className="text-center">
              <File className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Select a file to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10v6" />
      <path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
