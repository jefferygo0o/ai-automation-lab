// ==========================================
// Webpage API Route
// POST /api/webpage
// Fetches and extracts content from a URL.
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getTool } from "@/lib/tools";

// Import tools to ensure they're registered
import "@/lib/tools/init";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const { url, maxLength = 10000 } = body;

    // Basic URL validation
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json(
          { error: "Only HTTP(S) URLs are supported" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const fetchTool = getTool("fetchWebpage");
    if (!fetchTool) {
      return NextResponse.json(
        { error: "Webpage fetch tool is not available" },
        { status: 503 }
      );
    }

    const result = await fetchTool.execute({ url, maxLength });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to fetch webpage" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      sources: result.sources,
    });
  } catch (error: any) {
    console.error("Webpage API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process webpage" },
      { status: 500 }
    );
  }
}
