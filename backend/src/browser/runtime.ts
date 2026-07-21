import { chromium, type Browser, type Page } from "playwright";
import { BrowserSessionStore } from "./store.ts";

interface RunningSession {
  browser: Browser;
  page: Page;
  url: string;
  title: string;
}

const sessions = new Map<string, RunningSession>();

// Cleanup on exit
process.on("exit", () => {
  for (const [_, s] of sessions) s.browser.close().catch(() => {});
});
process.on("SIGTERM", () => {
  for (const [_, s] of sessions) s.browser.close().catch(() => {});
});

async function getOrCreatePage(sessionId: string): Promise<Page> {
  let s = sessions.get(sessionId);
  if (!s) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });
    const page = await browser.newPage();
    s = { browser, page, url: "", title: "" };
    sessions.set(sessionId, s);

    page.on("close", () => {
      if (sessions.get(sessionId) === s) {
        sessions.delete(sessionId);
      }
    });

    // Mark session active in DB (best-effort)
    BrowserSessionStore.update(sessionId, "", {
      status: "active",
      lastStartedAt: Date.now(),
    }).catch(() => {});
  }
  return s.page;
}

function getSession(sessionId: string): RunningSession {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Browser session not found or not started");
  return s;
}

export const browserRuntime = {
  async start(sessionId: string): Promise<void> {
    await getOrCreatePage(sessionId);
  },

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    const page = await getOrCreatePage(sessionId);
    // Normalize URL
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;

    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
    const finalUrl = page.url();
    const title = await page.title();

    const s = getSession(sessionId);
    s.url = finalUrl;
    s.title = title;

    // Persist current URL
    BrowserSessionStore.update(sessionId, "", { currentUrl: finalUrl }).catch(() => {});

    return { url: finalUrl, title };
  },

  async proxyContent(sessionId: string): Promise<{ html: string; url: string }> {
    const page = await getOrCreatePage(sessionId);
    const html = await page.content();
    const currentUrl = page.url();

    // Rewrite relative URLs to absolute so they work in the iframe proxy
    let rewritten = html;
    try {
      const baseUrl = new URL(currentUrl);
      // Rewrite href, src, action, and data attributes with relative paths
      rewritten = html
        .replace(/(<(?:a|link|area|base)\s[^>]*?\bhref\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
        .replace(/(<(?:img|script|source|video|audio|iframe|embed|object|input|track)\s[^>]*?\bsrc\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
        .replace(/(<(?:form)\s[^>]*?\baction\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
        .replace(/(<(?:img|video|audio|source|track)\s[^>]*?\bposter\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`)
        .replace(/(<(?:video|audio|source|track)\s[^>]*?\bsrcset\s*=\s*["'])\/(?!\/)/gi, `$1${baseUrl.origin}/`);
      // Strip X-Frame-Options and CSP headers won't apply since this is loaded via same-origin
      // Inject base tag to resolve remaining relative URLs
      rewritten = rewritten.replace(
        /<\/head>/i,
        `<base href="${baseUrl.origin}/">\n</head>`
      );
    } catch {
      // If URL parsing fails, serve raw content
    }
    return { html: rewritten, url: currentUrl };
  },

  async screenshot(sessionId: string): Promise<Buffer> {
    const page = await getOrCreatePage(sessionId);
    return await page.screenshot({ type: "png", fullPage: false });
  },

  async eval(sessionId: string, script: string): Promise<unknown> {
    const page = await getOrCreatePage(sessionId);
    return await page.evaluate(script);
  },

  async status(sessionId: string): Promise<{ url: string; title: string; active: boolean }> {
    const s = sessions.get(sessionId);
    if (!s || s.page.isClosed()) {
      sessions.delete(sessionId);
      return { url: "", title: "", active: false };
    }
    return {
      url: s.page.url(),
      title: s.title || (await s.page.title().catch(() => "")),
      active: true,
    };
  },

  async close(sessionId: string): Promise<void> {
    const s = sessions.get(sessionId);
    if (s) {
      sessions.delete(sessionId);
      try {
        // Navigate to blank first to stop any pending requests
        await s.page.goto("about:blank").catch(() => {});
        await s.browser.close();
      } catch {
        // Force close if graceful close fails
      }
    }
    BrowserSessionStore.update(sessionId, "", {
      status: "closed",
      lastStoppedAt: Date.now(),
    }).catch(() => {});
  },
};
