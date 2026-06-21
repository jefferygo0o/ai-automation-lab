// ==========================================
// Summarize Page Tool
// Fetches a webpage and creates a concise summary.
// Risk Level: LOW
// ==========================================

import { getTool } from "./types";
import { registerTool } from "./types";

registerTool({
  name: "summarizePage",
  description:
    "Fetch a webpage and summarize its content. Returns key points and a brief summary.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to summarize" },
    },
    required: ["url"],
  },

  async execute(input: any) {
    const fetchTool = getTool("fetchWebpage");
    if (!fetchTool) {
      return { success: false, error: "Fetch tool not available. Cannot read webpage." };
    }

    const fetchResult = await fetchTool.execute({ url: input.url, maxLength: 8000 });

    if (!fetchResult.success) {
      return fetchResult;
    }

    const { title, text, excerpt } = fetchResult.data;

    // Generate summary from text
    const summary = generateSummary(text || excerpt || "", title || input.url);

    return {
      success: true,
      data: { title, summary, url: input.url, source: new URL(input.url).hostname },
      sources: [{
        title: title || "Untitled",
        url: input.url,
        snippet: (excerpt || "").slice(0, 200),
        source: new URL(input.url).hostname,
      }],
    };
  },
});

function generateSummary(text: string, title: string): string {
  const cleanText = text.replace(/\s+/g, " ").trim();
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [];

  const keyPoints: string[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (s.length < 20 || s.length > 300) continue;
    if (seen.has(s)) continue;

    const lower = s.toLowerCase();
    const isKey =
      lower.startsWith("key") || lower.startsWith("import") ||
      lower.startsWith("notable") || lower.startsWith("signific") ||
      lower.startsWith("in conclusion") || lower.startsWith("overall") ||
      lower.startsWith("the study") || lower.startsWith("according") ||
      lower.startsWith("research") || lower.startsWith("result") ||
      lower.startsWith("find") || lower.startsWith("however") ||
      lower.startsWith("importantly");

    if (isKey) { keyPoints.push(s); seen.add(s); }
  }

  if (keyPoints.length < 3) {
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (s.length < 30 || s.length > 300) continue;
      if (seen.has(s)) continue;
      if (keyPoints.length < 5) { keyPoints.push(s); seen.add(s); }
    }
  }

  let summary = `**${title}**\n\n`;
  if (keyPoints.length > 0) {
    summary += "**Key Points:**\n";
    keyPoints.slice(0, 6).forEach((point, i) => {
      summary += `${i + 1}. ${point}\n`;
    });
  }

  return summary;
}
