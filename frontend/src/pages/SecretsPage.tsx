import { useEffect, useState } from "react";
import { Secrets, SecretMeta } from "../api";
import { KeyRound, Plus, Trash2, Eye, EyeOff, Copy, Check } from "lucide-react";

const REF_PREFIX = "${secrets.";

function refFor(name: string) {
  return `${REF_PREFIX}${name}}`;
}

export default function SecretsPage() {
  const [items, setItems] = useState<SecretMeta[]>([]);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyTarget, setCopyTarget] = useState<string | null>(null);

  async function reload() {
    const { secrets } = await Secrets.list();
    setItems(secrets);
  }
  useEffect(() => { reload(); }, []);

  async function save() {
    if (!name.trim() || !value.trim()) return;
    await Secrets.save(name, value);
    setName(""); setValue("");
    await reload();
  }

  async function del(n: string) {
    if (!confirm(`Delete secret "${n}"? This cannot be undone.`)) return;
    await Secrets.remove(n);
    reload();
  }

  function copyRef(n: string) {
    navigator.clipboard.writeText(refFor(n));
    setCopyTarget(n);
    setTimeout(() => setCopyTarget((cur) => (cur === n ? null : cur)), 1200);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">Security</div>
        <h1 className="serif text-3xl text-ink-900">Secrets</h1>
        <p className="text-sm text-ink-400 mt-1 max-w-xl">
          Encrypted at rest with AES-256-GCM. Reference from any agent's{" "}
          <code className="font-mono text-2xs bg-paper-200 px-1 py-0.5 rounded">config.json</code>{" "}
          via <code className="font-mono text-2xs bg-paper-200 px-1 py-0.5 rounded">{refFor("NAME")}</code>.
        </p>
      </div>

      {/* Add secret */}
      <div className="border border-line rounded bg-paper mb-6">
        <div className="px-5 py-3 border-b border-line flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5 stroke-[1.75] text-ink-700" />
          <span className="text-sm font-medium text-ink-700">Add a secret</span>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label">name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              placeholder="OPENAI_API_KEY"
              className="input font-mono"
            />
          </div>
          <div>
            <label className="label flex items-center gap-2">
              value
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="text-ink-400 hover:text-ink-700"
              >
                {show ? <EyeOff className="w-3 h-3 stroke-[1.75]" /> : <Eye className="w-3 h-3 stroke-[1.75]" />}
              </button>
            </label>
            <input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-..."
              className="input font-mono"
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={!name.trim() || !value.trim()} className="btn btn-primary">
              <Plus className="w-3.5 h-3.5 stroke-[1.75]" /> Save
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-1.5">
        <div className="eyebrow mb-2">{items.length} secret{items.length === 1 ? "" : "s"}</div>
        {items.length === 0 && (
          <div className="text-sm text-ink-400 italic text-center py-12">No secrets yet.</div>
        )}
        {items.map((s) => (
          <div key={s.id} className="border border-line rounded bg-paper px-4 py-2.5 flex items-center gap-3 group">
            <KeyRound className="w-3.5 h-3.5 stroke-[1.75] text-clay-700" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm text-ink-900">{s.name}</div>
              <div className="text-2xs text-ink-300 font-mono">
                added {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => copyRef(s.name)}
              className="btn btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
              title="Copy reference"
            >
              {copyTarget === s.name ? (
                <Check className="w-3.5 h-3.5 stroke-[1.75] text-emerald-700" />
              ) : (
                <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
              )}
              <span className="font-mono text-2xs">{refFor(s.name)}</span>
            </button>
            <button onClick={() => del(s.name)} className="btn btn-ghost text-rose-700 hover:text-rose-800">
              <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
