import { useEffect, useState } from "react";
import {
  Scale, Plus, Trash2, Check, X, ToggleLeft, ToggleRight,
  ArrowUp, ArrowDown, GripVertical,
} from "lucide-react";
import { Rules, type Rule } from "../api";

const CATEGORIES = ["communication", "safety", "coding", "style", "general"];

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [category, setCategory] = useState("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [editCategory, setEditCategory] = useState("");

  async function reload() {
    try {
      const { rules } = await Rules.list();
      setRules(rules);
    } catch { setRules([]); }
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function create() {
    if (!name.trim() || !instruction.trim()) return;
    await Rules.create(name.trim(), instruction.trim(), { category });
    setName(""); setInstruction(""); setCategory("general"); setShowCreate(false);
    await reload();
  }

  async function toggle(rule: Rule) {
    await Rules.update(rule.id, { enabled: !rule.enabled });
    await reload();
  }

  async function update(id: string) {
    if (!editName.trim() || !editInstruction.trim()) return;
    await Rules.update(id, {
      name: editName.trim(),
      instruction: editInstruction.trim(),
      category: editCategory || undefined,
    });
    setEditingId(null);
    await reload();
  }

  async function remove(id: string) {
    const r = rules.find((x) => x.id === id);
    if (!r || !confirm(`Delete rule "${r.name}"?`)) return;
    await Rules.delete(id);
    await reload();
  }

  async function moveUp(id: string) {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx <= 0) return;
    const above = rules[idx - 1];
    await Rules.update(id, { priority: above.priority });
    await Rules.update(above.id, { priority: rules[idx].priority });
    await reload();
  }

  async function moveDown(id: string) {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0 || idx >= rules.length - 1) return;
    const below = rules[idx + 1];
    await Rules.update(id, { priority: below.priority });
    await Rules.update(below.id, { priority: rules[idx].priority });
    await reload();
  }

  function categoryColor(cat: string) {
    const colors: Record<string, string> = {
      communication: "text-sky-700 bg-sky-100",
      safety: "text-rose-700 bg-rose-100",
      coding: "text-emerald-700 bg-emerald-100",
      style: "text-violet-700 bg-violet-100",
      general: "text-clay-700 bg-clay-100",
    };
    return colors[cat] ?? colors.general;
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">System</div>
        <h1 className="serif text-3xl text-ink-900">Rules</h1>
        <p className="text-sm text-ink-400 mt-1 max-w-xl">
          Rules are persistent behavioural instructions that apply to all agents.
          They're injected into the system prompt in priority order.
          Toggle them on/off without deleting them.
        </p>
      </div>

      {/* Active rules count */}
      <div className="border border-clay-300 bg-clay-50 rounded px-4 py-3 mb-6 flex items-center gap-3">
        <Scale className="w-4 h-4 stroke-[1.75] text-clay-700" />
        <div className="flex-1">
          <div className="text-xs text-clay-600 font-medium uppercase tracking-wider">Active rules</div>
          <div className="text-sm font-medium text-clay-900">
            {rules.filter((r) => r.enabled).length} of {rules.length} enabled
          </div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-line rounded bg-paper mb-6">
          <div className="px-5 py-3 border-b border-line flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 stroke-[1.75] text-ink-700" />
            <span className="text-sm font-medium text-ink-700">New rule</span>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <div>
              <label className="label">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. British English, No shell commands"
                className="input" />
            </div>
            <div>
              <label className="label">Instruction — what the agent should do</label>
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
                placeholder="Always use British English spelling and grammar (colour, organise, programme)."
                className="input min-h-[80px] resize-y font-mono text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn">Cancel</button>
              <button onClick={create} disabled={!name.trim() || !instruction.trim()}
                className="btn btn-primary">
                <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> Create
              </button>
            </div>
          </div>
        </div>
      )}
      {!showCreate && (
        <button onClick={() => setShowCreate(true)} className="btn btn-outline mb-6">
          <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> New rule
        </button>
      )}

      {/* Rule list */}
      <div className="space-y-2">
        {!loading && rules.length === 0 && (
          <div className="text-sm text-ink-400 italic text-center py-12">
            No rules yet. Create one to define persistent agent behaviour.
          </div>
        )}
        {rules.map((r, i) => (
          <div key={r.id}
            className={`border rounded bg-paper px-4 py-3 ${r.enabled ? "border-line" : "border-line-soft opacity-60"}`}>
            <div className="flex items-start gap-3">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 pt-1">
                <button onClick={() => moveUp(r.id)} disabled={i === 0}
                  className="btn btn-ghost btn-icon text-ink-300 hover:text-ink-700 disabled:opacity-30" title="Move up">
                  <ArrowUp className="w-3 h-3 stroke-[1.75]" />
                </button>
                <button onClick={() => moveDown(r.id)} disabled={i === rules.length - 1}
                  className="btn btn-ghost btn-icon text-ink-300 hover:text-ink-700 disabled:opacity-30" title="Move down">
                  <ArrowDown className="w-3 h-3 stroke-[1.75]" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                {editingId === r.id ? (
                  <div className="flex flex-col gap-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="input text-sm font-medium" autoFocus />
                    <textarea value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)}
                      className="input text-xs min-h-[60px] resize-y font-mono" />
                    <div className="flex gap-2 items-center">
                      <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                        className="input text-xs">
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={() => update(r.id)} className="btn btn-primary btn-xs">
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn btn-xs">
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{r.name}</span>
                      <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium ${categoryColor(r.category)}`}>
                        {r.category}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5 line-clamp-2">
                      {r.instruction}
                    </div>
                  </>
                )}
              </div>

              {editingId !== r.id && (
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  <button onClick={() => toggle(r)}
                    className="btn btn-ghost btn-icon"
                    title={r.enabled ? "Disable" : "Enable"}>
                    {r.enabled
                      ? <ToggleRight className="w-4 h-4 stroke-[1.75] text-emerald-600" />
                      : <ToggleLeft className="w-4 h-4 stroke-[1.75] text-ink-400" />}
                  </button>
                  <button onClick={() => {
                    setEditingId(r.id);
                    setEditName(r.name);
                    setEditInstruction(r.instruction);
                    setEditCategory(r.category ?? "");
                  }} className="btn btn-ghost btn-xs text-ink-400 hover:text-ink-700">Edit</button>
                  <button onClick={() => remove(r.id)}
                    className="btn btn-ghost btn-xs text-rose-700 hover:text-rose-800">
                    <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
