// ==========================================
// Agent API Route
// POST /api/agent
// Main endpoint for processing user messages.
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { processMessage } from "@/lib/agent/orchestrator";
import { validateConfig } from "@/lib/utils/env";

export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const warnings = validateConfig();
    if (warnings.length > 0) {
      console.warn("Config warnings:", warnings);
    }

    // Parse request body
    const body = await request.json().catch(() => null);

    if (!body || !body.message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const { message, history, confirmationId, confirmed } = body;

    // Validate message length
    if (message.length > 4000) {
      return NextResponse.json(
        { error: "Message too long (max 4000 characters)" },
        { status: 400 }
      );
    }

    // Process through agent orchestrator
    const response = await processMessage({
      message,
      history: history || [],
      confirmationId,
      confirmed,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Agent API error:", error);

    return NextResponse.json(
      {
        error: "Internal server error. Please try again.",
        response:
          "I encountered an internal error. Please make sure your LLM provider (Ollama or OpenAI-compatible) is running and accessible.",
      },
      { status: 500 }
    );
  }
}
