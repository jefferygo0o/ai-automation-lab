// ==========================================
// Search Provider Factory
// ==========================================

import { SearchResult } from "@/lib/types";
import { config } from "@/lib/utils/env";
import { duckduckgoProvider } from "./duckduckgoProvider";
import { braveProvider } from "./braveProvider";
import { tavilyProvider } from "./tavilyProvider";

export type SearchProviderName = "duckduckgo" | "brave" | "tavily" | "searxng";

export function getSearchProvider(): {
  name: string;
  search: (query: string, count?: number) => Promise<SearchResult[]>;
} {
  switch (config.activeSearchProvider) {
    case "brave":
      if (config.braveApiKey) return braveProvider;
      break;
    case "tavily":
      if (config.tavilyApiKey) return tavilyProvider;
      break;
    case "searxng":
      if (config.searxngBaseUrl) {
        return {
          name: "searxng",
          search: async (query: string, count = 5) => {
            try {
              const url = `${config.searxngBaseUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
              const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
              });
              if (!response.ok) throw new Error(`SearXNG error: ${response.status}`);
              const data = await response.json();
              return (data.results || []).slice(0, count).map((r: any) => ({
                title: r.title || "Untitled",
                url: r.url || "",
                snippet: r.content || "",
                source: new URL(r.url || "").hostname || "web",
                publishedDate: r.publishedDate || undefined,
              }));
            } catch (error) {
              console.error("SearXNG search error:", error);
              return [];
            }
          },
        };
      }
      break;
    case "duckduckgo":
    default:
      break;
  }

  // Default: DuckDuckGo (free, no key needed)
  return duckduckgoProvider;
}

export async function searchWeb(
  query: string,
  count: number = 5
): Promise<SearchResult[]> {
  const provider = getSearchProvider();
  try {
    const results = await provider.search(query, count);
    return results;
  } catch (error) {
    console.error(`Search provider "${provider.name}" failed:`, error);
    // Fallback to DuckDuckGo
    if (provider.name !== "duckduckgo") {
      console.warn("Falling back to DuckDuckGo");
      return duckduckgoProvider.search(query, count);
    }
    return [];
  }
}

export { duckduckgoProvider } from "./duckduckgoProvider";
export { braveProvider } from "./braveProvider";
export { tavilyProvider } from "./tavilyProvider";
