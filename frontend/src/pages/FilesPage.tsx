import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Agents, type Agent, type FileEntry, type SandboxEntry } from "../api";
import {
  Folder, FolderOpen, File, FileText, Image, FileCode,
  ChevronRight, Search, ArrowUp, FolderTree,
  Trash2, AlertCircle, RefreshCw, Bot, Home, FilePlus2,
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

function agentFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "md") return <FileText className="w-3.5 h-3.5 text-ink-600" />;
  if (ext === "json") return <FileCode className="w-3.5 h-3.5 text-blue-500" />;
  return <File className="w-3.5 h-3.5 text-ink-400" />;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface PreviewState {
  source: "agent" | "sandbox";
  path: string;
  content: string;
}

export default function FilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const agentIdParam = searchParams.get("agent") || "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState(agentIdParam);
  const [activeTab, setActiveTab] = useState<"agent" | "sandbox">(() => {
    const t = searchParams.get("tab");
    return t === "agent" || t === "sandbox" ? t : "sandbox";
  });
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<SandboxEntry[]>([]);
  const [agentFiles, setAgentFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<SandboxEntry | null>(null);
  const [selectedAgentFile, setSelectedAgentFile] = useState<string | null>(null);

  useEffect(() => {
    Agents.list().then((res) => setAgents(res.agents)).catch(() => {});
  }, []);

  useEffect(() => {
    if (agentIdParam && agentIdParam !== selectedAgentId) {
      setSelectedAgentId(agentIdParam);
      setCurrentPath(".");
      setPreview(null);
      setSelectedEntry(null);
      setSelectedAgentFile(null);
    }
  }, [agentIdParam]);

  const fetchSandboxEntries = useCallback(async (agentId: string, path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await Agents.sandboxBrowse(agentId, path);
      setEntries(res.entries);
    } catch (e: any) {
      setError(e.message || "Failed to load sandbox files");
      setEntries([]);
    }
    setLoading(false);
  }, []);

  const fetchAgentFiles = useCallback(async (agentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await Agents.files(agentId);
      setAgentFiles(res.files);
    } catch (e: any) {
      setError(e.message || "Failed to load agent files");
      setAgentFiles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    if (activeTab === "sandbox") {
      fetchSandboxEntries(selectedAgentId, currentPath);
    } else {
      fetchAgentFiles(selectedAgentId);
    }
  }, [selectedAgentId, activeTab, currentPath, fetchSandboxEntries, fetchAgentFiles]);

  function handleAgentChange(agentId: string) {
    setSelectedAgentId(agentId);
    setCurrentPath(".");
    setPreview(null);
    setSelectedEntry(null);
    setSelectedAgentFile(null);
    setSearchParams(agentId ? { agent: agentId } : {}, { replace: true });
  }

  function handleTabChange(tab: "agent" | "sandbox") {
    setActiveTab(tab);
    setCurrentPath(".");
    setPreview(null);
    setSelectedEntry(null);
    setSelectedAgentFile(null);
    setSearchQuery("");
    const next = new URLSearchParams(searchParams);
    if (selectedAgentId) next.set("agent", selectedAgentId);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

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

  const handleSandboxClick = async (entry: SandboxEntry) => {
    setSelectedEntry(entry);
    setSelectedAgentFile(null);
    if (entry.type === "dir") {
      navigateToDir(entry.name);
    } else {
      try {
        const relPath = currentPath === "." ? entry.name : `${currentPath}/${entry.name}`;
        const res = await Agents.sandboxRead(selectedAgentId, relPath);
        setPreview({ source: "sandbox", path: relPath, content: res.content });
      } catch (e: any) {
        setError(e.message || "Failed to read file");
      }
    }
  };

  const handleAgentFileClick = async (name: string) => {
    setSelectedAgentFile(name);
    setSelectedEntry(null);
    try {
      const res = await Agents.readFile(selectedAgentId, name);
      setPreview({ source: "agent", path: name, content: res.content });
    } catch (e: any) {
      setError(e.message || "Failed to read file");
    }
  };

  const handleDelete = async (entry: SandboxEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      const relPath = currentPath === "." ? entry.name : `${currentPath}/${entry.name}`;
      await Agents.sandboxDelete(selectedAgentId, relPath);
      await fetchSandboxEntries(selectedAgentId, currentPath);
      if (preview?.source === "sandbox" && preview.path === relPath) setPreview(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const pathParts = currentPath === "." ? [] : currentPath.split("/");
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const filteredEntries = searchQuery
    ? entries.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const filteredAgentFiles = searchQuery
    ? agentFiles.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : agentFiles;

  if (!selectedAgentId) {
    return (
      <div className="h-full flex flex-col p-3 sm:p-6">
        <div className="h-10 border-b border-line flex items-center px-4 shrink-0">
          <span className="text-xs font-medium text-ink-400">Files</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <FolderTree className="w-12 h-12 mx-auto mb-4 text-ink-300" />
            <h2 className="text-sm font-semibold text-ink-900 mb-2">Select an Agent</h2>
            <p className="text-xs text-ink-400 mb-4">
              Choose an agent below to browse its files. You'll see the agent's
              config files (system, persona, skills, tools, memory) and its
              sandbox workdir where generated media and tool outputs land.
            </p>
            {agents.length === 0 ? (
              <p className="text-xs text-ink-400 italic">No agents found. Create one first.</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleAgentChange(a.id)}
                    className="btn btn-sm flex items-center gap-2"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 sm:p-6">
      <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0 gap-2">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <select
            value={selectedAgentId}
            onChange={(e) => handleAgentChange(e.target.value)}
            className="input h-7 text-xs w-auto max-w-[160px]"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="ml-2 flex items-center border border-line rounded-sm overflow-hidden">
            <button
              onClick={() => handleTabChange("agent")}
              className={`px-2.5 h-7 text-xs ${activeTab === "agent" ? "bg-paper-200 text-ink-900" : "text-ink-500 hover:bg-paper-100"}`}
            >
              Agent files
            </button>
            <button
              onClick={() => handleTabChange("sandbox")}
              className={`px-2.5 h-7 text-xs border-l border-line ${activeTab === "sandbox" ? "bg-paper-200 text-ink-900" : "text-ink-500 hover:bg-paper-100"}`}
            >
              Sandbox
            </button>
          </div>

          {activeTab === "sandbox" && (
            <>
              <button
                onClick={goToRoot}
                className={`btn btn-ghost btn-icon shrink-0 ${currentPath === "." ? "text-ink-900" : "text-ink-400"}`}
                title="Sandbox root"
              >
                <Home className="w-3.5 h-3.5" />
              </button>
              {currentPath !== "." && (
                <button onClick={navigateUp} className="btn btn-ghost btn-icon shrink-0" title="Parent directory">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-ink-400 font-medium shrink-0">
                {selectedAgent?.name ?? selectedAgentId}
              </span>
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
            </>
          )}

          {activeTab === "agent" && (
            <span className="text-ink-400 font-medium shrink-0 ml-2">
              {selectedAgent?.name ?? selectedAgentId} / config
            </span>
          )}
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
          <button
            onClick={() => {
              if (activeTab === "sandbox") fetchSandboxEntries(selectedAgentId, currentPath);
              else fetchAgentFiles(selectedAgentId);
            }}
            className="btn btn-ghost btn-icon"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 bg-err/5 border border-err/30 rounded-sm text-xs text-err flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto btn btn-ghost btn-xs">Dismiss</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className={`${preview ? "w-80" : "flex-1"} border-r border-line overflow-y-auto`}>
          {activeTab === "agent" ? (
            <AgentFileList
              files={filteredAgentFiles}
              selected={selectedAgentFile}
              onSelect={handleAgentFileClick}
              loading={loading}
              searchQuery={searchQuery}
            />
          ) : loading ? (
            <div className="p-4 text-xs text-ink-400">Loading files...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-4 text-xs text-ink-400 text-center">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {searchQuery ? "No files matching filter." : "This sandbox directory is empty."}
            </div>
          ) : (
            <div className="p-2 space-y-px">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.path}
                  className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-sm cursor-pointer text-xs transition-colors ${
                    selectedEntry?.path === entry.path
                      ? "bg-paper-200 text-ink-900"
                      : "text-ink-500 hover:text-ink-900 hover:bg-paper-200/40"
                  }`}
                  onClick={() => handleSandboxClick(entry)}
                >
                  {entry.type === "dir" ? (
                    selectedEntry?.path === entry.path
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

        {preview ? (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="h-9 border-b border-line flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xs font-mono text-ink-400 shrink-0">
                  {preview.source === "agent" ? "agent/" : "sandbox/"}
                </span>
                <span className="text-xs font-mono font-medium truncate">{preview.path}</span>
              </div>
              <button onClick={() => setPreview(null)} className="btn btn-ghost btn-icon shrink-0">
                <ArrowUp className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 min-h-0">
              <pre className="text-xs leading-relaxed text-ink-800 whitespace-pre-wrap font-mono">
                {preview.content || <span className="text-ink-400 italic">(empty file)</span>}
              </pre>
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

function AgentFileList({
  files,
  selected,
  onSelect,
  loading,
  searchQuery,
}: {
  files: FileEntry[];
  selected: string | null;
  onSelect: (name: string) => void;
  loading: boolean;
  searchQuery: string;
}) {
  if (loading) {
    return <div className="p-4 text-xs text-ink-400">Loading files...</div>;
  }
  if (files.length === 0) {
    return (
      <div className="p-4 text-xs text-ink-400 text-center">
        <File className="w-8 h-8 mx-auto mb-2 opacity-30" />
        {searchQuery ? "No files matching filter." : "No agent files yet."}
      </div>
    );
  }
  return (
    <div className="p-2 space-y-px">
      {files.map((f) => (
        <div
          key={f.name}
          className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-sm cursor-pointer text-xs transition-colors ${
            selected === f.name
              ? "bg-paper-200 text-ink-900"
              : "text-ink-500 hover:text-ink-900 hover:bg-paper-200/40"
          }`}
          onClick={() => onSelect(f.name)}
        >
          {agentFileIcon(f.name)}
          <span className="flex-1 truncate font-mono">{f.name}</span>
          <span className="text-2xs text-ink-400 hidden group-hover:block tabular-nums shrink-0">
            {formatSize(f.size)}
          </span>
        </div>
      ))}
    </div>
  );
}
