import { useEffect, useState } from "react";
import { Skills, Skill } from "../api";
import { Plus, Trash2, Sparkles, FileText, Search } from "lucide-react";

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({ id: "", name: "", description: "", body: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      const { skills } = await Skills.list();
      setSkills(skills);
    } catch (err) {
      console.warn("Skills.list failed:", err);
      setSkills([]);
    }
  }
  useEffect(() => { reload(); }, []);

  function startEdit(s: Skill) {
    setEditing(s.id);
    setDraft({ id: s.id, name: s.name, description: s.description, body: s.body });
  }

  function startNew() {
    setEditing(null);
    setDraft({ id: "", name: "", description: "", body: "" });
  }

  async function save() {
    if (!draft.id.trim() || !draft.name.trim()) return;
    setSaving(true);
    try {
      await Skills.save(draft.id, draft.name, draft.body, draft.description);
      startNew();
      await reload();
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("Delete this skill?")) return;
    try {
      await Skills.remove(id);
    } catch (err) {
      console.warn("Skills.remove failed:", err);
    }
    if (editing === id) startNew();
    await reload();
  }

  const filtered = skills.filter((s) =>
    !q.trim() || s.name.toLowerCase().includes(q.toLowerCase()) || s.id.includes(q.toLowerCase())
  );
  const user = filtered.filter((s) => s.source === "user");
  const builtin = filtered.filter((s) => s.source !== "user");

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="eyebrow">Library</div>
          <h1 className="serif text-3xl text-ink-900">Skills</h1>
          <p className="text-sm text-ink-400 mt-1 max-w-xl">
            Reusable procedures agents can call as tools. Skills are markdown — versioned, hash-addressed, and loaded into context on demand.
          </p>
        </div>
        <button onClick={startNew} className="btn btn-primary">
          <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> New skill
        </button>
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-6">
        {/* List */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 stroke-[1.75] text-ink-300" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search skills…"
              className="input pl-9"
            />
          </div>

          {user.length > 0 && (
            <div>
              <div className="eyebrow px-1 mb-2">Your skills · {user.length}</div>
              <div className="space-y-1">
                {user.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => startEdit(s)}
                    className={`w-full text-left border rounded p-3 transition ${
                      editing === s.id
                        ? "border-ink-900 bg-paper-50"
                        : "border-line bg-paper hover:border-ink-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 stroke-[1.75] text-clay-700" />
                      <span className="text-sm font-medium text-ink-900 truncate">{s.name}</span>
                    </div>
                    <div className="font-mono text-2xs text-ink-300 mt-0.5">{s.id}</div>
                    <div className="text-xs text-ink-400 mt-1.5 line-clamp-2">{s.description || <span className="italic">no description</span>}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {builtin.length > 0 && (
            <div>
              <div className="eyebrow px-1 mb-2">Built-in · {builtin.length}</div>
              <div className="space-y-1">
                {builtin.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => startEdit(s)}
                    className="w-full text-left border border-line bg-paper-50 rounded p-3 hover:bg-paper-100 transition"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 stroke-[1.75] text-ink-400" />
                      <span className="text-sm font-medium text-ink-700 truncate">{s.name}</span>
                    </div>
                    <div className="font-mono text-2xs text-ink-300 mt-0.5">{s.id}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-sm text-ink-400 italic px-2 py-8 text-center">
              No skills match "{q}"
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="border border-line rounded bg-paper">
          <div className="px-5 py-3 border-b border-line flex items-center gap-2">
            <span className="text-sm font-medium text-ink-700">
              {editing ? "Edit skill" : "Create skill"}
            </span>
            {editing && <span className="text-2xs font-mono text-ink-300">{editing}</span>}
            {editing && (
              <button onClick={() => del(editing)} className="ml-auto text-rose-700 hover:text-rose-800">
                <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
              </button>
            )}
          </div>
          <div className="p-5 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">id</label>
                <input
                  value={draft.id}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  placeholder="e.g. summarize-meeting"
                  disabled={!!editing}
                  className="input font-mono text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="label">name</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Summarize a meeting"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">description</label>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What does this skill do? When should an agent use it?"
                className="input"
              />
            </div>
            <div className="flex-1">
              <label className="label">procedure (markdown)</label>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="# Step 1&#10;Do the first thing…"
                className="textarea-mono h-[420px] text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              {editing && <button onClick={startNew} className="btn">Cancel</button>}
              <button
                onClick={save}
                disabled={!draft.id.trim() || !draft.name.trim() || saving}
                className="btn btn-primary"
              >
                {saving ? "Saving…" : editing ? "Update skill" : "Create skill"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
