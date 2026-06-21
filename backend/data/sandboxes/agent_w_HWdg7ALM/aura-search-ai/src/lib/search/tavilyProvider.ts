// ==========================================
// Tavily Search API Provider
// Free tier: 1,000 queries/month
// ==========================================

import { SearchResult } from "@/lib/types";
import { config } from "@/lib/utils/env";

export const tavilyProvider = {
  name: "tavily",

  async search(query: string, count: number = 5): Promise<SearchResult[]> {
    const apiKey = config.tavilyApiKey;

    if (!apiKey) {
      console.warn("Tavily API key not configured");
      return [];
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: Math.min(count, 10),
          search_depth: "basic",
          include_answer: false,
          include_images: false,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();

      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        title: r.title || "Untitled",
        url: r.url || "",
        snippet: r.content || "",
        source: "tavily",
        publishedDate: r.publishedDate || undefined,
      }));

      return results.slice(0, count);
    } catch (error) {
      console.error("Tavily search error:", error);
      return [];
    }
  },
};
