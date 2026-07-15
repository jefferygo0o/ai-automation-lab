import { useLocation, useNavigate } from "react-router-dom";
import {
  Brain, Wrench, Settings, ChevronRight,
} from "lucide-react";

const TABS = [
  { id: "ai", label: "AI", icon: Brain, sub: "Personas, rules & AI provider keys" },
  { id: "tools", label: "Tools", icon: Wrench, sub: "External services & connections" },
  { id: "advanced", label: "Advanced", icon: Settings, sub: "Snapshots, system stats & reset" },
];

export default function SettingsPage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const hash = loc.hash.replace("#", "") || "ai";
  const activeTab = TABS.find((t) => t.id === hash) ?? TABS[0];

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">System</div>
        <h1 className="serif text-3xl text-ink-900">Settings</h1>
        <p className="text-sm text-ink-400 mt-1">
          Configure agent providers, personas, rules, secrets, and system settings.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-line mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab.id === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(`/settings#${tab.id}`)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-ink-900 text-ink-900"
                  : "border-transparent text-ink-400 hover:text-ink-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab.id === "ai" && <SettingsAI />}
        {activeTab.id === "advanced" && <SettingsAdvanced />}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  Sparkles, Scale, Plus, Trash2, Check, X,
  ToggleLeft, ToggleRight, ArrowUp, ArrowDown,
  Monitor, KeyRound, History, Download, RotateCcw,
  Loader2, AlertCircle, Cpu, Server, Bot, Pencil,
} from "lucide-react";
import AgentConfigForm from "../components/AgentConfigForm";
import {
  Personas, type Persona,
  Rules, type Rule,
  Secrets, type SecretMeta,
  type DashboardStats,
  Dashboard,
  Agents, type Agent, type AgentConfig,
} from "../api";

const PASTEL_HUES = [
  { hue: 0, name: "Rose" }, { hue: 30, name: "Coral" },
  { hue: 60, name: "Gold" }, { hue: 120, name: "Mint" },
  { hue: 180, name: "Teal" }, { hue: 210, name: "Sky" },
  { hue: 260, name: "Lavender" }, { hue: 300, name: "Mauve" },
  { hue: 330, name: "Blush" },
];

const RULE_CATEGORIES = ["communication", "safety", "coding", "style", "general"];

// ─── AI Tab: Agent Config + Personas + Rules ────────────────────────

function SettingsAI() {
  return (
    <div className="space-y-8">
      <AgentConfigSection />
      <PersonasSection />
      <RulesSection />
    </div>
  );
}

