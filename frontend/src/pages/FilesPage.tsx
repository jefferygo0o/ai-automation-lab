import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Workspace, type WorkspaceEntry } from "../api";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import ruby from "highlight.js/lib/languages/ruby";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import shell from "highlight.js/lib/languages/shell";
import {
  Folder, FolderOpen, File, FileText, Image, FileCode,
  ChevronRight, Search, ArrowUp, FolderTree,
  Trash2, AlertCircle, RefreshCw, Home, FilePlus2,
  Copy, Check, WrapText, X, Terminal,
} from "lucide-react";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("php", php);
hljs.registerLanguage("shell", shell);

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript",
  html: "html", htm: "html", xml: "xml", svg: "xml",
  css: "css", scss: "css", less: "css",
  json: "json", jsonc: "json", jsonl: "json",
  py: "python", pyw: "python",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  sql: "sql", sqlite: "sql",
  md: "markdown", mdx: "markdown",
  yaml: "yaml", yml: "yaml",
  dockerfile: "dockerfile", "docker-compose.yaml": "yaml",
  go: "go", rs: "rust", rb: "ruby", java: "java",
  cpp: "cpp", cc: "cpp", cxx: "cpp", h: "cpp",
  cs: "csharp", php: "php",
  txt: "", log: "", csv: "", tsv: "",
  png: "", jpg: "", jpeg: "", gif: "", webp: "", ico: "", bmp: "",
  mp3: "", wav: "", ogg: "", mp4: "", webm: "", avi: "",
  zip: "", tar: "", gz: "", bz2: "", "7z": "",
  pdf: "", doc: "", docx: "", xls: "", xlsx: "",
  lock: "", env: "", gitignore: "", editorconfig: "",
};

function detectLanguage(filename: string): string {
  const name = filename.toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  if (name === "cmakelists.txt") return "cmake";
  const ext = name.split(".").pop() || "";
  if (name.endsWith(".tsx")) return "typescript";
  if (name.endsWith(".jsx")) return "javascript";
  if (name.endsWith(".mdx")) return "markdown";
  return LANG_MAP[ext] ?? "";
}

function langDisplayName(lang: string): string {
  const names: Record<string, string> = {
    javascript: "JavaScript", typescript: "TypeScript", html: "HTML",
    xml: "XML", css: "CSS", json: "JSON", python: "Python",
    bash: "Bash", sh: "Shell", sql: "SQL", markdown: "Markdown",
    yaml: "YAML", dockerfile: "Dockerfile", go: "Go", rust: "Rust",
    ruby: "Ruby", java: "Java", cpp: "C++", csharp: "C#", php: "PHP",
  };
  return names[lang] || lang.toUpperCase();
}

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

/* ---------- open tab ---------- */
interface OpenTab {
  id: string;
  path: string;
  name: string;
  content: string;
  encoding: string;
  dirty: boolean;
}

function makeTabId(p: string) { return p; }

