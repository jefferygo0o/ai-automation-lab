// ==========================================
// Action Logger
// Keeps a log of all planned and executed actions for transparency.
// ==========================================

import { RiskLevel } from "@/lib/types";

interface LogEntry {
  id: string;
  timestamp: number;
  action: string;
  description: string;
  riskLevel: RiskLevel;
  status: "planned" | "executing" | "completed" | "failed" | "cancelled" | "pending-approval";
  details?: Record<string, any>;
  error?: string;
}

class ActionLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  /**
   * Log a planned action.
   */
  plan(action: string, description: string, riskLevel: RiskLevel, details?: Record<string, any>): string {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.logs.push({
      id,
      timestamp: Date.now(),
      action,
      description,
      riskLevel,
      status: "planned",
      details,
    });
    this.trim();
    return id;
  }

  /**
   * Mark an action as executing.
   */
  executing(id: string): void {
    const entry = this.logs.find((l) => l.id === id);
    if (entry) entry.status = "executing";
  }

  /**
   * Mark an action as completed.
   */
  complete(id: string, result?: any): void {
    const entry = this.logs.find((l) => l.id === id);
    if (entry) {
      entry.status = "completed";
      if (result) entry.details = { ...entry.details, result };
    }
  }

  /**
   * Mark an action as failed.
   */
  fail(id: string, error: string): void {
    const entry = this.logs.find((l) => l.id === id);
    if (entry) {
      entry.status = "failed";
      entry.error = error;
    }
  }

  /**
   * Mark an action as cancelled.
   */
  cancel(id: string): void {
    const entry = this.logs.find((l) => l.id === id);
    if (entry) entry.status = "cancelled";
  }

  /**
   * Mark an action as pending approval.
   */
  pendingApproval(id: string): void {
    const entry = this.logs.find((l) => l.id === id);
    if (entry) entry.status = "pending-approval";
  }

  /**
   * Get recent logs.
   */
  getRecent(count: number = 10): LogEntry[] {
    return [...this.logs]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * Get all logs.
   */
  getAll(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear logs.
   */
  clear(): void {
    this.logs = [];
  }

  private trim(): void {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }
}

export const actionLogger = new ActionLogger();
