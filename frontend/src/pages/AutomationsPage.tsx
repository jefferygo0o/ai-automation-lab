import { useState, useEffect, useCallback } from "react";
import { Automations, type Automation } from "../api";
import {
  Timer, Plus, Trash2, Play, Pause,
  AlertCircle, RefreshCw, Clock, History,
} from "lucide-react";

function rruleDescription(rrule: string): string {
  if (rrule.startsWith("FREQ=DAILY")) return "Daily";
  if (rrule.startsWith("FREQ=WEEKLY")) return "Weekly";
  if (rrule.startsWith("FREQ=MONTHLY")) return "Monthly";
  if (rrule.startsWith("FREQ=HOURLY")) return "Hourly";
  if (rrule.startsWith("FREQ=MINUTELY")) return "Every " + rrule.match(/INTERVAL=(\d+)/)?.[1] + " min" || "Frequent";
  return rrule;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRrule, setNewRrule] = useState("FREQ=DAILY;INTERVAL=1");
  const [newInstruction, setNewInstruction] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

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

  const fetchAgents = useCallback(async () => {
    try {
      const { Agents } = await import("../api");
      const res = await (Agents as any).list();
      setAgents(res.agents || []);
    } catch {}
  }, []);

  useEffect(() => { fetchAutomations(); fetchAgents(); }, [fetchAutomations, fetchAgents]);

  const handleCreate = async () => {
    if (!newName || !newInstruction) return;
    setSaving(true);
    try {
      const auto = await Automations.create(newName, newRrule, newInstruction, newAgentId || undefined);
      setAutomations((prev) => [...prev, auto]);
      setShowNew(false);
      setNewName(""); setNewInstruction(""); setNewAgentId("");
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
      const updated = await Automations.update(auto.id, { active: !auto.active });
      setAutomations((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    } catch (e: any) {
      setError(e.message || "Failed to update");
    }
  };

  const showHistory = async (id: string) => {
    if (historyFor === id) { setHistoryFor(null); return; }
    setHistoryFor(id);
    try {
      const res = await Automations.history(id);
      setHistory(res.runs || []);
    } catch { setHistory([]); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-ink-400" />
          <span className="text-sm font-medium text-ink-900">
            Automations {automations.length > 0 && <span className="text-ink-400 font-normal">({automations.length})</span>}
          </span>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="btn btn-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Automation</span>
        </button>
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
                <option value="FREQ=HOURLY;INTERVAL=1">Every hour</option>
                <option value="FREQ=DAILY;INTERVAL=1">Every day</option>
                <option value="FREQ=DAILY;INTERVAL=1;BYDAY=MON,TUE,WED,THU,FRI">Weekdays</option>
                <option value="FREQ=WEEKLY;INTERVAL=1">Weekly</option>
                <option value="FREQ=MONTHLY;INTERVAL=1">Monthly</option>
                <option value="FREQ=MINUTELY;INTERVAL=15">Every 15 min</option>
                <option value="FREQ=MINUTELY;INTERVAL=30">Every 30 min</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Agent (optional)</label>
            <select value={newAgentId} onChange={(e) => setNewAgentId(e.target.value)} className="input">
              <option value="">Default agent</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Instruction</label>
            <textarea
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="What should this automation do?"
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
            {automations.map((auto) => (
              <div key={auto.id} className="card">
                <div className="card-header">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggle(auto)}
                      className={`btn btn-icon ${auto.active ? "text-ok" : "text-ink-400"}`}
                      title={auto.active ? "Pause" : "Activate"}
                    >
                      {auto.active ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                    <div>
                      <div className="text-sm font-medium text-ink-900">{auto.name}</div>
                      <div className="text-2xs text-ink-400 mt-0.5 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {rruleDescription(auto.rrule)}
                        <span className={`dot ${auto.active ? "dot-ok" : "dot-mute"}`} />
                        {auto.active ? "Active" : "Paused"}
                        {auto.agentId && <><span>·</span>Agent: {auto.agentId.slice(0, 8)}</>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                      <div className="px-4 pb-3 space-y-1">
                        {history.map((run: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-ink-500">
                            <span className={`dot ${run.status === "completed" ? "dot-ok" : run.status === "running" ? "dot-warn" : "dot-err"}`} />
                            <span className="font-mono text-2xs">{new Date(run.startedAt).toLocaleString()}</span>
                            <span className="text-2xs text-ink-400">{run.status}</span>
                            {run.errorMessage && <span className="text-err text-2xs">{run.errorMessage}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
