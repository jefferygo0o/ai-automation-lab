/**
 * Active browser view tracker.
 *
 * Caches the most recent page content from the lab's headless browser so the
 * frontend BrowserPage can proxy it in an iframe — no X-Frame-Options blocking.
 *
 * Set after every browser tool call; queried by the /api/browser/active routes.
 */

export interface ActiveView {
  url: string;
  title: string;
  html: string;
  timestamp: number;
  agentId: string;
}

const views = new Map<string, ActiveView>();

export function setActiveView(
  userId: string,
  data: { url: string; title: string; html: string; agentId: string },
) {
  views.set(userId, {
    url: data.url,
    title: data.title,
    html: data.html,
    timestamp: Date.now(),
    agentId: data.agentId,
  });
}

export function getActiveView(userId: string): ActiveView | null {
  return views.get(userId) ?? null;
}

export function clearActiveView(userId: string) {
  views.delete(userId);
}

/** Remove all entries older than 5 minutes. */
export function sweepStaleViews() {
  const cutoff = Date.now() - 300_000;
  for (const [key, view] of views) {
    if (view.timestamp < cutoff) views.delete(key);
  }
}
