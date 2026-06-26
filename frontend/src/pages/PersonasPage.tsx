import { useEffect, useState } from "react";
import { Personas, type Persona } from "../api";
import {
  Sparkles, Plus, Trash2, Check, X, Palette, Monitor,
  ArrowRight, Star,
} from "lucide-react";

const PASTEL_HUES = [
  { hue: 0, name: "Rose" },
  { hue: 30, name: "Coral" },
  { hue: 60, name: "Gold" },
  { hue: 120, name: "Mint" },
  { hue: 180, name: "Teal" },
  { hue: 210, name: "Sky" },
  { hue: 260, name: "Lavender" },
  { hue: 300, name: "Mauve" },
  { hue: 330, name: "Blush" },
];

export default function PersonasPage() {
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
      const { personas } = await Personas.list();
      setPersonas(personas);
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

  async function setActive(id: string) {
    await Personas.setActive(id);
    await reload();
  }

  async function updateName(id: string) {
    if (!editName.trim()) return;
    await Personas.update(id, { name: editName.trim() });
    setEditingId(null);
    await reload();
  }

  async function updatePrompt(id: string) {
    if (!editPrompt.trim()) return;
    await Personas.update(id, { prompt: editPrompt.trim() });
    setEditingId(null);
    await reload();
  }

  async function del(id: string) {
    const p = personas.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Delete persona "${p.name}"?`)) return;
    await Personas.delete(id);
    await reload();
  }

  const activePersona = personas.find((p) => p.isActive);

  function hueRing(hue: number) {
    if (hue < 0) return null;
    return (
      <span
        className="inline-block w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: `hsl(${hue}, 70%, 75%)` }}
      />
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">Identity</div>
        <h1 className="serif text-3xl text-ink-900">Personas</h1>
        <p className="text-sm text-ink-400 mt-1 max-w-xl">
          Personas shape how your agents respond. Switch between them to
          change tone, style, or expertise — without modifying your agents.
        </p>
      </div>

      {/* Active persona banner */}
      {activePersona && (
        <div className="border border-clay-300 bg-clay-50 rounded px-4 py-3 mb-6 flex items-center gap-3">
          {hueRing(activePersona.imageHue) || (
            <Sparkles className="w-4 h-4 stroke-[1.75] text-clay-700" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-clay-600 font-medium uppercase tracking-wider">
              Active persona
            </div>
            <div className="text-sm font-medium text-clay-900 truncate">
              {activePersona.name}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 stroke-[1.75] text-clay-500" />
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-line rounded bg-paper mb-6">
          <div className="px-5 py-3 border-b border-line flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 stroke-[1.75] text-ink-700" />
            <span className="text-sm font-medium text-ink-700">New persona</span>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <div>
              <label className="label">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Executive, Writer, Researcher"
                className="input" />
            </div>
            <div>
              <label className="label">Prompt — describes how this persona behaves</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="You are a calm, analytical strategist. You speak in concise paragraphs..."
                className="input min-h-[100px] resize-y font-mono text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Model override (optional)</label>
                <input value={model} onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gpt-4o, claude-sonnet-4"
                  className="input font-mono" />
              </div>
              <div>
                <label className="label">Accent colour</label>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  <button onClick={() => setImageHue(-1)}
                    className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px]
                      ${imageHue < 0 ? "border-ink-900 ring-2 ring-ink-300" : "border-line"}`}>
                    <Monitor className="w-3 h-3 stroke-[1.75]" />
                  </button>
                  {PASTEL_HUES.map((h) => (
                    <button key={h.hue} onClick={() => setImageHue(h.hue)}
                      className={`w-7 h-7 rounded-full border
                        ${imageHue === h.hue ? "border-ink-900 ring-2 ring-ink-300" : "border-line"}`}
                      style={{ backgroundColor: `hsl(${h.hue}, 70%, 75%)` }}
                      title={h.name} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn">Cancel</button>
              <button onClick={create} disabled={!name.trim() || !prompt.trim()}
                className="btn btn-primary">
                <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> Create
              </button>
            </div>
          </div>
        </div>
      )}
      {!showCreate && (
        <button onClick={() => setShowCreate(true)}
          className="btn btn-outline mb-6">
          <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> New persona
        </button>
      )}

      {/* Persona list */}
      <div className="space-y-2">
        {personas.length === 0 && (
          <div className="text-sm text-ink-400 italic text-center py-12">
            No personas yet. Create one to define how your AI responds.
          </div>
        )}
        {personas.map((p) => (
          <div key={p.id}
            className={`border rounded bg-paper px-4 py-3 ${
              p.isActive ? "border-clay-500 ring-1 ring-clay-300" : "border-line"
            }`}>
            <div className="flex items-center gap-3">
              {/* Hue dot */}
              {p.imageHue >= 0 ? (
                <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: `hsl(${p.imageHue}, 65%, 75%)` }}>
                  <span className="text-sm font-bold"
                    style={{ color: `hsl(${p.imageHue}, 40%, 25%)` }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                </span>
              ) : (
                <span className="w-8 h-8 rounded-full shrink-0 bg-paper-300 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 stroke-[1.75] text-ink-500" />
                </span>
              )}
              <div className="flex-1 min-w-0">
                {editingId === p.id ? (
                  <div className="flex flex-col gap-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="input text-sm font-medium" autoFocus />
                    <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                      className="input text-xs min-h-[60px] resize-y font-mono" />
                    <div className="flex gap-2">
                      <button onClick={() => {
                        updateName(p.id);
                        updatePrompt(p.id);
                      }} className="btn btn-primary btn-xs">
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
                      <span className="text-sm font-medium text-ink-900">{p.name}</span>
                      {p.isActive && (
                        <span className="text-2xs bg-clay-100 text-clay-800 px-1.5 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    {p.model && (
                      <div className="text-2xs text-ink-400 font-mono mt-0.5">
                        Model: {p.model}
                      </div>
                    )}
                    <div className="text-xs text-ink-500 mt-0.5 line-clamp-2">
                      {p.prompt}
                    </div>
                  </>
                )}
              </div>
              {editingId !== p.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => {
                    setEditingId(p.id);
                    setEditName(p.name);
                    setEditPrompt(p.prompt);
                  }} className="btn btn-ghost btn-xs text-ink-400 hover:text-ink-700">
                    Edit
                  </button>
                  {!p.isActive && (
                    <button onClick={() => setActive(p.id)}
                      className="btn btn-ghost btn-xs text-amber-700 hover:text-amber-800"
                      title="Activate">
                      <Star className="w-3.5 h-3.5 stroke-[1.75]" />
                    </button>
                  )}
                  <button onClick={() => del(p.id)}
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
