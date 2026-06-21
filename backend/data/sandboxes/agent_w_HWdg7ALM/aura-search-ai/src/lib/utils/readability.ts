// ==========================================
// Webpage Readability Extraction
// Uses Mozilla Readability via cheerio/jsdom
// ==========================================

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface PageContent {
  title: string;
  text: string;
  excerpt: string;
  byline?: string;
  length: number;
}

/**
 * Extract readable content from HTML string.
 * Uses Mozilla Readability algorithm to get main article content.
 */
export function extractReadableContent(html: string, url: string): PageContent | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      // Fallback: just get body text
      const body = dom.window.document.body;
      const text = body ? body.textContent || "" : "";
      return {
        title: dom.window.document.title || "Untitled",
        text: text.slice(0, 10000).trim(),
        excerpt: text.slice(0, 300).trim(),
        length: text.length,
      };
    }

    return {
      title: article.title || "Untitled",
      text: article.textContent?.slice(0, 15000)?.trim() || "",
      excerpt: article.excerpt || "",
      byline: article.byline || undefined,
      length: article.length || 0,
    };
  } catch (error) {
    console.error("Readability extraction error:", error);
    return null;
  }
}

/**
 * Strip HTML tags and return plain text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncate text to a maximum length, preserving whole words.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).split(" ").slice(0, -1).join(" ") + "...";
}
