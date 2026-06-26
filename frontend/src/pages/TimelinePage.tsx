import { useEffect, useState, useCallback } from "react";
import {
  History, FileText, Play, Check, AlertCircle, Loader2,
  Clock, ArrowLeft, Download, RotateCcw, ChevronDown,
  ChevronRight, Trash2, Sparkles,
} from "lucide-react";
import { Timeline, type TimelineEvent, Runs, HistoryStore } from "../api";

function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function typeIcon(type: string) {
  switch (type) {
    case "snapshot": return <Download className="w-3.5 h-3.5 stroke-[1.75]" />;
    case "file_change": return <FileText className="w-3.5 h-3.5 stroke-[1.75]" />;
    case "run": return <Play className="w-3.5 h-3.5 stroke-[1.75]" />;
    default: return <Clock className="w-3.5 h-3.5 stroke-[1.75]" />;
  }
}

function typeColor(type: string) {
  switch (type) {
    case "snapshot": return "text-indigo-700 bg-indigo-100";
    case "file_change": return "text-clay-700 bg-clay-100";
    case "run": return "text-emerald-700 bg-emerald-100";
    default: return "text-ink-400 bg-paper-200";
  }
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [diffData, setDiffData] = useState<any>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Timeline.list(100);
      setEvents(res.timeline ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load timeline");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSelect(ev: TimelineEvent) {
    setSelectedEvent(ev);
    setDiffData(null);

    if (ev.type === "file_change" && ev.versionId) {
      setDiffLoading(true);
      try {
        // Fetch content for this version
        const res = await HistoryStore.get(ev.versionId);
        setDiffData(res);
      } catch { }
      setDiffLoading(false);
    }
  }

  async function handleRestore(snapshotId: string) {
    if (!confirm("Restore this snapshot? Current files will be replaced from the archive.")) return;
    setRestoring(snapshotId);
    try {
      const res = await fetch(`/api/snapshots/${snapshotId}/restore`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        alert(`Restored ${data.filesWritten} files.`);
        load();
      } else {
        alert(`Restore failed: ${data.error ?? "unknown error"}`);
      }
    } catch (err: any) {
      alert(`Restore failed: ${err?.message ?? "network error"}`);
    } finally {
      setRestoring(null);
    }
  }

  async function handleCreateSnapshot() {
    const agentId = prompt("Agent ID to snapshot (leave blank for all with changes):");
    if (agentId === null) return;
    try {
      if (agentId.trim()) {
        await fetch(`/api/agents/${agentId.trim()}/snapshot`, { method: "POST" });
        alert("Snapshot created.");
        load();
      } else {
        alert("Enter an agent ID.");
      }
    } catch (err: any) {
      alert(`Snapshot failed: ${err?.message ?? "unknown"}`);
    }
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="eyebrow">History</div>
          <h1 className="serif text-3xl text-ink-900">Time Travel</h1>
          <p className="text-sm text-ink-400 mt-1">
            Browse file changes, runs, and snapshots. Restore any point in time.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCreateSnapshot} className="btn btn-sm btn-ghost">
            <Download className="w-3.5 h-3.5 stroke-[1.75]" />
            Snapshot
          </button>
          <button onClick={load} className="btn btn-sm btn-ghost">
            <RotateCcw className="w-3.5 h-3.5 stroke-[1.75]" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex gap-6 min-h-0">
        {/* Timeline list */}
        <div className={`flex flex-col gap-px ${selectedEvent ? "w-1/2" : "w-full"}`}>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-ink-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading timeline...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20 text-ink-400 italic">
              <History className="w-8 h-8 mx-auto mb-3 stroke-[1.5] text-ink-300" />
              <p>No timeline events yet.</p>
              <p className="text-xs mt-1">Events appear as you chat with agents and edit files.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((ev, i) => (
                <button
                  key={`${ev.type}-${ev.versionId ?? ev.runId ?? ev.snapshotId ?? i}`}
                  onClick={() => handleSelect(ev)}
                  className={`w-full text-left px-3 py-2.5 rounded border transition-colors ${
                    selectedEvent === ev
                      ? "border-clay-400 bg-clay-50"
                      : "border-transparent hover:bg-paper-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`p-1 rounded ${typeColor(ev.type)}`}>
                      {typeIcon(ev.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 truncate">
                        {ev.type === "snapshot" && `Snapshot (${ev.fileCount ?? 0} files, ${fmtBytes(ev.byteSize ?? 0)})`}
                        {ev.type === "file_change" && `Edited ${ev.filename ?? "file"}`}
                        {ev.type === "run" && `Run ${ev.status ?? "completed"}`}
                      </div>
                      <div className="text-2xs text-ink-400 mt-0.5">
                        {fmtDate(ev.createdAt)}
                        {ev.agentId && <span className="ml-2 font-mono">{ev.agentId}</span>}
                      </div>
                    </div>
                    {ev.type === "snapshot" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRestore(ev.snapshotId!); }}
                        disabled={restoring === ev.snapshotId}
                        className="btn btn-ghost btn-icon text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 shrink-0"
                        title="Restore this snapshot"
                      >
                        {restoring === ev.snapshotId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin stroke-[1.75]" />
                          : <RotateCcw className="w-3.5 h-3.5 stroke-[1.75]" />
                        }
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedEvent && (
          <div className="w-1/2 border-l border-line pl-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg serif text-ink-900">
                {selectedEvent.type === "snapshot" && "Snapshot Details"}
                {selectedEvent.type === "file_change" && "File Version"}
                {selectedEvent.type === "run" && "Run Details"}
              </h2>
              <button
                onClick={() => { setSelectedEvent(null); setDiffData(null); }}
                className="btn btn-ghost btn-icon"
              >
                <ChevronRight className="w-4 h-4 stroke-[1.5]" />
              </button>
            </div>

            {selectedEvent.type === "snapshot" && (
              <div className="space-y-3">
                <div className="text-sm text-ink-700">
                  <div className="font-mono text-2xs text-ink-400">{selectedEvent.snapshotId}</div>
                  <div className="mt-2">Trigger: <span className="font-medium">{selectedEvent.trigger ?? "manual"}</span></div>
                  <div>Files: <span className="font-medium">{selectedEvent.fileCount ?? 0}</span></div>
                  <div>Size: <span className="font-medium">{fmtBytes(selectedEvent.byteSize ?? 0)}</span></div>
                  <div>Date: <span className="font-medium">{fmtDate(selectedEvent.createdAt)}</span></div>
                  <div className="mt-1 text-2xs text-ink-400 font-mono">{selectedEvent.agentId}</div>
                </div>
                <button
                  onClick={() => handleRestore(selectedEvent.snapshotId!)}
                  disabled={restoring === selectedEvent.snapshotId}
                  className="btn btn-primary w-full"
                >
                  {restoring === selectedEvent.snapshotId ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin stroke-[1.75]" /> Restoring...</>
                  ) : (
                    <><RotateCcw className="w-3.5 h-3.5 stroke-[1.75]" /> Restore This Snapshot</>
                  )}
                </button>
              </div>
            )}

            {selectedEvent.type === "file_change" && (
              <div className="space-y-3">
                <div className="text-sm text-ink-700">
                  <div>File: <span className="font-medium font-mono">{selectedEvent.filename ?? "unknown"}</span></div>
                  <div>Date: <span className="font-medium">{fmtDate(selectedEvent.createdAt)}</span></div>
                  <div className="mt-1 text-2xs text-ink-400 font-mono">{selectedEvent.agentId}</div>
                </div>
                {diffLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading content...
                  </div>
                ) : diffData ? (
                  <div className="border border-line rounded bg-paper">
                    <div className="px-3 py-2 border-b border-line text-2xs font-medium text-ink-500 uppercase tracking-wider">
                      Content at this version
                    </div>
                    <pre className="p-3 text-xs font-mono text-ink-800 overflow-auto max-h-60 whitespace-pre-wrap">
                      {diffData.content?.slice(0, 2000) || "(empty)"}
                    </pre>
                  </div>
                ) : (
                  <div className="text-sm text-ink-400 italic">No content available</div>
                )}
              </div>
            )}

            {selectedEvent.type === "run" && (
              <div className="space-y-3">
                <div className="text-sm text-ink-700">
                  <div>Status: <span className="font-medium">{selectedEvent.status ?? "unknown"}</span></div>
                  <div>Tokens: <span className="font-medium">{selectedEvent.totalTokens ?? 0}</span></div>
                  <div>Date: <span className="font-medium">{fmtDate(selectedEvent.createdAt)}</span></div>
                  <div className="mt-1 text-2xs text-ink-400 font-mono">
                    {selectedEvent.agentId}:{selectedEvent.runId}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
