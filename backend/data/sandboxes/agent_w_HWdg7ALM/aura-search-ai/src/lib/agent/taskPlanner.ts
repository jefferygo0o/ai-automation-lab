// ==========================================
// Task Planner — Multi-Step Action Planning
// Phase 3: Break complex requests into executable steps.
// ==========================================

import type { Source, RiskLevel } from "@/lib/types";

export type StepType =
  | "search"
  | "navigate"
  | "read"
  | "extract"
  | "click"
  | "fill"
  | "summarize"
  | "screenshot"
  | "think";

export interface PlanStep {
  id: string;
  type: StepType;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  riskLevel: RiskLevel;
}

export interface TaskPlan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: "pending" | "running" | "completed" | "failed";
  currentStepIndex: number;
  sources: Source[];
  createdAt: number;
}

/**
 * Parse a user request and generate a task plan with steps.
 * Uses rule-based decomposition (in Phase 4, this could use an LLM).
 */
export function generatePlan(message: string): TaskPlan {
  const lower = message.toLowerCase();
  const steps: PlanStep[] = [];
  let stepId = 0;

  const addStep = (
    type: StepType,
    description: string,
    riskLevel: RiskLevel = "low",
    input?: Record<string, any>
  ) => {
    steps.push({
      id: `step_${stepId++}`,
      type,
      description,
      status: "pending",
      riskLevel,
      input,
    });
  };

  // Detect what the user wants and build steps

  // Pattern: "find X on Y website" or "go to Y and find X"
  if (
    lower.includes("find") ||
    lower.includes("look") ||
    lower.includes("search for") ||
    lower.includes("check")
  ) {
    // Search first, then potentially navigate
    addStep("search", `Search for information about "${message}"`, "low", {
      query: message,
    });

    // If a specific website is mentioned, navigate there
    const websitePattern =
      /(?:on|at|from|visit|go to|open)\s+([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const websiteMatch = message.match(websitePattern);
    if (websiteMatch) {
      let siteUrl = websiteMatch[1];
      if (!siteUrl.startsWith("http")) {
        siteUrl = `https://${siteUrl}`;
      }
      addStep("navigate", `Navigate to ${siteUrl}`, "medium", { url: siteUrl });
      addStep("read", `Read content from ${siteUrl}`, "low");
    }

    addStep("summarize", "Summarize findings", "low");
  }

  // Pattern: "compare X and Y"
  else if (
    lower.includes("compare") ||
    lower.includes("vs") ||
    lower.includes("versus")
  ) {
    addStep("search", `Search for comparison: "${message}"`, "low", {
      query: message,
    });
    addStep("read", "Read top result for details", "low");
    addStep("summarize", "Summarize comparison", "low");
  }

  // Pattern: "go to URL and do X"
  else if (lower.includes("go to") || lower.includes("open ")) {
    const urlPattern =
      /(?:go to|open|navigate to|visit)\s+(https?:\/\/[^\s]+|[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\S*)/i;
    const urlMatch = message.match(urlPattern);
    let url = urlMatch?.[1] || "";

    if (url && !url.startsWith("http")) {
      url = `https://${url}`;
    }

    if (url) {
      addStep("navigate", `Navigate to ${url}`, "medium", { url });

      // Check if they want to do something specific on the page
      if (lower.includes("screenshot") || lower.includes("capture")) {
        addStep("screenshot", "Take a screenshot", "medium");
      } else if (lower.includes("click")) {
        addStep("read", "Read page content", "low");
        addStep("summarize", "Summarize what I see", "low");
      } else {
        addStep("read", "Read page content", "low");
        addStep("summarize", "Summarize the page", "low");
      }
    } else {
      addStep("search", `Search for "${message}"`, "low", { query: message });
      addStep("summarize", "Summarize findings", "low");
    }
  }

  // Pattern: "read/summarize URL"
  else if (
    (lower.includes("read") || lower.includes("summarize") || lower.includes("check out")) &&
    /https?:\/\/[^\s]+/.test(message)
  ) {
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      addStep("navigate", `Navigate to ${urlMatch[0]}`, "medium", {
        url: urlMatch[0],
      });
      addStep("read", "Read page content", "low");
      addStep("summarize", "Summarize the page", "low");
    } else {
      addStep("search", `Search for "${message}"`, "low", { query: message });
    }
  }

  // Default: single search step
  else {
    addStep("search", `Search for "${message}"`, "low", { query: message });
  }

  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: `Plan: ${message.slice(0, 60)}${message.length > 60 ? "..." : ""}`,
    steps,
    status: "pending",
    currentStepIndex: 0,
    sources: [],
    createdAt: Date.now(),
  };
}

/**
 * Execute a task plan step by step, calling a callback after each step.
 * This is a simplified executor — the actual execution happens in the
 * orchestrator using the tool system.
 */
export async function executePlan(
  plan: TaskPlan,
  stepExecutor: (
    step: PlanStep,
    plan: TaskPlan
  ) => Promise<{ output?: Record<string, any>; sources?: Source[]; error?: string }>
): Promise<TaskPlan> {
  plan.status = "running";

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    plan.currentStepIndex = i;
    step.status = "running";

    try {
      const result = await stepExecutor(step, plan);

      if (result.error) {
        step.status = "failed";
        step.error = result.error;
        plan.status = "failed";
        return plan;
      }

      step.status = "completed";
      step.output = result.output || {};

      if (result.sources) {
        plan.sources.push(...result.sources);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Step failed";
      step.status = "failed";
      step.error = msg;
      plan.status = "failed";
      return plan;
    }
  }

  plan.status = "completed";
  return plan;
}

/**
 * Generate a human-readable summary of a task plan for the user.
 */
export function formatPlanForUser(plan: TaskPlan): string {
  if (plan.steps.length === 0) {
    return "No steps planned.";
  }

  const statusIcons: Record<string, string> = {
    pending: "⬜",
    running: "🔄",
    completed: "✅",
    failed: "❌",
    skipped: "⏭️",
  };

  let output = `**📋 ${plan.title}**\n\n`;
  output += `**Steps:**\n`;

  for (const step of plan.steps) {
    const icon = statusIcons[step.status] || "⬜";
    output += `\n${icon} **${step.description}**`;
    if (step.status === "running") output += ` _(in progress...)_`;
    if (step.status === "completed") output += ` ✓`;
    if (step.status === "failed") output += ` — ❌ ${step.error || "Failed"}`;
  }

  output += `\n\n**Status:** ${plan.status === "completed" ? "✅ Complete!" : plan.status === "running" ? "🔄 In progress..." : plan.status === "failed" ? "❌ Failed" : "⏳ Pending"}`;

  if (plan.sources.length > 0) {
    output += `\n\n**Sources:**`;
    plan.sources.slice(0, 5).forEach((s, i) => {
      output += `\n[${i + 1}] ${s.title} — ${s.url}`;
    });
  }

  return output;
}
