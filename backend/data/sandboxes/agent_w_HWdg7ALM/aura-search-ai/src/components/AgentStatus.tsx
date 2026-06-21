"use client";

import type { AgentState } from "@/lib/types";

interface AgentStatusProps {
  state: AgentState;
}

const stateLabels: Record<AgentState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  searching: "Searching",
  reading: "Reading",
  speaking: "Speaking",
  waiting: "Awaiting confirmation",
  error: "Error",
};

export default function AgentStatus({ state }: AgentStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-aura-surface/60 border border-aura-border/40">
      <span className={`status-dot ${state}`} />
      <span className="text-xs text-aura-muted font-medium hidden sm:inline">
        {stateLabels[state]}
      </span>
    </div>
  );
}
