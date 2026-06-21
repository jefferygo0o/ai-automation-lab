// ==========================================
// Search API Route - Direct web search endpoint
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/search";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing required field: query" },
        { status: 400 }
      );
    }

    const count = Math.min(Math.max(1, body.count || 5), 10);
    const results = await searchWeb(query, count);

    return NextResponse.json({ results, count: results.length });
  } catch (error: any) {
    console.error("[search] Error:", error);
    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 }
    );
  }
}
