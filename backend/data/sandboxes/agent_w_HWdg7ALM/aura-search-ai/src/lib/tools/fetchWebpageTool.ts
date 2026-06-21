// ==========================================
// Fetch Webpage Tool
// Fetches and extracts readable content from a public URL.
// Risk Level: LOW
// ==========================================

import { extractReadableContent } from "@/lib/utils/readability";
import { registerTool } from "./types";

registerTool({
  name: "fetchWebpage",
  description:
    "Fetch and read the content of a public webpage. Returns the title and main text content. Cannot bypass paywalls or logins.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The full URL of the webpage to fetch" },
      maxLength: { type: "number", description: "Maximum characters to return (default 10000)", default: 10000 },
    },
    required: ["url"],
  },

  async execute(input: any) {
    const { url, maxLength = 10000 } = input;

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { success: false, error: "Only HTTP(S) URLs are supported" };
      }
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return { success: false, error: "Cannot fetch local resources" };
      }
    } catch {
      return { success: false, error: "Invalid URL format" };
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AuraSearch/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return { success: false, error: `Unsupported content type: ${contentType}` };
      }

      const html = await response.text();
      if (html.length > 500000) {
        return { success: false, error: "Page is too large to process" };
      }

      const pageContent = extractReadableContent(html, url);
      if (!pageContent) {
        return { success: false, error: "Could not extract content from page" };
      }

      const text = pageContent.text.slice(0, maxLength);

      return {
        success: true,
        data: {
          title: pageContent.title,
          text,
          excerpt: pageContent.excerpt,
          byline: pageContent.byline,
          length: pageContent.length,
          url,
        },
        sources: [{
          title: pageContent.title,
          url,
          snippet: pageContent.excerpt.slice(0, 200),
          source: new URL(url).hostname,
        }],
      };
    } catch (error: any) {
      if (error.name === "AbortError") return { success: false, error: "Request timed out" };
      return { success: false, error: `Failed to fetch page: ${error.message}` };
    }
  },
});
