// ==========================================
// DuckDuckGo Search Provider
// Uses the DuckDuckGo API (free, no key required).
// ==========================================

import { SearchResult } from "@/lib/types";

export const duckduckgoProvider = {
  name: "duckduckgo",

  async search(query: string, count: number = 5): Promise<SearchResult[]> {
    try {
      // Try the DuckDuckGo instant answer API first
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AuraSearchAI/1.0)",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const results: SearchResult[] = [];

      // Add abstract result if available
      if (data.AbstractText) {
        results.push({
          title: data.Heading || "DuckDuckGo Result",
          url: data.AbstractURL || "",
          snippet: data.AbstractText,
          source: "duckduckgo",
        });
      }

      // Add related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= count) break;
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(" - ")[0] || topic.Text,
              url: topic.FirstURL,
              snippet: topic.Text,
              source: "duckduckgo",
            });
          }
        }
      }

      if (results.length > 0) {
        return results.slice(0, count);
      }

      // Fallback: scrape HTML results
      return await scrapeDuckDuckGo(query, count);
    } catch (error) {
      console.warn("DuckDuckGo API failed, trying HTML scrape:", error);
      try {
        return await scrapeDuckDuckGo(query, count);
      } catch (e) {
        console.error("DuckDuckGo scrape also failed:", e);
        return [];
      }
    }
  },
};

async function scrapeDuckDuckGo(query: string, count: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`DuckDuckGo scrape failed: ${response.status}`);
  const html = await response.text();
  return parseDuckDuckGoHTML(html, count);
}

function parseDuckDuckGoHTML(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < count) {
    const url = match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "");
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    const snippet = match[3].replace(/<[^>]*>/g, "").trim();

    if (title && url) {
      results.push({
        title: decodeHtmlEntities(title),
        url: decodeURIComponent(url),
        snippet: decodeHtmlEntities(snippet),
        source: "duckduckgo",
      });
    }
  }

  return results;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
