// ==========================================
// Brave Search API Provider
// Free tier: 2,000 queries/month
// ==========================================

import { SearchResult } from "@/lib/types";
import { config } from "@/lib/utils/env";

export const braveProvider = {
  name: "brave",

  async search(query: string, count: number = 5): Promise<SearchResult[]> {
    const apiKey = config.braveApiKey;

    if (!apiKey) {
      console.warn("Brave Search API key not configured");
      return [];
    }

    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 10)}`;

      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status}`);
      }

      const data = await response.json();

      const results: SearchResult[] = (data.web?.results || []).map(
        (r: any) => ({
          title: r.title || "Untitled",
          url: r.url || "",
          snippet: r.description || "",
          source: "brave",
          publishedDate: r.age || r.publishedDate || undefined,
        })
      );

      return results.slice(0, count);
    } catch (error) {
      console.error("Brave search error:", error);
      return [];
    }
  },
};
