// ==========================================
// Browser Automation Tool
// Phase 3: Playwright-based browser actions.
// Risk Level: HIGH (requires user confirmation)
// ==========================================

import { registerTool } from "./types";
import { BrowserSession, withBrowserPage } from "@/lib/browser/playwrightClient";

registerTool({
  name: "browserAutomation",
  description:
    "Open a webpage and perform actions like reading content, taking screenshots, listing links, or clicking safe elements. All actions require user confirmation.",
  riskLevel: "high",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["open", "screenshot", "read", "listLinks", "click", "fillForm"],
        description: "Action to perform in the browser",
      },
      url: {
        type: "string",
        description: "URL to navigate to (required for 'open', optional for others)",
      },
      selector: {
        type: "string",
        description: "CSS selector for 'click' or 'fillForm' actions",
      },
      value: {
        type: "string",
        description: "Value to fill in a form field (required for 'fillForm')",
      },
    },
    required: ["action"],
  },

  async execute(input: any) {
    const { action, url, selector, value } = input;

    if (!action) {
      return {
        success: false,
        error: "Missing required parameter: 'action'",
      };
    }

    try {
      // For quick read-only operations, use a single-page session
      if (action === "open" || action === "read") {
        return await withBrowserPage(async (session) => {
          const targetUrl = url || session.currentUrl || "";
          if (!targetUrl) {
            return {
              success: false,
              error: "A URL is required for navigation.",
            };
          }

          const navResult = await session.navigate(targetUrl);

          if (!navResult.success) {
            return {
              success: false,
              error: navResult.error || "Failed to navigate to the page.",
            };
          }

          return {
            success: true,
            data: {
              title: navResult.title,
              url: navResult.url,
              textContent: navResult.textContent.slice(0, 10000),
              links: navResult.links.slice(0, 50),
              interactiveElements: navResult.interactiveElements.slice(0, 50),
            },
          };
        });
      }

      if (action === "screenshot") {
        return await withBrowserPage(async (session) => {
          if (url) {
            await session.navigate(url);
          } else if (!session.currentUrl) {
            return {
              success: false,
              error: "No URL provided and no active page. Provide a URL to screenshot.",
            };
          }

          const result = await session.screenshot(false);
          if (!result.success) {
            return {
              success: false,
              error: result.error || "Screenshot failed.",
            };
          }

          return {
            success: true,
            data: {
              imageDataUri: result.dataUri,
              url: session.currentUrl,
            },
          };
        });
      }

      if (action === "listLinks") {
        return await withBrowserPage(async (session) => {
          if (url) {
            await session.navigate(url);
          }

          const content = await session.readContent();

          if (!content.success) {
            return {
              success: false,
              error: content.error || "Failed to read page content.",
            };
          }

          return {
            success: true,
            data: {
              title: content.title,
              url: content.url,
              links: content.links.slice(0, 100),
            },
          };
        });
      }

      if (action === "click") {
        if (!selector) {
          return {
            success: false,
            error: "A CSS 'selector' is required for the click action.",
          };
        }

        return await withBrowserPage(async (session) => {
          if (url) {
            await session.navigate(url);
          }

          const result = await session.click(selector);

          if (!result.success) {
            return {
              success: false,
              error: result.error || "Click failed.",
            };
          }

          // After clicking, wait a moment and read the new content
          await new Promise((r) => setTimeout(r, 1000));
          const content = await session.readContent();

          return {
            success: true,
            data: {
              clicked: selector,
              newUrl: result.newUrl,
              pageTitle: content.title,
              pageContent: content.textContent.slice(0, 5000),
            },
          };
        });
      }

      if (action === "fillForm") {
        if (!selector) {
          return {
            success: false,
            error: "A CSS 'selector' is required for fillForm action.",
          };
        }

        return await withBrowserPage(async (session) => {
          if (url) {
            await session.navigate(url);
          }

          const result = await session.fillForm(selector, value || "");

          if (!result.success) {
            return {
              success: false,
              error: result.error || "Failed to fill form field.",
            };
          }

          return {
            success: true,
            data: {
              filled: selector,
              value: value || "",
            },
          };
        });
      }

      return {
        success: false,
        error: `Unknown action: '${action}'. Available actions: open, screenshot, read, listLinks, click, fillForm`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Browser automation failed";
      console.error("[BrowserTool] Error:", msg);
      return {
        success: false,
        error: `Browser automation error: ${msg}`,
      };
    }
  },
});
