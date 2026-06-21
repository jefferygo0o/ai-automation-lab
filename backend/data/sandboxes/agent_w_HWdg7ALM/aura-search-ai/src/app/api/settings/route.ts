// ==========================================
// Settings API Route
// GET /api/settings — Returns current configuration status
// POST /api/settings — Updates runtime settings (not persisted across restarts)
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { config, validateConfig } from "@/lib/utils/env";

export async function GET() {
  const warnings = validateConfig();

  return NextResponse.json({
    llm: {
      activeProvider: config.activeLlmProvider,
      ollamaBaseUrl: config.ollamaBaseUrl ? config.ollamaBaseUrl.replace(/\/\/.*@/, "//***@") : null,
      ollamaModel: config.ollamaModel,
      openaiModel: config.openaiApiKey ? (config.openaiModel || "gpt-3.5-turbo") : null,
      geminiConfigured: !!config.geminiApiKey,
    },
    search: {
      activeProvider: config.activeSearchProvider,
      braveConfigured: !!config.braveApiKey,
      tavilyConfigured: !!config.tavilyApiKey,
      searxngConfigured: !!config.searxngBaseUrl,
    },
    features: {
      memoryEnabled: config.memoryEnabled,
      browserAutomationEnabled: config.enableBrowserAutomation,
    },
    warnings,
  });
}

export async function POST() {
  return NextResponse.json({
    message:
      "Server-side settings are configured via environment variables (.env.local). User preferences are stored in the browser (localStorage).",
  });
}
