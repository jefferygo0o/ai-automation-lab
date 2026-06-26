import { useEffect, useState } from "react";
import {
  Bot, MessagesSquare, MessageSquare, Play, Sparkles,
  Brain, Wrench, Timer, Globe, AlertCircle, Clock,
  TrendingUp, Loader2, BarChart3, Activity,
} from "lucide-react";
import { Dashboard as DashboardApi, type DashboardStats } from "../api";

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    DashboardApi.get()
      .then((data) => { setStats(data); setLoading(false); })
      .catch((e) => { setError(e?.message ?? "failed to load dashboard"); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-5 h-5 animate-spin text-ink-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="border border-rose-300 bg-rose-50 rounded px-4 py-3 text-sm text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  const { counts, usage } = stats!;

  const statCards = [
    { label: "Agents", value: counts.agents, icon: Bot, color: "text-indigo-600 bg-indigo-100" },
    { label: "Chats", value: counts.chats, icon: MessagesSquare, color: "text-sky-600 bg-sky-100" },
    { label: "Messages", value: counts.messages, icon: MessageSquare, color: "text-teal-600 bg-teal-100" },
    { label: "Runs", value: counts.runs, icon: Play, color: "text-emerald-600 bg-emerald-100" },
    { label: "Skills", value: counts.skills, icon: Sparkles, color: "text-violet-600 bg-violet-100" },
    { label: "MCP Servers", value: counts.mcpServers, icon: Wrench, color: "text-amber-600 bg-amber-100" },
    { label: "Automations", value: counts.automations, icon: Timer, color: "text-cyan-600 bg-cyan-100" },
    { label: "Webhooks", value: counts.webhooks, icon: Globe, color: "text-orange-600 bg-orange-100" },
    { label: "Pending Approvals", value: counts.pendingApprovals, icon: AlertCircle, color: "text-rose-600 bg-rose-100" },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="eyebrow">Overview</div>
        <h1 className="serif text-3xl text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-400 mt-1">
          Aggregate stats across all your agents, chats, and runs.
        </p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="border border-line rounded bg-paper p-4 flex flex-col gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="w-4 h-4 stroke-[1.75]" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink-900 tabular-nums">
                {fmtNumber(value)}
              </div>
              <div className="text-xs text-ink-400 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Usage section */}
      <div className="border border-line rounded bg-paper p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 stroke-[1.75] text-ink-700" />
          <h2 className="text-sm font-semibold text-ink-900">Usage (24h)</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-line rounded bg-paper-50 p-3">
            <div className="text-xs text-ink-400 uppercase tracking-wider mb-1">Total Tokens</div>
            <div className="text-lg font-semibold text-ink-900 tabular-nums">
              {fmtTokens(usage.totalTokens)}
            </div>
          </div>
          <div className="border border-line rounded bg-paper-50 p-3">
            <div className="text-xs text-ink-400 uppercase tracking-wider mb-1">Runs (24h)</div>
            <div className="text-lg font-semibold text-ink-900 tabular-nums">
              {usage.recentRuns}
            </div>
          </div>
          <div className="border border-line rounded bg-paper-50 p-3">
            <div className="text-xs text-ink-400 uppercase tracking-wider mb-1">Failed (24h)</div>
            <div className="text-lg font-semibold text-ink-900 tabular-nums">
              {usage.failedLast24h}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