/* ---------- highlighted code renderer ---------- */
function HighlightedCode({ content, language, fontSize, wordWrap }: { content: string; language: string; fontSize: number; wordWrap: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  const lines = content.split("\n");
  const lineCount = lines.length;

  const highlighted = useMemo(() => {
    if (!content) return "";
    if (language) {
      try {
        return hljs.highlight(content, { language }).value;
      } catch { /* fall through */ }
    }
    try {
      return hljs.highlightAuto(content).value;
    } catch {
      return content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [content, language]);

  const lineDigits = String(lineCount).length;
  const codeRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (gutterRef.current && codeRef.current) {
      gutterRef.current.scrollTop = codeRef.current.scrollTop;
    }
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" style={{ fontSize }}>
      {/* Line numbers */}
      <div
        ref={gutterRef}
        className="shrink-0 select-none text-right pr-4 pt-3 pb-3 border-r overflow-hidden"
        style={{
          width: `${lineDigits * 0.6 + 2.5}rem`,
          color: "hsl(40 10% 45%)",
          borderColor: "hsl(40 10% 88%)",
          fontFamily: "var(--font-mono)",
          lineHeight: "1.6",
        }}
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {/* Code */}
      <div ref={codeRef} className="flex-1 overflow-auto min-w-0" onScroll={handleScroll}>
        <pre
          ref={ref}
          className="p-3 m-0"
          style={{
            fontFamily: "var(--font-mono)",
            lineHeight: "1.6",
            background: "transparent",
            whiteSpace: wordWrap ? "pre-wrap" : "pre",
            margin: 0,
          }}
        >
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  );
}

/* ---------- main component ---------- */
export default function FilesPage() {
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(13);

  const activeTab = openTabs.find((t) => t.id === activeTabId) || null;

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
    setSelectedEntry(null);
  }

  function navigateBreadcrumb(index: number) {
    if (currentPath === ".") return;
    const parts = currentPath.split("/");
    const next = parts.slice(0, index + 1).join("/");
    setCurrentPath(next);
    setSelectedEntry(null);
  }

  function navigateUp() {
    if (currentPath === ".") return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.length === 0 ? "." : parts.join("/"));
    setSelectedEntry(null);
  }

  function goToRoot() {
    setCurrentPath(".");
    setSelectedEntry(null);
  }

  const handleEntryClick = async (entry: WorkspaceEntry) => {
    setSelectedEntry(entry.path);
    if (entry.type === "dir") {
      navigateToDir(entry.name);
      return;
    }
    // Open as tab
    const tid = makeTabId(entry.path);
    const existing = openTabs.find((t) => t.id === tid);
    if (existing) {
      setActiveTabId(tid);
      return;
    }
    try {
      const res = await Workspace.read(entry.path);
      const tab: OpenTab = {
        id: tid,
        path: entry.path,
        name: entry.name,
        content: res.content || "",
        encoding: res.encoding,
        dirty: false,
      };
      setOpenTabs((prev) => [...prev, tab]);
      setActiveTabId(tid);
    } catch (e: any) {
      setError(e.message || "Failed to read file");
    }
  };

  const closeTab = (tid: string) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== tid));
    if (activeTabId === tid) {
      setActiveTabId((prev) => {
        const remaining = openTabs.filter((t) => t.id !== tid);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      });
    }
  };

  const handleDelete = async (entry: WorkspaceEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      await Workspace.delete(entry.path);
      await fetchEntries(currentPath);
      closeTab(makeTabId(entry.path));
      if (selectedEntry === entry.path) setSelectedEntry(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const path = currentPath === "." ? name : `${currentPath}/${name}`;
    try {
      await Workspace.newFolder(path);
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

  const handleCopy = async () => {
    if (!activeTab) return;
    await navigator.clipboard.writeText(activeTab.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (!activeTab) return;
    try {
      await Workspace.write(activeTab.path, activeTab.content);
      setOpenTabs((prev) => prev.map((t) => t.id === activeTab.id ? { ...t, dirty: false } : t));
    } catch (e: any) {
      setError(e.message || "Failed to save");
    }
  };

  const pathParts = currentPath === "." ? [] : currentPath.split("/");

  const filteredEntries = searchQuery
    ? entries.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  return (
    <div className="h-full flex flex-col">
      {/* ─── Toolbar ─── */}
      <div className="h-10 shrink-0 border-b border-line flex items-center justify-between px-4 gap-2">
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
            <FolderPlusIcon className="w-3.5 h-3.5" />
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

      {/* ─── Main: sidebar + editor ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ─── Explorer sidebar ─── */}
        <div className="w-64 shrink-0 border-r border-line flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-400 border-b border-line shrink-0">
            Explorer
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-4 text-xs text-ink-400">Loading files...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-4 text-xs text-ink-400 text-center">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                {searchQuery ? "No files matching filter." : "This directory is empty."}
              </div>
            ) : (
              <div className="py-1">
                {filteredEntries.map((entry) => {
                  const tid = makeTabId(entry.path);
                  const isActive = activeTabId === tid;
                  return (
                    <div
                      key={entry.path}
                      className={`group flex items-center gap-2 px-3 py-[5px] cursor-pointer text-xs transition-colors ${
                        isActive
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
                      <span className="text-2xs text-ink-400 hidden group-hover:inline">
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Editor area ─── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {openTabs.length > 0 ? (
            <>
              {/* Tab bar */}
              <div className="h-9 shrink-0 flex items-center border-b border-line bg-background overflow-x-auto scrollbar-hide">
                {openTabs.map((tab) => {
                  const lang = detectLanguage(tab.name);
                  return (
                    <div
                      key={tab.id}
                      className={`group h-full flex items-center gap-1.5 px-3 text-xs cursor-pointer border-r border-line shrink-0 transition-colors ${
                        activeTabId === tab.id
                          ? "bg-white text-ink-900"
                          : "text-ink-400 hover:text-ink-700 hover:bg-paper-200/50"
                      }`}
                      onClick={() => setActiveTabId(tab.id)}
                    >
                      {fileIcon(tab.name, "file")}
                      <span className="truncate max-w-[120px]">{tab.name}</span>
                      {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                        className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-ink-900 shrink-0"
                        title="Close"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Editor toolbar */}
              {activeTab && (
                <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-line bg-background">
                  <div className="flex items-center gap-1.5 text-2xs text-ink-400 min-w-0">
                    <span className="truncate max-w-md">{activeTab.path}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setFontSize((s) => Math.max(10, s - 1))}
                      className="btn btn-ghost btn-icon !w-6 !h-6"
                      title="Decrease font size"
                    >
                      <span className="text-2xs font-mono">A-</span>
                    </button>
                    <span className="text-2xs text-ink-400 font-mono w-6 text-center">{fontSize}</span>
                    <button
                      onClick={() => setFontSize((s) => Math.min(24, s + 1))}
                      className="btn btn-ghost btn-icon !w-6 !h-6"
                      title="Increase font size"
                    >
                      <span className="text-2xs font-mono">A+</span>
                    </button>
                    <div className="w-px h-4 bg-line mx-1" />
                    <button
                      onClick={handleCopy}
                      className="btn btn-ghost btn-icon !w-6 !h-6"
                      title="Copy content"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => setWordWrap((w) => !w)}
                      className={`btn btn-ghost btn-icon !w-6 !h-6 ${wordWrap ? "text-ink-900" : ""}`}
                      title="Toggle word wrap"
                    >
                      <WrapText className="w-3 h-3" />
                    </button>
                    {activeTab.dirty && (
                      <button
                        onClick={handleSave}
                        className="btn btn-ghost btn-xs text-blue-600"
                        title="Save"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Code area */}
              {activeTab && (
                <div className="flex-1 overflow-hidden min-h-0 flex flex-col" style={{ background: "hsl(40 15% 97%)" }}>
                  {activeTab.encoding === "base64" ? (
                    <div className="flex items-center justify-center h-full text-xs text-ink-400">
                      <div className="text-center">
                        <Image className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>Binary file — cannot preview text.</p>
                      </div>
                    </div>
                  ) : activeTab.content === "" ? (
                    <div className="flex items-center justify-center h-full text-xs text-ink-400">
                      <p className="italic">Empty file</p>
                    </div>
                  ) : (
                    <div style={{ overflow: wordWrap ? "auto" : "hidden" }}>
                      <HighlightedCode
                        content={activeTab.content}
                        language={detectLanguage(activeTab.name)}
                        fontSize={fontSize}
                        wordWrap={wordWrap}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* No tabs open — empty state */
            <div className="flex-1 flex items-center justify-center text-xs text-ink-400 min-h-0">
              <div className="text-center">
                <FileCode className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-ink-500 mb-1">No file open</p>
                <p className="text-2xs text-ink-400">Select a file from the explorer to view it</p>
              </div>
            </div>
          )}

          {/* ─── Status bar ─── */}
          {activeTab && (
            <div
              className="h-6 shrink-0 flex items-center justify-between px-3 border-t border-line text-2xs text-ink-400 select-none"
              style={{ background: "hsl(40 10% 93%)" }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Terminal className="w-2.5 h-2.5" />
                  {langDisplayName(detectLanguage(activeTab.name)) || "Plain Text"}
                </span>
                <span>{activeTab.content.split("\n").length} lines</span>
                <span>{activeTab.encoding === "base64" ? "Binary" : "UTF-8"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>Spaces: 2</span>
                <span>LF</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10v6" />
      <path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
