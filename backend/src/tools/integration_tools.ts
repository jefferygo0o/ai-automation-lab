/**
 * Integration Tools — allow agents to discover and use connected integrations.
 *
 * Registered alongside builtin.ts and lab_tools.ts in main.ts.
 * Provides:
 *   - list_integrations — show all connected integrations
 *   - use_integration  — execute an action on a connected integration
 *   - get_integration_actions — list available actions for a connected app
 *   - manage_integrations — connect/disconnect/sync integrations
 *
 * Backend: Foundry Connect (https://github.com/jefferygo0o/foundry-connect)
 *   running at https://api-gateway-production-4984.up.railway.app
 */

import { toolRegistry, type ToolContext } from "./registry.ts";
import { SecretStore } from "../secrets/store.ts";
import { FoundryClient } from "../integrations/foundry.ts";
import { IntegrationRegistry } from "../integrations/registry.ts";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

/**
 * Resolve the Foundry Connect API key.
 * Order: process.env.FOUNDRY_API_KEY -> SecretStore (case-insensitive).
 * Either source is accepted; env wins when set.
 */
async function resolveFoundryKey(ctx: ToolContext): Promise<string | null> {
  const envKey = process.env.FOUNDRY_API_KEY?.trim();
  if (envKey) return envKey;
  return await SecretStore.getCI(ctx.ownerId, "foundry_api_key");
}

