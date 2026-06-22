import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Agent, Agents, FileEntry, Memory, MemoryItem, SandboxEntry } from "../api";
import {
  ArrowLeft, Save, History, Trash2, Plus, Folder, File, Terminal,
  Database, RotateCcw, MessageSquare, Play,
} from "lucide-react";
import { Link } from "react-router-dom";

const FILE_TABS: Array<{ key: string; label: string; description: string; sub?: string }> = [
  { key: "system.md",   label: "System",       description: "Core system prompt and operating instructions", sub: "system.md" },
  { key: "persona.md",  label: "Persona",      description: "Voice, tone, and personality",                sub: "persona.md" },
  { key: "skills.md",   label: "Skills Index", description: "How the agent discovers and chooses skills",  sub: "skills.md" },
  { key: "tools.md",    label: "Tools Notes",  description: "Tool usage guidance and gotchas",             sub: "tools.md" },
  { key: "memory.md",   label: "Memory Notes", description: "Long-term narrative memory",                  sub: "memory.md" },
  { key: "config.json", label: "Config",       description: "Provider, model, sandbox, permissions",       sub: "config.json" },
];

type Tab = string | "__sandbox__" | "__memory__" | "__history__";

export default function AgentEditPage() {
  const { id = "" } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<Tab>("system.md");
  const [history, setHistory] = useState<any[]>([]);
  const [sandboxPath, setSandboxPath] = useState(".");
  const [sandboxEntries, setSandboxEntries] = useState<SandboxEntry[]>([]);
  const [sandboxContent, setSandboxContent] = useState<string>("");
  const [openFilePath, setOpenFilePath] = useState<string>("");
  const [memItems, setMemItems] = useState<MemoryItem[]>([]);
  const [memKind, setMemKind] = useState("fact");
  const [memKey, setMemKey] = useState("");
  const [memVal, setMemVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    const { agent } = await Agents.get(id);
    setAgent(agent);
    const out: Record<string, string> = {};
    for (const t of FILE_TABS) {
      try {
        const { content } = await Agents.readFile(id, t.key);
        out[t.key] = content;
      } catch { out[t.key] = ""; }
    }
    setFileContents(out);
    setDirty({});
    const { history } = await Agents.history(id);
    setHistory(history);
    const { entries } = await Agents.sandboxBrowse(id, ".");
    setSandboxEntries(entries);
    const { items } = await Memory.list(id);
    setMemItems(items);
  }
  useEffect(() => { loadAll(); }, [id]);

  function markDirty(name: string, content: string) {
    setFileContents((p) => ({ ...p, [name]: content }));
    setDirty((p) => ({ ...p, [name]: true }));
  }
  async function save(name: string) {
    setSaving(true);
    try {
      await Agents.writeFile(id, name, fileContents[name] ?? "");
      setDirty((p) => ({ ...p, [name]: false }));
      flash(`Saved ${name}`);
      const { history } = await Agents.history(id, name);
      setHistory(history);
    } finally { setSaving(false); }
  }
  function flash(m: string) { setMessage(m); setTimeout(() => setMessage(null), 1800); }

  async function loadSandbox(path: string) {
    setSandboxPath(path);
    const { entries } = await Agents.sandboxBrowse(id, path);
    setSandboxEntries(entries);
  }
  async function openFile(path: string) {
    try {
      const { content } = await Agents.sandboxRead(id, path);
      setSandboxContent(content);
      setOpenFilePath(path);
    } catch (e: any) { flash(`Read failed: ${e.message}`); }
  }
  async function saveSandbox() {
    if (!openFilePath) return;
    await Agents.sandboxWrite(id, openFilePath, sandboxContent);
    flash(`Wrote ${openFilePath}`);
  }
  async function exec() {
    const cmd = prompt("Command (e.g. ls -la):");
    if (!cmd) return;
    const [command, ...args] = cmd.split(/\s+/);
    const r = await Agents.sandboxExec(id, command, args);
    setSandboxContent(
      `exit=${r.exitCode} duration=${r.durationMs}ms\n\n--- stdout ---\n${r.stdout}\n\n--- stderr ---\n${r.stderr}`
    );
  }

  async function addMemory() {
    if (!memKey.trim()) return;
    await Memory.upsert(id, memKind, memKey, memVal);
    setMemKey(""); setMemVal("");
    const { items } = await Memory.list(id);
    setMemItems(items);
  }
  async function deleteMem(memId: string) {
    await Memory.remove(id, memId);
    const { items } = await Memory.list(id);
    setMemItems(items);
  }
  async function revert(versionId: string) {
    if (!confirm("Revert this file to the selected version?")) return;
    await Agents.revertHistory(id, versionId);
    await loadAll();
    flash("Reverted.");
  }

  async function startChat() {
    const { Chats } = await import("../api");
    const { chat } = await Chats.create(id);
    window.location.href = `/chats/${chat.id}`;
  }

  if (!agent) return <div className="text-sm text-ink-400">Loading…</div>;

  const activeFile = FILE_TABS.find((t) => t.key === active);
  const fileTab = !!activeFile;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 h-full">
      {/* ─── Left rail ─── */}
      <aside className="flex flex-col min-h-0">
        <div className="mb-4">
          <Link
            to="/agents"
            className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-900"
          >
            <ArrowLeft className="w-3 h-3 stroke-[1.75]" />
            <span>All agents</span>
          </Link>
        </div>

        <div className="mb-5">
          <div className="text-base font-semibold text-ink-900">{agent.name}</div>
          {agent.description && (
            <div className="text-xs text-ink-400 mt-0.5 line-clamp-2">{agent.description}</div>
          )}
          <div className="mt-2 text-2xs font-mono text-ink-300">{agent.id}</div>
        </div>

        <div className="eyebrow mb-2">Filesystem</div>
        <nav className="flex flex-col mb-5">
          {FILE_TABS.map((t) => {
            const isActive = active === t.key;
            const isDirty = dirty[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`group text-left px-2.5 py-1.5 text-xs flex items-center gap-2 border-l-2 transition-colors ${
                  isActive
                    ? "border-ink-900 bg-paper-200 text-ink-900"
                    : "border-transparent text-ink-600 hover:text-ink-900 hover:bg-paper-100"
                }`}
              >
                <File className="w-3 h-3 stroke-[1.75] shrink-0" />
                <span className="flex-1 truncate">{t.label}</span>
                {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-clay-500" />}
              </button>
            );
          })}
        </nav>

        <div className="eyebrow mb-2">Workspace</div>
        <nav className="flex flex-col mb-5">
          <RailButton
            active={active === "__sandbox__"}
            onClick={() => setActive("__sandbox__")}
            icon={<Folder className="w-3 h-3 stroke-[1.75]" />}
            label="Sandbox"
            sub="filesystem"
          />
          <RailButton
            active={active === "__memory__"}
            onClick={() => setActive("__memory__")}
            icon={<Database className="w-3 h-3 stroke-[1.75]" />}
            label="Memory"
            sub={String(memItems.length)}
          />
          <RailButton
            active={active === "__history__"}
            onClick={() => setActive("__history__")}
            icon={<History className="w-3 h-3 stroke-[1.75]" />}
            label="Versions"
            sub={String(history.length)}
          />
        </nav>

        <div className="mt-auto pt-4 border-t border-line">
          <button onClick={startChat} className="btn btn-primary w-full">
            <MessageSquare className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Open chat</span>
          </button>
        </div>
      </aside>

      {/* ─── Main panel ─── */}
      <main className="min-w-0 min-h-0 overflow-y-auto">
        {fileTab && activeFile && (
          <div className="flex flex-col h-full">
            <div className="flex items-start justify-between mb-4 pb-4 border-b border-line">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-ink-900">{activeFile.label}</h2>
                  <span className="text-2xs font-mono text-ink-300 bg-paper-200 px-1.5 py-0.5">
                    {activeFile.sub}
                  </span>
                  {dirty[activeFile.key] && (
                    <span className="text-2xs font-mono text-clay-700">unsaved</span>
                  )}
                </div>
                <p className="text-xs text-ink-400 max-w-xl">{activeFile.description}</p>
              </div>
              <button
                onClick={() => save(activeFile.key)}
                disabled={!dirty[activeFile.key] || saving}
                className="btn btn-primary"
              >
                {saving ? <span className="spinner" /> : <Save className="w-3.5 h-3.5 stroke-[1.75]" />}
                <span>Save</span>
              </button>
            </div>
            <textarea
              value={fileContents[activeFile.key] ?? ""}
              onChange={(e) => markDirty(activeFile.key, e.target.value)}
              className="textarea-mono flex-1 min-h-[500px]"
              spellCheck={false}
            />
            <div className="mt-2 text-2xs font-mono text-ink-300 flex items-center gap-3">
              <span>{(fileContents[activeFile.key] ?? "").length} chars</span>
              <span>•</span>
              <span>Auto-saved on click</span>
              {message && (
                <>
                  <span>•</span>
                  <span className="text-moss-600">{message}</span>
                </>
              )}
            </div>
          </div>
        )}

        {active === "__sandbox__" && (
          <div className="flex flex-col h-full">
            <div className="flex items-start justify-between mb-4 pb-4 border-b border-line">
              <div>
                <h2 className="text-lg font-semibold text-ink-900 mb-1">Sandbox</h2>
                <p className="text-xs text-ink-400">
                  Isolated filesystem for this agent. Read and write files, run shell commands.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/files?agent=${id}`}
                  className="btn btn-ghost btn-sm"
                >
                  <Folder className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span>Open in Files</span>
                </Link>
                <button onClick={exec} className="btn">
                  <Terminal className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span>Run command</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[260px_1fr] gap-0 border border-line flex-1 min-h-[500px]">
              {/* file tree */}
              <div className="border-r border-line bg-paper-50 flex flex-col">
                <div className="px-3 py-2 border-b border-line flex items-center justify-between">
                  <span className="text-2xs font-mono text-ink-400 truncate">{sandboxPath}</span>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {sandboxPath !== "." && (
                    <button
                      onClick={() => loadSandbox(sandboxPath.split("/").slice(0, -1).join("/") || ".")}
                      className="w-full text-left px-3 py-1 text-xs text-ink-400 hover:bg-paper-100"
                    >
                      ..
                    </button>
                  )}
                  {sandboxEntries.map((e) => (
                    <button
                      key={e.path}
                      onClick={() => e.type === "dir" ? loadSandbox(e.path) : openFile(e.path)}
                      className={`w-full text-left px-3 py-1 text-xs flex items-center gap-1.5 hover:bg-paper-100 ${
                        openFilePath === e.path ? "bg-paper-200" : ""
                      }`}
                    >
                      {e.type === "dir"
                        ? <Folder className="w-3 h-3 stroke-[1.75] text-ink-400" />
                        : <File className="w-3 h-3 stroke-[1.75] text-ink-300" />}
                      <span className="font-mono truncate">{e.name}</span>
                    </button>
                  ))}
                  {sandboxEntries.length === 0 && (
                    <div className="px-3 py-3 text-xs text-ink-300 italic">(empty)</div>
                  )}
                </div>
              </div>
              {/* file editor */}
              <div className="flex flex-col">
                <div className="px-3 py-2 border-b border-line flex items-center justify-between">
                  <span className="text-2xs font-mono text-ink-400 truncate">
                    {openFilePath || "Select a file"}
                  </span>
                  {openFilePath && (
                    <button onClick={saveSandbox} className="btn btn-ghost btn-sm">
                      <Save className="w-3 h-3 stroke-[1.75]" />
                      <span>Save</span>
                    </button>
                  )}
                </div>
                <textarea
                  value={sandboxContent}
                  onChange={(e) => setSandboxContent(e.target.value)}
                  placeholder={openFilePath ? "" : "Select a file from the left to view or edit it…"}
                  className="textarea-mono flex-1 border-0"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        )}

        {active === "__memory__" && (
          <div className="flex flex-col h-full">
            <div className="mb-4 pb-4 border-b border-line">
              <h2 className="text-lg font-semibold text-ink-900 mb-1">Memory</h2>
              <p className="text-xs text-ink-400">Key-value facts the agent can recall across sessions.</p>
            </div>
            <div className="card mb-4">
              <div className="card-body">
                <div className="grid grid-cols-[100px_1fr_2fr_auto] gap-2">
                  <select
                    value={memKind}
                    onChange={(e) => setMemKind(e.target.value)}
                    className="input"
                  >
                    {["fact", "preference", "reference", "task"].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                  <input
                    value={memKey}
                    onChange={(e) => setMemKey(e.target.value)}
                    placeholder="key"
                    className="input"
                  />
                  <input
                    value={memVal}
                    onChange={(e) => setMemVal(e.target.value)}
                    placeholder="value"
                    className="input"
                    onKeyDown={(e) => e.key === "Enter" && addMemory()}
                  />
                  <button onClick={addMemory} className="btn btn-primary">
                    <Plus className="w-3.5 h-3.5 stroke-[1.75]" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="card overflow-hidden">
              {memItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-ink-400 italic">
                  No memory items yet. Add one above.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {memItems.map((m) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                      <span className="font-mono text-ink-400 text-2xs bg-paper-200 px-1.5 py-0.5">
                        {m.kind}
                      </span>
                      <span className="font-medium text-ink-900">{m.key}</span>
                      <span className="flex-1 text-ink-600 truncate">{m.value}</span>
                      <button
                        onClick={() => deleteMem(m.id)}
                        className="text-ink-300 hover:text-rose-700 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {active === "__history__" && (
          <div className="flex flex-col h-full">
            <div className="mb-4 pb-4 border-b border-line">
              <h2 className="text-lg font-semibold text-ink-900 mb-1">File versions</h2>
              <p className="text-xs text-ink-400">Every save creates a version. Revert to any past state.</p>
            </div>
            <div className="card overflow-hidden">
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-ink-400 italic">
                  No versions yet. Save a file to create one.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {history.map((h: any) => (
                    <div key={h.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                      <RotateCcw className="w-3.5 h-3.5 text-ink-300 stroke-[1.75]" />
                      <span className="font-mono text-ink-700 bg-paper-200 px-1.5 py-0.5">{h.filename}</span>
                      <span className="flex-1 text-ink-400 truncate">{h.message || "(no message)"}</span>
                      <span className="text-2xs font-mono text-ink-300">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                      <button onClick={() => revert(h.id)} className="btn btn-ghost btn-sm">
                        Revert
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function RailButton({
  active, onClick, icon, label, sub,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-2.5 py-1.5 text-xs flex items-center gap-2 border-l-2 transition-colors ${
        active
          ? "border-ink-900 bg-paper-200 text-ink-900"
          : "border-transparent text-ink-600 hover:text-ink-900 hover:bg-paper-100"
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {sub && <span className="text-2xs font-mono text-ink-300">{sub}</span>}
    </button>
  );
}