/** Bring Your Own Key / Agent provider configuration — mirrors Zo's AI → BYOK panel */
function AgentConfigSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [modelName, setModelName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [modelId, setModelId] = useState("");
  const [imageSupport, setImageSupport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);

  async function reload() {
    try {
      const r = await Agents.list();
      setAgents(r.agents ?? []);
      const s2 = await Secrets.list();
      setSecrets(s2.secrets ?? []);
    } catch (e: any) {
      setError(e?.message ?? "failed to load agents");
      setAgents([]);
    }
  }
  useEffect(() => { reload(); }, []);

  async function addModel() {
    if (!modelName.trim() || !baseUrl.trim() || !modelId.trim()) return;
    if (!apiKeySecret && !newSecretName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Resolve which secret name to use
      let keyName = apiKeySecret;
      if (!keyName) {
        keyName = newSecretName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
        if (!newSecretValue.trim()) throw new Error("Secret value is required when creating a new key");
        await Secrets.save(keyName, newSecretValue.trim());
      }
      const configJson = {
        provider: "openai",
        baseUrl: baseUrl.trim(),
        apiKeySecret: keyName,
        model: modelId.trim(),
        temperature: 0.7,
        maxTokens: 32768,
        sandbox: {
          backend: "local",
          workdir: "workdir",
          timeoutMs: 120000,
          memoryMb: 512,
          cpus: 1,
          network: "egress",
          allowHosts: [],
        },
        permissions: {
          read_file: "always",
          list_files: "always",
          write_file: "ask",
          execute_command: "ask",
          http_request: "ask",
          list_mcp_tools: "always",
          call_mcp_tool: "ask",
          update_memory: "always",
        },
        mcpServers: [],
      };
      const { agent } = await Agents.create(modelName.trim());
      await Agents.updateConfig(agent.id, configJson as any);
      setShowAddModel(false);
      setModelName("");
      setBaseUrl("");
      setApiKeySecret("");
      setNewSecretName("");
      setNewSecretValue("");
      setModelId("");
      setImageSupport(false);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "failed to add model");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent(id: string, name: string) {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    await Agents.remove(id);
    await reload();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 stroke-[1.75]" /> AI Agents & Models
          </h2>
          <p className="text-2xs text-ink-400 mt-0.5">
            Add new model connections — each one creates an agent row with provider config and API key secret.
          </p>
        </div>
        {!showAddModel && (
          <button onClick={() => setShowAddModel(true)} className="btn btn-outline btn-xs">
            <Plus className="w-3 h-3" /> Add Model
          </button>
        )}
      </div>

      {showAddModel && (
        <div className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-[1px] flex items-center justify-center p-4" onClick={() => setShowAddModel(false)}>
          <div className="w-full max-w-md rounded-lg border border-line bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-ink-900">Add new model</h3>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-700">Name</label>
                <input className="input text-sm" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="My Model" autoFocus />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-700">Base URL</label>
                <input className="input text-sm font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-700">API Key</label>
                <select className="input text-sm font-mono" value={apiKeySecret} onChange={(e) => setApiKeySecret(e.target.value)}>
                  <option value="">— Create new secret —</option>
                  {secrets.map((sec) => (
                    <option key={sec.id} value={sec.name}>{sec.name}</option>
                  ))}
                </select>
                {!apiKeySecret && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input className="input text-xs font-mono" value={newSecretName} onChange={(e) => setNewSecretName(e.target.value)} placeholder="SECRET_NAME (e.g. OPENAI_API_KEY)" />
                    <input className="input text-xs font-mono" type="password" value={newSecretValue} onChange={(e) => setNewSecretValue(e.target.value)} placeholder="sk-..." />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-700">Model ID</label>
                <input className="input text-sm font-mono" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4.1" />
              </div>
              <div className="flex items-center justify-between rounded border border-line px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-ink-700">Image support</div>
                  <div className="text-2xs text-ink-400">{imageSupport ? "Images enabled." : "Text only."}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setImageSupport((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${imageSupport ? 'bg-emerald-500' : 'bg-ink-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-paper transition-transform ${imageSupport ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              {error && <div className="text-2xs text-rose-700">{error}</div>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setShowAddModel(false); setError(null); }} className="btn btn-sm">Cancel</button>
              <button onClick={addModel} disabled={saving || !modelName.trim() || !baseUrl.trim() || !modelId.trim() || (!apiKeySecret && (!newSecretName.trim() || !newSecretValue.trim()))} className="btn btn-primary btn-sm">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {agents.map((a) => (
          <div key={a.id} className="border border-line rounded bg-paper px-3 py-2 flex items-center gap-3">
            <Bot className="w-3.5 h-3.5 stroke-[1.75] text-indigo-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-ink-900 truncate">{a.name}</div>
              <div className="text-2xs text-ink-400 font-mono truncate">{a.id}</div>
            </div>
            <button
              onClick={() => deleteAgent(a.id, a.name)}
              className="btn btn-ghost btn-xs text-rose-700"
              title="Delete agent"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {agents.length === 0 && !showAddModel && (
          <div className="text-xs text-ink-400 italic text-center py-6">
            No models configured. Click <span className="font-medium text-ink-500">Add Model</span> to connect one.
          </div>
        )}
      </div>
    </section>
  );
}

function PersonasSection() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [imageHue, setImageHue] = useState(-1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editName, setEditName] = useState("");

  async function reload() {
    try {
      const { personas: p } = await Personas.list();
      setPersonas(p);
    } catch { setPersonas([]); }
  }
  useEffect(() => { reload(); }, []);

  async function create() {
    if (!name.trim() || !prompt.trim()) return;
    await Personas.create(name.trim(), prompt.trim(), {
      imageHue: imageHue >= 0 ? imageHue : undefined,
      model: model.trim() || undefined,
    });
    setName(""); setPrompt(""); setModel(""); setImageHue(-1); setShowCreate(false);
    await reload();
  }

  async function setActive(id: string) { await Personas.setActive(id); await reload(); }

  async function updateName(id: string) {
    if (!editName.trim()) return;
    await Personas.update(id, { name: editName.trim() });
    setEditingId(null); await reload();
  }

  async function updatePrompt(id: string) {
    if (!editPrompt.trim()) return;
    await Personas.update(id, { prompt: editPrompt.trim() });
    setEditingId(null); await reload();
  }

  async function del(id: string) {
    const p = personas.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Delete persona "${p.name}"?`)) return;
    await Personas.delete(id); await reload();
  }

  const activePersona = personas.find((p) => p.isActive);

  function hueDot(hue: number) {
    return <span className="inline-block w-3 h-3 rounded-full shrink-0"
      style={{ backgroundColor: `hsl(${hue}, 70%, 75%)` }} />;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 stroke-[1.75]" /> Personas
          </h2>
          <p className="text-2xs text-ink-400 mt-0.5">
            Personas shape how your agents respond. Switch between them to change tone, style, or expertise.
          </p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn btn-outline btn-xs">
            <Plus className="w-3 h-3" /> New
          </button>
        )}
      </div>

      {activePersona && (
        <div className="border border-clay-300 bg-clay-50 rounded px-3 py-2 mb-3 flex items-center gap-2 text-xs">
          {activePersona.imageHue >= 0 ? hueDot(activePersona.imageHue) : <Sparkles className="w-3 h-3 stroke-[1.75] text-clay-700" />}
          <span className="text-clay-600">Active:</span>
          <span className="font-medium text-clay-900">{activePersona.name}</span>
        </div>
      )}

      {showCreate && (
        <div className="border border-line rounded bg-paper p-4 mb-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Name" className="input text-sm" />
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt — describes how this persona behaves"
            className="input min-h-[80px] resize-y font-mono text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <input value={model} onChange={(e) => setModel(e.target.value)}
              placeholder="Model override (optional)" className="input font-mono text-xs" />
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setImageHue(-1)}
                className={`w-6 h-6 rounded-full border flex items-center justify-center text-[9px] ${imageHue < 0 ? "border-ink-900 ring-1 ring-ink-300" : "border-line"}`}>
                <Monitor className="w-2.5 h-2.5 stroke-[1.75]" />
              </button>
              {PASTEL_HUES.map((h) => (
                <button key={h.hue} onClick={() => setImageHue(h.hue)}
                  className={`w-6 h-6 rounded-full border ${imageHue === h.hue ? "border-ink-900 ring-1 ring-ink-300" : "border-line"}`}
                  style={{ backgroundColor: `hsl(${h.hue}, 70%, 75%)` }} title={h.name} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="btn btn-xs">Cancel</button>
            <button onClick={create} disabled={!name.trim() || !prompt.trim()} className="btn btn-primary btn-xs">Create</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {personas.map((p) => (
          <div key={p.id} className={`border rounded bg-paper px-3 py-2 flex items-center gap-2 ${p.isActive ? "border-clay-500 ring-1 ring-clay-300" : "border-line"}`}>
            {p.imageHue >= 0 ? (
              <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `hsl(${p.imageHue}, 65%, 75%)` }}>
                <span className="text-[10px] font-bold" style={{ color: `hsl(${p.imageHue}, 40%, 25%)` }}>{p.name.charAt(0).toUpperCase()}</span>
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full shrink-0 bg-paper-300 flex items-center justify-center">
                <Sparkles className="w-3 h-3 stroke-[1.75] text-ink-500" />
              </span>
            )}
            {editingId === p.id ? (
              <div className="flex-1 space-y-1">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input text-xs" autoFocus />
                <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className="input text-[11px] min-h-[40px] resize-y font-mono" />
                <div className="flex gap-1">
                  <button onClick={() => { updateName(p.id); updatePrompt(p.id); }} className="btn btn-primary btn-xs"><Check className="w-2.5 h-2.5" /> Save</button>
                  <button onClick={() => setEditingId(null)} className="btn btn-xs"><X className="w-2.5 h-2.5" /> Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-ink-900">{p.name}</span>
                    {p.isActive && <span className="text-2xs bg-clay-100 text-clay-800 px-1 py-0.5 rounded-full">Active</span>}
                  </div>
                  {p.model && <div className="text-2xs text-ink-400 font-mono">{p.model}</div>}
                  <div className="text-[11px] text-ink-500 line-clamp-1">{p.prompt}</div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => { setEditingId(p.id); setEditName(p.name); setEditPrompt(p.prompt); }}
                    className="btn btn-ghost btn-xs text-ink-400 hover:text-ink-700">Edit</button>
                  {!p.isActive && (
                    <button onClick={() => setActive(p.id)} className="btn btn-ghost btn-xs text-amber-700" title="Activate">
                      <ToggleRight className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => del(p.id)} className="btn btn-ghost btn-xs text-rose-700"><Trash2 className="w-3 h-3" /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {personas.length === 0 && !showCreate && (
          <div className="text-xs text-ink-400 italic text-center py-6">No personas yet. Create one to define how your AI responds.</div>
        )}
      </div>
    </section>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [condition, setCondition] = useState("");
  const [category, setCategory] = useState("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [editCondition, setEditCondition] = useState("");

  async function reload() {
    try { const r = await Rules.list(); setRules(r.rules ?? r as any ?? []); } catch { setRules([]); }
  }
  useEffect(() => { reload(); }, []);

  async function create() {
    if (!instruction.trim()) return;
    await Rules.create(instruction.trim(), instruction.trim(), { description: condition.trim() || undefined, category });
    setInstruction(""); setCondition(""); setCategory("general"); setShowCreate(false);
    await reload();
  }

  async function toggle(id: string, enabled: boolean) { await Rules.update(id, { enabled: !enabled }); await reload(); }

  async function del(id: string) {
    if (!confirm("Delete this rule?")) return;
    await Rules.delete(id); await reload();
  }

  async function moveUp(id: string) { await Rules.reorder(id, "up"); await reload(); }
  async function moveDown(id: string) { await Rules.reorder(id, "down"); await reload(); }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 stroke-[1.75]" /> Rules
          </h2>
          <p className="text-2xs text-ink-400 mt-0.5">
            Rules are always-applied behavioural constraints injected into every agent's system prompt.
          </p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn btn-outline btn-xs">
            <Plus className="w-3 h-3" /> New
          </button>
        )}
      </div>

      {showCreate && (
        <div className="border border-line rounded bg-paper p-4 mb-3 space-y-2">
          <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="Rule instruction — e.g. 'Always use British English spelling'"
            className="input min-h-[60px] resize-y font-mono text-xs" />
          <input value={condition} onChange={(e) => setCondition(e.target.value)}
            placeholder="Condition (optional) — e.g. 'when chatting about code'"
            className="input text-xs" />
          <div className="flex items-center gap-2">
            <label className="text-2xs text-ink-500">Category:</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="input text-xs py-1">
              {RULE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="btn btn-xs">Cancel</button>
            <button onClick={create} disabled={!instruction.trim()} className="btn btn-primary btn-xs">Create</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <div key={r.id} className={`border rounded bg-paper px-3 py-2 flex items-center gap-2 ${!r.enabled ? "opacity-50" : "border-line"}`}>
            <div className="flex flex-col gap-0.5 shrink-0">
              <button onClick={() => moveUp(r.id)} disabled={i === 0} className="btn btn-ghost btn-xs p-0"><ArrowUp className="w-2.5 h-2.5" /></button>
              <button onClick={() => moveDown(r.id)} disabled={i === rules.length - 1} className="btn btn-ghost btn-xs p-0"><ArrowDown className="w-2.5 h-2.5" /></button>
            </div>
            <div className="flex-1 min-w-0">
              {editingId === r.id ? (
                <div className="space-y-1">
                  <textarea value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)} className="input text-xs font-mono min-h-[40px] resize-y" />
                  <input value={editCondition} onChange={(e) => setEditCondition(e.target.value)} placeholder="Condition" className="input text-[11px]" />
                  <div className="flex gap-1">
                    <button onClick={async () => {
                      await Rules.update(r.id, { instruction: editInstruction, description: editCondition });
                      setEditingId(null); await reload();
                    }} className="btn btn-primary btn-xs"><Check className="w-2.5 h-2.5" /> Save</button>
                    <button onClick={() => setEditingId(null)} className="btn btn-xs"><X className="w-2.5 h-2.5" /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-xs font-medium text-ink-900">{r.instruction}</div>
                  {r.description && <div className="text-[11px] text-ink-400 italic">{r.description}</div>}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-2xs px-1 py-0.5 rounded bg-paper-200 text-ink-500">{r.category}</span>
                    <span className="text-2xs text-ink-300">#{r.priority}</span>
                  </div>
                </>
              )}
            </div>
            {editingId !== r.id && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => toggle(r.id, r.enabled)} className="btn btn-ghost btn-xs" title={r.enabled ? "Disable" : "Enable"}>
                  {r.enabled ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5 text-ink-400" />}
                </button>
                <button onClick={() => { setEditingId(r.id); setEditInstruction(r.instruction); setEditCondition(r.description ?? ""); }}
                  className="btn btn-ghost btn-xs text-ink-400 hover:text-ink-700">Edit</button>
                <button onClick={() => del(r.id)} className="btn btn-ghost btn-xs text-rose-700"><Trash2 className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        ))}
        {rules.length === 0 && !showCreate && (
          <div className="text-xs text-ink-400 italic text-center py-6">No rules yet. Rules are injected into every agent's system prompt.</div>
        )}
      </div>
    </section>
  );
}

// ─── Advanced Tab: Secrets + Snapshots ──────────────────────────────

function SettingsAdvanced() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Dashboard.stats()
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <SecretsSection />
      <section>
        <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5 mb-3">
          <History className="w-3.5 h-3.5 stroke-[1.75]" /> System Stats
        </h2>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-ink-400" />
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(stats.counts).map(([k, v]) => (
              <div key={k} className="border border-line rounded bg-paper px-3 py-2">
                <div className="text-2xs text-ink-400 uppercase">{k}</div>
                <div className="text-lg font-semibold text-ink-900">{(v as number).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-ink-400">Could not load stats.</div>
        )}
      </section>
    </div>
  );
}

function SecretsSection() {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  async function reload() {
    try { const s = await Secrets.list(); setSecrets(s.secrets ?? [] as any); } catch { setSecrets([]); }
  }
  useEffect(() => { reload(); }, []);

  async function addSecret() {
    if (!newName.trim() || !newValue.trim()) return;
    await Secrets.save(newName.trim(), newValue.trim());
    setNewName(""); setNewValue(""); setShowAdd(false);
    await reload();
  }

  async function delSecret(name: string) {
    if (!confirm(`Delete secret "${name}"?`)) return;
    await Secrets.remove(name); await reload();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 stroke-[1.75]" /> Secrets
          </h2>
          <p className="text-2xs text-ink-400 mt-0.5">
            Encrypted credentials (AES-256-GCM). API keys, tokens, and passwords used by agents and tools.
          </p>
        </div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} className="btn btn-outline btn-xs">
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>

      {showAdd && (
        <div className="border border-line rounded bg-paper p-4 mb-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Secret name — e.g. STRIPE_SECRET_KEY" className="input text-xs font-mono" />
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)} type="password"
            placeholder="Value" className="input text-xs font-mono" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn btn-xs">Cancel</button>
            <button onClick={addSecret} disabled={!newName.trim() || !newValue.trim()} className="btn btn-primary btn-xs">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {secrets.map((s) => (
          <div key={s.id} className="border border-line rounded bg-paper px-3 py-2 flex items-center gap-2">
            <KeyRound className="w-3 h-3 stroke-[1.75] text-ink-400 shrink-0" />
            <span className="text-xs font-mono text-ink-900 flex-1">{s.name}</span>
            <span className="text-2xs text-ink-300">●●●●●●</span>
            <button onClick={() => delSecret(s.name)} className="btn btn-ghost btn-xs text-rose-700"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
        {secrets.length === 0 && !showAdd && (
          <div className="text-xs text-ink-400 italic text-center py-6">No secrets stored yet.</div>
        )}
      </div>
    </section>
  );
}
