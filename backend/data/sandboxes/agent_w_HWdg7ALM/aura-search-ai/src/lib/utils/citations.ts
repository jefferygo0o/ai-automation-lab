// ==========================================
// Source Citation Utilities
// ==========================================

import { Source } from "@/lib/types";

/**
 * Format sources as numbered citations for embedding in text.
 * E.g., "According to recent data [1][2], the trend is..."
 */
export function formatCitations(sources: Source[]): string {
  if (sources.length === 0) return "";

  return sources
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`)
    .join("\n");
}

/**
 * Replace inline citation markers like [1], [2] with markdown links.
 */
export function renderInlineCitations(
  text: string,
  sources: Source[]
): string {
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num) - 1;
    const source = sources[idx];
    if (source) {
      return `[${num}](${source.url})`;
    }
    return match;
  });
}

/**
 * Add a source footnote block to the end of a response.
 */
export function appendSourceFootnotes(
  response: string,
  sources: Source[]
): string {
  if (sources.length === 0) return response;

  const footnotes = sources
    .map((s, i) => `[${i + 1}] [${s.title || "Source"}](${s.url})`)
    .join("\n");

  return `${response}\n\n**Sources:**\n${footnotes}`;
}

/**
 * Deduplicate sources by URL.
 */
export function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
