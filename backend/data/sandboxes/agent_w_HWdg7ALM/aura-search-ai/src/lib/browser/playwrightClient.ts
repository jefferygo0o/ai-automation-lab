// ==========================================
// Playwright Client — Browser Automation Engine
// Phase 3: Full browser automation with safety controls.
// ==========================================

import { chromium, Browser, Page, BrowserContext } from "playwright";

export interface BrowserConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
}

export const defaultBrowserConfig: BrowserConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1280, height: 800 },
};

export interface NavigationResult {
  success: boolean;
  title: string;
  url: string;
  textContent: string;
  links: { text: string; href: string }[];
  interactiveElements: { tag: string; text: string; selector: string }[];
  error?: string;
}

export interface ScreenshotResult {
  success: boolean;
  dataUri?: string;
  error?: string;
}

export interface ClickResult {
  success: boolean;
  newUrl?: string;
  error?: string;
}

export interface FillFormResult {
  success: boolean;
  error?: string;
}

// Blocked hosts (internal/private networks)
const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
];

const BLOCKED_PROTOCOLS = ["file:", "ftp:", "data:", "javascript:"];

function isUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    for (const blocked of BLOCKED_HOSTS) {
      if (hostname === blocked || hostname.startsWith(blocked)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const MAX_PAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserConfig;
  private sessionId: string;
  private isActive = false;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...defaultBrowserConfig, ...config };
    this.sessionId = `browser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  get active(): boolean {
    return this.isActive;
  }

  get currentUrl(): string | null {
    if (!this.page || this.page.isClosed()) return null;
    try {
      return this.page.url();
    } catch {
      return null;
    }
  }

  /**
   * Launch the browser session.
   */
  async launch(): Promise<void> {
    if (this.isActive) {
      console.warn("[BrowserSession] Already active, closing first...");
      await this.close();
    }

    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-accelerated-2d-canvas",
          "--single-process",
        ],
      });

      this.context = await this.browser.newContext({
        viewport: this.config.viewport,
        userAgent:
          "Mozilla/5.0 (compatible; AuraSearch/1.0; +https://aurasearch.ai)",
        locale: "en-US",
        timezoneId: "America/New_York",
        // Block unnecessary resources for speed
      });

      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.timeout);
      this.page.setDefaultNavigationTimeout(this.config.timeout);

      // Block resource-heavy content for speed
      await this.page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "stylesheet", "font", "media"].includes(type)) {
          // Allow images but abort heavy stuff to keep things fast
          // Actually, let's allow images for screenshots but block fonts
          if (type === "font" || type === "media") {
            route.abort();
            return;
          }
        }
        route.continue();
      });

      this.isActive = true;
      console.log(`[BrowserSession] Launched session ${this.sessionId}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown launch error";
      console.error("[BrowserSession] Launch failed:", msg);
      this.isActive = false;
      throw new Error(`Failed to launch browser: ${msg}`);
    }
  }

  /**
   * Navigate to a URL and return page content.
   */
  async navigate(url: string, waitUntil: "load" | "domcontentloaded" | "networkidle" = "domcontentloaded"): Promise<NavigationResult> {
    this.ensureActive();

    if (!isUrlAllowed(url)) {
      return {
        success: false,
        title: "",
        url,
        textContent: "",
        links: [],
        interactiveElements: [],
        error: "Navigation to this URL is not allowed for security reasons.",
      };
    }

    try {
      const response = await this.page!.goto(url, {
        waitUntil,
        timeout: this.config.timeout,
      });

      if (!response) {
        return {
          success: false,
          title: "",
          url,
          textContent: "",
          links: [],
          interactiveElements: [],
          error: "No response received from the page.",
        };
      }

      if (response.status() >= 400) {
        return {
          success: false,
          title: await this.page!.title(),
          url: this.page!.url(),
          textContent: "",
          links: [],
          interactiveElements: [],
          error: `HTTP ${response.status()}: ${response.statusText()}`,
        };
      }

      return await this.readContent();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Navigation failed";
      console.error("[BrowserSession] Navigation error:", msg);
      return {
        success: false,
        title: "",
        url,
        textContent: "",
        links: [],
        interactiveElements: [],
        error: `Navigation failed: ${msg}`,
      };
    }
  }

  /**
   * Read current page content (title, text, links, interactive elements).
   */
  async readContent(): Promise<NavigationResult> {
    this.ensureActive();

    try {
      const title = await this.page!.title();
      const currentUrl = this.page!.url();

      // Get text content
      const textContent = await this.page!.evaluate(() => {
        // Clone body to avoid modifying the page
        const clone = document.body?.cloneNode(true) as HTMLElement;
        if (!clone) return "";
        // Remove script, style, nav, footer, header clutter
        const remove = clone.querySelectorAll(
          "script, style, nav, footer, header, aside, .sidebar, .menu, .ad, .advertisement"
        );
        remove.forEach((el) => el.remove());
        return clone.textContent?.replace(/\s+/g, " ").trim() || "";
      });

      // Get all links
      const links = await this.page!.evaluate(() => {
        const anchors = document.querySelectorAll("a[href]");
        return Array.from(anchors)
          .map((a) => ({
            text: (a.textContent || "").trim().slice(0, 100),
            href: (a as HTMLAnchorElement).href,
          }))
          .filter((l) => l.href.startsWith("http"));
      });

      // Get interactive elements
      const interactiveElements = await this.page!.evaluate(() => {
        const elements: { tag: string; text: string; selector: string }[] = [];

        // Buttons
        document.querySelectorAll("button").forEach((btn) => {
          const text = (btn.textContent || "").trim().slice(0, 50);
          const id = btn.id ? `#${btn.id}` : "";
          const classes = btn.className
            ? `.${btn.className.split(" ").filter(Boolean).join(".")}`
            : "";
          elements.push({
            tag: "button",
            text: text || "button",
            selector: id || `button${classes}`,
          });
        });

        // Links that look like buttons
        document.querySelectorAll("a[href]").forEach((a) => {
          const text = (a.textContent || "").trim().slice(0, 50);
          if (text) {
            const id = a.id ? `#${a.id}` : "";
            const classes = a.className
              ? `.${a.className.split(" ").filter(Boolean).join(".")}`
              : "";
            elements.push({
              tag: "a",
              text,
              selector: id || `a${classes}`,
            });
          }
        });

        // Input fields
        document.querySelectorAll("input:not([type=hidden])").forEach((input) => {
          const el = input as HTMLInputElement;
          const name = el.name || el.placeholder || el.id || "input";
          const id = el.id ? `#${el.id}` : "";
          elements.push({
            tag: "input",
            text: name,
            selector: id || `input[name="${el.name}"]` || `input[type="${el.type}"]`,
          });
        });

        // Textareas
        document.querySelectorAll("textarea").forEach((ta) => {
          const el = ta as HTMLTextAreaElement;
          const name = el.name || el.placeholder || el.id || "textarea";
          const id = el.id ? `#${el.id}` : "";
          elements.push({
            tag: "textarea",
            text: name,
            selector: id || `textarea[name="${el.name}"]`,
          });
        });

        return elements;
      });

      // Truncate text if too large
      const truncatedText =
        textContent.length > MAX_PAGE_SIZE_BYTES
          ? textContent.slice(0, MAX_PAGE_SIZE_BYTES) +
            `\n\n... [Content truncated at ${MAX_PAGE_SIZE_BYTES} characters]`
          : textContent;

      return {
        success: true,
        title,
        url: currentUrl,
        textContent: truncatedText,
        links,
        interactiveElements,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Read failed";
      return {
        success: false,
        title: "",
        url: this.currentUrl || "",
        textContent: "",
        links: [],
        interactiveElements: [],
        error: `Failed to read page: ${msg}`,
      };
    }
  }

  /**
   * Take a screenshot of the current page.
   */
  async screenshot(fullPage: boolean = false): Promise<ScreenshotResult> {
    this.ensureActive();

    try {
      const buffer = await this.page!.screenshot({
        type: "png",
        fullPage,
        timeout: 15000,
      });

      const base64 = buffer.toString("base64");
      const dataUri = `data:image/png;base64,${base64}`;

      return {
        success: true,
        dataUri,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Screenshot failed";
      return {
        success: false,
        error: `Screenshot failed: ${msg}`,
      };
    }
  }

  /**
   * Click an element on the page by CSS selector.
   */
  async click(selector: string): Promise<ClickResult> {
    this.ensureActive();

    try {
      // Wait for the element to be visible and stable
      await this.page!.waitForSelector(selector, {
        state: "visible",
        timeout: 10000,
      });

      // Scroll into view
      await this.page!.click(selector, { timeout: 10000 });

      // Give the page a moment to react (navigation may happen)
      await this.page!.waitForTimeout(500);

      return {
        success: true,
        newUrl: this.page!.url(),
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Click failed";
      return {
        success: false,
        error: `Failed to click '${selector}': ${msg}`,
      };
    }
  }

  /**
   * Fill a form field by CSS selector.
   */
  async fillForm(selector: string, value: string): Promise<FillFormResult> {
    this.ensureActive();

    try {
      await this.page!.waitForSelector(selector, {
        state: "visible",
        timeout: 10000,
      });

      // Clear existing content first, then fill
      await this.page!.fill(selector, value, { timeout: 10000 });

      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Fill failed";
      return {
        success: false,
        error: `Failed to fill '${selector}': ${msg}`,
      };
    }
  }

  /**
   * Get the HTML content of the page (sanitized, no scripts).
   */
  async getPageHtml(): Promise<string> {
    this.ensureActive();
    try {
      return await this.page!.evaluate(() => {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        const scripts = clone.querySelectorAll("script");
        scripts.forEach((s) => s.remove());
        return clone.outerHTML.slice(0, 100000); // Limit to 100KB
      });
    } catch {
      return "";
    }
  }

  /**
   * Close the browser session.
   */
  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      console.error("[BrowserSession] Error during close:", error);
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
      this.isActive = false;
      console.log(`[BrowserSession] Session ${this.sessionId} closed`);
    }
  }

  private ensureActive(): void {
    if (!this.isActive || !this.browser || !this.page) {
      throw new Error(
        "Browser session is not active. Call launch() first."
      );
    }
  }
}

// Factory function for creating quick single-use sessions
export async function withBrowserPage<T>(
  action: (session: BrowserSession) => Promise<T>,
  config: Partial<BrowserConfig> = {}
): Promise<T> {
  const session = new BrowserSession(config);
  try {
    await session.launch();
    return await action(session);
  } finally {
    await session.close();
  }
}