toolRegistry.register({
  name: "list_integrations",
  description:
    "List all connected third-party integrations available to you. " +
    "Each integration connects to an external service (e.g. Slack, Gmail, GitHub) " +
    "via Foundry Connect. Returns the app name, auth type, and current status. " +
    "Use this to discover what external services you can interact with.",
  parameters: {
    status: {
      type: "string",
      description: "Filter by status: 'connected', 'disconnected', 'error', or leave empty for all",
      required: false,
      enum: ["connected", "disconnected", "error", "connecting", ""],
    },
  },
  defaultPermission: "always",
  async execute(args, ctx: ToolContext) {
    try {
      const all = await IntegrationRegistry.list(ctx.ownerId);
      const filter = args.status || null;
      const filtered = filter ? all.filter((i: any) => i.status === filter) : all;
      if (!filtered.length) {
        return text(
          filter
            ? `No integrations with status "${filter}". Use list_integrations without filter to see all.`
            : "No integrations configured yet. Go to the Integrations page to connect one."
        );
      }
      const lines = filtered.map((i: any) => {
        const actions = i.actionCount ?? 0;
        return `- **${i.appName}** (${i.appSlug}) [${i.status}] — ${i.authType} — ${actions} actions available`;
      });
      return text(`## Connected Integrations (${filtered.length}/${all.length})\n\n` + lines.join("\n"));
    } catch (e: any) {
      return err(`list_integrations failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "use_integration",
  description:
    "Execute an action on a connected third-party integration via Foundry Connect. " +
    "Use this to send Slack messages, create Google Sheets rows, search GitHub, etc. " +
    "The integration must first be connected via the Integrations page or by an agent using manage_integrations. " +
    "Find the app slug via list_integrations, then find available actions via get_integration_actions.",
  parameters: {
    app: {
      type: "string",
      description: "The app slug (e.g. 'slack', 'google_sheets', 'github'). Find via list_integrations.",
      required: true,
    },
    action: {
      type: "string",
      description:
        "The action key to execute (e.g. 'send-message', 'create-row'). " +
        "Find available actions via get_integration_actions.",
      required: true,
    },
    params: {
      type: "object",
      description:
        "JSON object of input parameters required by the action. " +
        "The schema for each action can be discovered via get_integration_actions. " +
        'Pass as a JSON object like {"channel": "#general", "text": "Hello!"}.',
      required: true,
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx: ToolContext) {
    if (!args.app || typeof args.app !== "string") return err("app (app slug) is required");
    if (!args.action || typeof args.action !== "string") return err("action key is required");
    if (!args.params || typeof args.params !== "object") return err("params (JSON object) is required");

    const foundryKey = await resolveFoundryKey(ctx);
    if (!foundryKey) {
      return err(
        'No Foundry Connect API key configured. Ask the user to:\n' +
        '1. Get a Foundry Connect API key from the foundry-connect dashboard\n' +
        '2. Save it as a secret named "foundry_api_key" on the Secrets page'
      );
    }

    try {
      // Get the connected account for this app
      const conn = await IntegrationRegistry.getByApp(ctx.ownerId, args.app as string);
      const accountId = conn?.connectedAccountId ?? "";

      // Pass the lab-prefixed external user id used at connection time.
      // Foundry Connect's /v1/tools/execute accepts it as the orgId.
      const result = await FoundryClient.executeAction(
        foundryKey,
        args.app as string,
        args.action as string,
        (args.params ?? {}) as Record<string, unknown>,
        undefined,
        `lab_${ctx.ownerId}`,
      );

      return text(
        `## Integration Result: ${args.app}/${args.action}\n\n` +
        JSON.stringify(result, null, 2)
      );
    } catch (e: any) {
      return err(`use_integration failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "get_integration_actions",
  description:
    "List available actions for a connected integration. " +
    "Returns the action key, name, description, and the input parameter schema for each action. " +
    "Use this to discover what actions are available and what parameters they require " +
    "before calling use_integration.",
  parameters: {
    app: {
      type: "string",
      description: "The app slug (e.g. 'slack', 'google_sheets'). Find via list_integrations.",
      required: true,
    },
  },
  defaultPermission: "always",
  async execute(args, ctx: ToolContext) {
    if (!args.app || typeof args.app !== "string") return err("app slug is required");

    const foundryKey = await resolveFoundryKey(ctx);
    if (!foundryKey) {
      return err("Foundry Connect API key not configured. Save it as a secret named 'foundry_api_key'.");
    }

    try {
      const components = await FoundryClient.listActions(foundryKey, args.app as string);
      if (!components.length) {
        return text(`No actions found for "${args.app}". It may only support triggers.`);
      }
      const lines = components.map((a: any, i: number) => {
        const schema = a.inputSchema
          ? Object.entries(
              (a.inputSchema?.properties ?? a.inputSchema ?? {}) as Record<string, any>
            )
              .map(([k, v]: [string, any]) => {
                const req = (a.inputSchema?.required ?? []).includes(k)
                  ? " (required)"
                  : "";
                return `    - ${k}${req}: ${v?.type ?? "any"} — ${v?.description ?? ""}`;
              })
              .join("\n")
          : "    (no parameters)";
        return `\n### ${i + 1}. ${a.displayName ?? a.name}\n**Key:** \`${a.name}\`\n**Description:** ${a.description ?? ""}\n**Parameters:**\n${schema}`;
      });
      return text(`## Actions for ${args.app}\n` + lines.join("\n"));
    } catch (e: any) {
      return err(`get_integration_actions failed: ${e?.message ?? String(e)}`);
    }
  },
});

