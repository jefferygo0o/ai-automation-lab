// ==========================================
// Risk Classifier - Determines risk level of user requests
// ==========================================

import type { RiskLevel } from "@/lib/types";

const HIGH_RISK_KEYWORDS = [
  "send email", "send message", "post", "publish",
  "purchase", "buy", "order", "checkout",
  "booking", "book", "reserve", "hotel", "flight", "restaurant",
  "change password", "change account", "update profile",
  "upload", "download file", "download",
  "transfer", "pay", "payment", "billing",
  "delete", "remove", "destroy",
  "login", "sign in", "authenticate",
  "personal information", "share my", "private",
  "medical", "doctor", "prescription", "diagnosis",
  "legal", "lawyer", "contract", "agreement",
  "financial", "bank", "credit card", "social security",
];

const MEDIUM_RISK_KEYWORDS = [
  "fill form", "fill out", "complete form",
  "draft email", "draft message",
  "save preference", "save setting", "remember",
  "navigate", "go to page", "open page",
  "schedule", "remind", "set reminder",
  "compare", "analyze",
  "prepare", "generate",
];

export function classifyRiskFromMessage(message: string): RiskLevel {
  const lower = message.toLowerCase();

  // Check high risk first
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (lower.includes(keyword)) {
      return "high";
    }
  }

  // Check medium risk
  for (const keyword of MEDIUM_RISK_KEYWORDS) {
    if (lower.includes(keyword)) {
      return "medium";
    }
  }

  return "low";
}

export function needsConfirmation(riskLevel: RiskLevel): boolean {
  return riskLevel === "medium" || riskLevel === "high";
}

export function getConfirmationMessage(riskLevel: RiskLevel, action: string): string {
  switch (riskLevel) {
    case "medium":
      return `I'd like to proceed with: "${action}". This is a medium-risk action — please confirm before I continue.`;
    case "high":
      return `⚠️ **High-risk action detected**: "${action}". I need your explicit confirmation before I can proceed. Please review carefully.`;
    default:
      return `Please confirm: ${action}`;
  }
}
