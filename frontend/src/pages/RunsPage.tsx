import { useEffect, useState } from "react";
import { Runs, Run } from "../api";
import { Play, Check, AlertCircle, Loader2, Activity, Clock, Coins, Zap } from "lucide-react";

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { dot: string; label: string; icon: any }> = {
    running: { dot: "bg-clay-500", label: "Running", icon: Loader2 },
    completed: { dot: "bg-emerald-600", label: "Completed", icon: Check },
    failed: { dot: "bg-rose-700", label: "Failed", icon: AlertCircle },
  };
  const m = map[s] ?? { dot: "bg-ink-400", label: s, icon: Activity };
  const I = m.icon;
  return (
    <span className="badge">
      <I className="w-3 h-3 stroke-[1.75]" />
      {m.label}
    </span>
  );
}

function fmtMs(n: number) {
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    try {
      const { runs } = await Runs.list();
      setRuns(runs);
    } catch (err) {
      console.warn("Runs.list failed:", err);
      setRuns([]);
    }
  }
  useEffect(() => { reload(); }, []);

  async function toggle(id: string) {
    if (open === id) { setOpen(null); setDetail(null); return; }
    setOpen(id);
    setLoading(true);
    try {
      const d = await Runs.get(id);
      setDetail(d);
    } catch (err) {
      console.warn("Runs.get failed:", err);
      setDetail(null);
    } finally { setLoading(false); }
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="eyebrow">Telemetry</div>
          <h1 className="serif text-3xl text-ink-900">Execution logs</h1>
          <p className="text-sm text-ink-400 mt-1">
            Every agent run, with token usage, cost, and tool invocations.
          </p>
        </div>
        <button onClick={reload} className="btn btn-ghost">
          <Activity className="w-3.5 h-3.5 stroke-[1.75]" /> Refresh
        </button>
      </div>

      {runs.length === 0 && (
        <div className="text-sm text-ink-400 italic text-center py-16">
          No runs yet. Send a message in a chat to start one.
        </div>
      )}

      <div className="border border-line rounded bg-paper divide-y divide-line">
        {runs.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id}>
              <button
                onClick={() => toggle(r.id)}
                className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-paper-100 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge s={r.status} />
                    <span className="text-2xs text-ink-300 font-mono">{r.id.slice(0, 8)}</span>
                  </div>
                  <div className="text-sm text-ink-700 truncate">
                    {r.summary || `${r.status} run`}
                  </div>
                </div>
                <div className="flex items-center gap-5 text-2xs text-ink-400 font-mono shrink-0">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 stroke-[1.75]" />
                    {r.finishedAt ? fmtMs(r.finishedAt - r.startedAt) : "—"}
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 stroke-[1.75]" />
                    {r.totalTokens.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Coins className="w-3 h-3 stroke-[1.75]" />
                    ${(r.costCents / 100).toFixed(4)}
                  </div>
                  <div className="w-32 text-right">{new Date(r.startedAt).toLocaleString()}</div>
                </div>
              </button>
              {isOpen && (
                <div className="px-5 py-4 bg-paper-50 border-t border-line">
                  {loading && <div className="text-xs text-ink-400">Loading…</div>}
                  {detail && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-3 text-2xs">
                        <div>
                          <div className="text-ink-300 mb-0.5">Status</div>
                          <div className="text-ink-700 font-mono">{detail.run.status}</div>
                        </div>
                        <div>
                          <div className="text-ink-300 mb-0.5">Tokens</div>
                          <div className="text-ink-700 font-mono">{detail.run.totalTokens}</div>
                        </div>
                        <div>
                          <div className="text-ink-300 mb-0.5">Cost</div>
                          <div className="text-ink-700 font-mono">${(detail.run.costCents / 100).toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-ink-300 mb-0.5">Duration</div>
                          <div className="text-ink-700 font-mono">
                            {detail.run.finishedAt ? fmtMs(detail.run.finishedAt - detail.run.startedAt) : "—"}
                          </div>
                        </div>
                      </div>
                      {(detail.invocations ?? []).map((t: any) => (
                        <div key={t.id} className="px-3 py-2 text-2xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-ink-700">{t.toolName}</span>
                            <span className="text-ink-300 font-mono">{t.durationMs}ms · {t.status}</span>
                          </div>
                          <pre className="bg-paper-100 p-2 rounded text-2xs overflow-x-auto max-h-32">
                            {JSON.stringify(t.arguments, null, 2)}
                          </pre>
                          {t.result !== null && t.result !== undefined && (
                            <pre className="bg-paper-100 p-2 rounded text-2xs overflow-x-auto max-h-32 mt-1">
                              {typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