toolRegistry.register({
  name: "manage_integrations",
  description:
    "Manage connected integrations (third-party app connections via Foundry Connect). " +
    "Use action='list' to see all, 'connect' to start a new connection, " +
    "'disconnect' to remove a connection, 'sync' to refresh the action cache. " +
    "Before connecting, the user must have a Foundry Connect API key saved as a secret.",
  parameters: {
    action: {
      type: "string",
      description: "Operation to perform",
      required: true,
      enum: ["list", "connect", "disconnect", "sync"],
    },
    app_slug: {
      type: "string",
      description: "App slug — required for connect and disconnect (e.g. 'slack', 'google_sheets')",
      required: false,
    },
    app_name: {
      type: "string",
      description: "Human-readable app name — optional for connect (auto-fetched if omitted)",
      required: false,
    },
  },
  defaultPermission: "ask",
  async execute(args, ctx: ToolContext) {
    try {
      switch (args.action) {
        case "list": {
          const all = await IntegrationRegistry.list(ctx.ownerId);
          if (!all.length) {
            return text(
              "No integrations configured. Users can connect integrations via:\n" +
              "1. The Integrations page in the UI\n" +
              "2. Having a Foundry Connect API key saved as a secret named 'foundry_api_key'"
            );
          }
          const lines = all.map((i: any) => {
            return `- **${i.appName}** (\`${i.appSlug}\`) [${i.status}] — auth: ${i.authType} — ${i.actionCount ?? 0} actions`;
          });
          return text(`## Connected Integrations (${all.length})\n\n` + lines.join("\n"));
        }
        case "connect": {
          if (!args.app_slug) return err("app_slug is required for connect");
          const foundryKey = await resolveFoundryKey(ctx);
          if (!foundryKey) {
            return err(
              "Foundry Connect API key not found. Save it as a secret named 'foundry_api_key' first."
            );
          }
          // Fetch app info from Foundry Connect to get name and auth type
          const appInfo = await FoundryClient.getApp(foundryKey, args.app_slug as string);
          const connection = await IntegrationRegistry.create(ctx.ownerId, {
            appSlug: args.app_slug as string,
            appName: appInfo?.app?.name ?? appInfo?.app?.name ?? args.app_name ?? args.app_slug,
            appDescription: appInfo?.app?.description ?? "",
            authType: (FoundryClient.toAuthType(appInfo?.app?.auth_type) ?? "none") as "oauth" | "api_key" | "keys" | "none",
            authDescription: appInfo?.app?.auth_type ?? "",
            logoUrl: "",
            categories: [],
          });
          const msgParts = [
            `Integration initiated: **${connection.appName}** (\`${connection.appSlug}\`)`,
            `Status: ${connection.status}`,
            `Auth type: ${connection.authType}`,
          ];
          if (connection.authType === "api_key" || connection.authType === "keys") {
            msgParts.push(
              "",
              `This app supports API key auth. The user needs to:`,
              `1. Get an API key from ${connection.appName}`,
              `2. Save it as a secret named "integ_${connection.appSlug}_key" on the Secrets page`,
              `3. Run manage_integrations with action='connect' and app_slug='${connection.appSlug}' again to complete`,
            );
          } else if (connection.authType === "oauth") {
            msgParts.push(
              "",
              `This app uses OAuth. The user needs to:`,
              `1. Complete the OAuth flow via the Integrations page in the UI`,
              `2. Foundry Connect will handle the OAuth redirect automatically`,
            );
          }
          return text(msgParts.join("\n"));
        }
        case "disconnect": {
          if (!args.app_slug) return err("app_slug is required for disconnect");
          const conn = await IntegrationRegistry.getByApp(ctx.ownerId, args.app_slug as string);
          if (!conn) return text(`Integration not found: ${args.app_slug}`);
          const ok = await IntegrationRegistry.delete(conn.id, ctx.ownerId);
          return text(ok ? `Disconnected integration: ${args.app_slug}` : `Failed to disconnect: ${args.app_slug}`);
        }
        case "sync": {
          const foundryKey = await resolveFoundryKey(ctx);
          if (!foundryKey) return err("Foundry Connect API key not configured");
          const cachedApps = await IntegrationRegistry.getCachedApps(ctx.ownerId);
          let total = 0;
          for (const app of cachedApps.slice(0, 20)) {
            try {
              const actions = await FoundryClient.listActions(foundryKey, app.appSlug);
              const cached = actions.map((a: any) => ({
                id: a.name,
                appSlug: app.appSlug,
                actionKey: a.name,
                name: a.displayName ?? a.name,
                description: a.description ?? "",
                type: "action" as const,
                inputSchema: a.inputSchema ?? {},
                outputSchema: a.outputSchema ?? {},
              }));
              await IntegrationRegistry.cacheActions(app.appSlug, cached);
              total += cached.length;
            } catch {
              // skip individual app failures
            }
          }
          return text(`Synced action cache: ${total} actions updated across ${Math.min(cachedApps.length, 20)} apps`);
        }
        default:
          return err(`unknown action: ${args.action}`);
      }
    } catch (e: any) {
      return err(`manage_integrations failed: ${e?.message ?? String(e)}`);
    }
  },
});
