// ==========================================
// Web Search Tool
// Searches the internet using configured provider.
// Risk Level: LOW
// ==========================================

import { searchWeb } from "@/lib/search";
import { registerTool } from "./types";

registerTool({
  name: "webSearch",
  description: "Search the internet for information on any topic. Returns a list of results with titles, URLs, and snippets.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      count: { type: "number", description: "Number of results (1-10)", default: 5 },
    },
    required: ["query"],
  },

  async execute(input: any) {
    try {
      const results = await searchWeb(input.query, input.count || 5);
      const sources = results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        source: r.source,
        publishedDate: r.publishedDate,
      }));
      return {
        success: true,
        data: { results, summary: `Found ${results.length} result(s)` },
        sources,
      };
    } catch (error: any) {
      return { success: false, error: `Search failed: ${error.message}` };
    }
  },
});
