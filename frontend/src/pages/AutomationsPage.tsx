import { useState, useEffect, useCallback, useRef } from "react";
import { Automations, type Automation, type AutomationRun } from "../api";
import {
  Timer, Plus, Trash2, Play, Pause,
  AlertCircle, Clock, History, Zap, Activity, RefreshCw,
} from "lucide-react";

function rruleDescription(rrule: string): string {
  if (!rrule) return "—";
  if (rrule.startsWith("FREQ=DAILY")) return "Daily";
  if (rrule.startsWith("FREQ=WEEKLY")) return "Weekly";
  if (rrule.startsWith("FREQ=MONTHLY")) return "Monthly";
  if (rrule.startsWith("FREQ=HOURLY")) return "Hourly";
  if (rrule.startsWith("FREQ=MINUTELY")) {
    const m = rrule.match(/INTERVAL=(\\d+)/);
    return m ? `Every ${m[1]} min` : "Every minute";
  }
  return rrule;
}

function fmtRelative(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface SchedulerStats {
  started: boolean;
  tickMs: number;
  lastTickAt: number | null;
  lastTickDurationMs: number | null;
  inFlight: string[];
  totalFires: number;
  totalFailures: number;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRrule, setNewRrule] = useState("FREQ=HOURLY;INTERVAL=1");
  const [newInstruction, setNewInstruction] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<AutomationRun[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerStats | null>(null);
  const [dueMap, setDueMap] = useState<Record<string, number>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Automations.list();
      setAutomations(res.automations);
    } catch (e: any) {
      setError(e.message || "Failed to load automations");
    }
    setLoading(false);
  }, []);

  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/scheduler/status", {
        headers: { Authorization: `Bearer ${localStorage.getItem("lab.token") ?? ""}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setScheduler(data.scheduler?.stats ?? null);
      const map: Record<string, number> = {};
      for (const a of data.automations ?? []) map[a.id] = a.due_in_ms ?? 0;
      setDueMap(map);
    } catch {}
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const { Agents } = await import("../api");
      const res = await (Agents as any).list();
      setAgents(res.agents || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAutomations();
    fetchSchedulerStatus();
    fetchAgents();
  }, [fetchAutomations, fetchSchedulerStatus, fetchAgents]);

  // Live ticker — re-fetch status every 10s, re-render "next run in" every 1s.
  useEffect(() => {
    const i = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    tickRef.current = i as unknown as number;
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      fetchSchedulerStatus();
    }, 10_000);
    return () => clearInterval(i);
  }, [fetchSchedulerStatus]);

  const handleCreate = async () => {
    if (!newName || !newInstruction) return;
    setSaving(true);
    try {
      // API signature: create(name, instruction, rrule, description, agentId)
      const auto = await Automations.create(newName, newInstruction, newRrule, "", newAgentId || null);
      setAutomations((prev) => [auto as unknown as Automation, ...prev]);
      setShowNew(false);
      setNewName(""); setNewInstruction(""); setNewAgentId("");
      fetchSchedulerStatus();
    } catch (e: any) {
      setError(e.message || "Failed to create");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this automation?")) return;
    try {
      await Automations.delete(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const handleToggle = async (auto: Automation) => {
    try {
      const updated = await Automations.update(auto.id, { enabled: !auto.active });
      setAutomations((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    } catch (e: any) {
      setError(e.message || "Failed to update");
    }
  };

  const showHistory = async (id: string) => {
    if (historyFor === id) { setHistoryFor(null); return; }
    setHistoryFor(id);
    try {
      const res = await Automations.runs(id, 50);
      setHistory(res.runs || []);
    } catch { setHistory([]); }
  };

  const runNow = async (id: string) => {
    setRunning((prev) => new Set(prev).add(id));
    try {
      const token = localStorage.getItem("lab.token") ?? "";
      const res = await fetch(`/api/automations/${id}/run-now`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Wait a moment then refresh history (and status to update last_run_at).
      setTimeout(async () => {
        await fetchAutomations();
        await fetchSchedulerStatus();
        if (historyFor === id) await showHistory(id);
      }, 1500);
    } catch (e: any) {
      setError(e.message || "Failed to trigger run");
    } finally {
      setRunning((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-ink-400" />
          <span className="text-sm font-medium text-ink-900">
            Automations {automations.length > 0 && <span className="text-ink-400 font-normal">({automations.length})</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Scheduler liveness badge */}
          <SchedulerBadge scheduler={scheduler} now={now} />
          <button onClick={() => setShowNew(!showNew)} className="btn btn-sm">
            <Plus className="w-3.5 h-3.5" />
            <span>New Automation</span>
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

      {showNew && (
        <div className="mx-4 mt-2 p-4 border border-line rounded-sm bg-paper-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Automation" className="input" />
            </div>
            <div>
              <label className="label">Schedule (RRULE)</label>
              <select value={newRrule} onChange={(e) => setNewRrule(e.target.value)} className="input">
                <option value="FREQ=MINUTELY;INTERVAL=15">Every 15 min</option>
                <option value="FREQ=MINUTELY;INTERVAL=30">Every 30 min</option>
                <option value="FREQ=HOURLY;INTERVAL=1">Every hour</option>
                <option value="FREQ=DAILY;INTERVAL=1">Every day</option>
                <option value="FREQ=WEEKLY;INTERVAL=1">Weekly</option>
                <option value="FREQ=MONTHLY;INTERVAL=1">Monthly</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Agent</label>
            <select value={newAgentId} onChange={(e) => setNewAgentId(e.target.value)} className="input">
              <option value="">Default agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Instruction</label>
            <textarea
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="What should this automation do? (sent to the agent as its user message)"
              className="input h-20"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !newName || !newInstruction} className="btn btn-primary">
              {saving ? "Creating..." : "Create Automation"}
            </button>
            <button onClick={() => setShowNew(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-xs text-ink-400">Loading automations...</div>
        ) : automations.length === 0 ? (
          <div className="text-xs text-ink-400 text-center mt-12">
            <Timer className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No automations yet.</p>
            <p className="mt-1 text-2xs">Create scheduled tasks that run your agents automatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {automations.map((auto) => {
              const dueMs = dueMap[auto.id] ?? null;
              const isRunning = running.has(auto.id);
              return (
                <div key={auto.id} className="card">
                  <div className="card-header">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => handleToggle(auto)}
                        className={`btn btn-icon ${auto.active ? "text-ok" : "text-ink-400"}`}
                        title={auto.active ? "Pause" : "Activate"}
                      >
                        {auto.active ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-900 truncate">{auto.name}</div>
                        <div className="text-2xs text-ink-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <Clock className="w-3 h-3" />
                          <span>{rruleDescription(auto.rrule)}</span>
                          <span>·</span>
                          <span className={`dot ${auto.active ? "dot-ok" : "dot-mute"}`} />
                          <span>{auto.active ? "Active" : "Paused"}</span>
                          {auto.active && dueMs !== null && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-2xs">
                                next: {fmtRelative(Math.max(0, dueMs - (Date.now() - now)))}
                              </span>
                            </>
                          )}
                          {auto.lastRunAt && (
                            <>
                              <span>·</span>
                              <span>last ran {new Date(auto.lastRunAt).toLocaleString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runNow(auto.id)}
                        disabled={isRunning}
                        className="btn btn-ghost btn-sm"
                        title="Trigger now (ignores schedule)"
                      >
                        {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        <span>{isRunning ? "Running..." : "Run now"}</span>
                      </button>
                      <button onClick={() => showHistory(auto.id)} className="btn btn-ghost btn-sm" title="Run history">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(auto.id)} className="btn btn-ghost btn-sm text-err" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <pre className="text-xs text-ink-500 whitespace-pre-wrap font-sans">{auto.instruction}</pre>
                  </div>
                  {historyFor === auto.id && (
                    <div className="border-t border-line">
                      <div className="px-4 py-2 text-2xs text-ink-400 uppercase tracking-widest font-medium">Run History</div>
                      {history.length === 0 ? (
                        <div className="px-4 pb-3 text-xs text-ink-400">No runs yet.</div>
                      ) : (
                        <div className="px-4 pb-3 space-y-1 max-h-64 overflow-auto">
                          {history.map((run) => (
                            <div key={run.id} className="border border-line rounded p-2 space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className={`dot ${run.status === "completed" ? "dot-ok" : run.status === "running" ? "dot-warn" : "dot-err"}`} />
                                <span className="font-mono text-2xs">{new Date(run.startedAt!).toLocaleString()}</span>
                                <span className="text-2xs text-ink-400">{run.status}</span>
                                {(run.finishedAt ?? run.finished_at) && (run.startedAt ?? run.started_at) && (
                                  <span className="text-2xs text-ink-400">
                                    ({Math.round((run.finishedAt - run.startedAt) / 100) / 10}s)
                                  </span>
                                )}
                              </div>
                              {run.output && (
                                <pre className="text-2xs text-ink-500 whitespace-pre-wrap font-mono bg-paper-50 p-2 rounded max-h-32 overflow-auto">{run.output.slice(0, 2000)}</pre>
                              )}
                              {run.error && (
                                <pre className="text-2xs text-err whitespace-pre-wrap font-mono bg-err/5 p-2 rounded">{run.error}</pre>
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
        )}
      </div>
    </div>
  );
}

function SchedulerBadge({ scheduler, now }: { scheduler: SchedulerStats | null; now: number }) {
  if (!scheduler) {
    return (
      <div className="flex items-center gap-1.5 text-2xs text-ink-400 font-mono">
        <Activity className="w-3 h-3" />
        <span>scheduler: …</span>
      </div>
    );
  }
  const lastTickAge = scheduler.lastTickAt ? Math.max(0, now - scheduler.lastTickAt) : null;
  const alive = scheduler.started && (lastTickAge === null || lastTickAge < scheduler.tickMs * 3);
  return (
    <div
      className={`flex items-center gap-1.5 text-2xs font-mono px-2 py-0.5 rounded-sm border ${
        alive
          ? "border-ok/30 bg-ok/5 text-ok"
          : "border-err/30 bg-err/5 text-err"
      }`}
      title={`scheduler: tick=${scheduler.tickMs}ms, fires=${scheduler.totalFires}, failures=${scheduler.totalFires}, last tick ${lastTickAge !== null ? `${Math.floor(lastTickAge / 1000)}s ago` : "never"}`}
    >
      <Activity className="w-3 h-3" />
      <span>scheduler: {alive ? "live" : "stalled"}</span>
      {scheduler.totalFires > 0 && <span>· {scheduler.totalFires} fires</span>}
      {scheduler.totalFailures > 0 && <span className="text-err">· {scheduler.totalFailures} fails</span>}
    </div>
  );
}