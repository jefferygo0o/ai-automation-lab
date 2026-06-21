// ==========================================
// Permission & Risk Classification System
// ==========================================

import { RiskLevel } from "@/lib/types";

/**
 * Action categories with their risk levels.
 */
const actionRiskMap: Record<string, RiskLevel> = {
  // LOW RISK - automatic
  search: "low",
  webSearch: "low",
  fetchWebpage: "low",
  summarizePage: "low",
  calculator: "low",
  compare: "low",
  explain: "low",
  read: "low",
  draft: "low",
  "get-weather": "low",
  "get-news": "low",
  "get-time": "low",

  // MEDIUM RISK - ask for confirmation
  "fill-form": "medium",
  "draft-email": "medium",
  "prepare-message": "medium",
  navigate: "medium",
  "save-preference": "medium",
  "compare-products": "medium",
  "create-account-draft": "medium",

  // HIGH RISK - require explicit confirmation
  "send-email": "high",
  "send-message": "high",
  purchase: "high",
  book: "high",
  reserve: "high",
  "change-settings": "high",
  "upload-file": "high",
  "download-file": "high",
  "submit-form": "high",
  "share-data": "high",
  "delete-account": "high",
  "browser-automation": "high",
  browserAutomation: "high",
};

// Actions that are never allowed
const NEVER_ALLOWED = [
  "bypass-paywall",
  "bypass-captcha",
  "crack-password",
  "hack",
  "phish",
  "scrape-private",
  "access-login",
  "impersonate",
];

/**
 * Classify an action's risk level based on its name/description.
 */
export function classifyRisk(
  action: string,
  description?: string
): RiskLevel {
  const lower =
    (action + " " + (description || "")).toLowerCase().trim();

  // Check if it's in the never-allowed list
  for (const forbidden of NEVER_ALLOWED) {
    if (lower.includes(forbidden)) {
      return "high";
    }
  }

  // Check action risk map
  for (const [key, risk] of Object.entries(actionRiskMap)) {
    if (lower.includes(key)) {
      return risk;
    }
  }

  // Default to medium if uncertain
  return "medium";
}

/**
 * Determine if an action can be executed automatically.
 */
export function canAutoExecute(riskLevel: RiskLevel): boolean {
  return riskLevel === "low";
}

/**
 * Determine if confirmation is needed for an action.
 */
export function needsConfirmation(riskLevel: RiskLevel): boolean {
  return riskLevel === "medium" || riskLevel === "high";
}

/**
 * Check if an action is never allowed.
 */
export function isNeverAllowed(action: string): boolean {
  const lower = action.toLowerCase();
  return NEVER_ALLOWED.some((forbidden) => lower.includes(forbidden));
}

/**
 * Generate a description of why action is classified at a given risk level.
 */
export function getRiskExplanation(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "low":
      return "This is a low-risk action that can be performed automatically.";
    case "medium":
      return "This is a medium-risk action. Please confirm before I proceed.";
    case "high":
      return "This is a high-risk action. I require your explicit confirmation before proceeding.";
  }
}
