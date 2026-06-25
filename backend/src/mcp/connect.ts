/**
 * MCP Connect bridge — wires MCP servers to Pipedream Connect OAuth.
 *
 * When a marketplace MCP server (e.g. Cloudflare) needs env vars that a
 * Pipedream app can provide, this module handles the OAuth dance:
 *   1. Create (or find) a Pipedream integration connection for the app
 *   2. Return a Pipedream Connect link URL to the frontend
 *   3. After the user authorizes, Pipedream calls our webhook
 *   4. Frontend calls verify-oauth → we finalize + start the MCP server
 */

import { PipedreamClient } from "../integrations/pipedream.ts";
import { IntegrationRegistry } from "../integrations/registry.ts";
import { SecretStore } from "../secrets/store.ts";
import { McpStore, mcpManager } from "./client.ts";
import { MCP_MARKETPLACE, MCP_TO_PIPEDREAM_MAP } from "./marketplace.ts";

// ---------------------------------------------------------------------------
// Pipedream Connect config (mirrors what integrations/api.ts does)
// ---------------------------------------------------------------------------

interface ConnectConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: string;
}

function getConnectConfig(): ConnectConfig | null {
  const clientId = process.env.PIPEDREAM_CLIENT_ID?.trim();
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET?.trim();
  const projectId = process.env.PIPEDREAM_PROJECT_ID?.trim();
  if (!clientId || !clientSecret || !projectId) return null;
  return {
    clientId,
    clientSecret,
    projectId,
    environment: process.env.PIPEDREAM_ENVIRONMENT?.trim() ?? "production",
  };
}

async function getPdApiKey(ownerId: string): Promise<string | null> {
  const envKey = process.env.PIPEDREAM_API_KEY?.trim();
  if (envKey && envKey.length > 0) return envKey;
  return await SecretStore.getCI(ownerId, "pipedream_api_key");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface McpOAuthStartResult {
  /** The Pipedream app slug we're connecting to. */
  pipedreamSlug: string;
  /** Auth type: "oauth" or "api_key". */
  authType: string;
  /** The Connect Link URL to open in a new window. */
  connectLinkUrl?: string;
  /** The integration connection ID (used for verify step). */
  connectionId?: string;
  /** Whether the user still needs to provide env vars after OAuth. */
  needsEnv: string[];
  /** Human-readable message. */
  message: string;
}

export interface McpOAuthVerifyResult {
  connected: boolean;
  connectedAccountId?: string;
  error?: string;
}

/**
 * Initiate a Pipedream Connect OAuth flow for an MCP server that was
 * installed from the marketplace.
 *
 * Returns an OAuth link URL for the frontend to open, or a message if
 * the integration is already connected.
 */
export async function startMcpOAuthFlow(
  serverId: string,
  userId: string,
): Promise<McpOAuthStartResult> {
  const connectCfg = getConnectConfig();
  if (!connectCfg) {
    return {
      pipedreamSlug: "",
      authType: "none",
      needsEnv: [],
      message: "Pipedream Connect not configured. Set PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET, and PIPEDREAM_PROJECT_ID.",
    };
  }

  // Find the marketplace entry matching this server
  const srv = await McpStore.get(serverId);
  if (!srv) {
    return { pipedreamSlug: "", authType: "none", needsEnv: [], message: "Server not found" };
  }

  const marketEntry = MCP_MARKETPLACE.find((e) => e.name === srv.name);
  if (!marketEntry) {
    return { pipedreamSlug: "", authType: "none", needsEnv: [], message: "This server is not from the marketplace." };
  }

  const pipedreamSlug = MCP_TO_PIPEDREAM_MAP[marketEntry.id];
  if (!pipedreamSlug) {
    // No Pipedream mapping — just return the needed env vars
    return {
      pipedreamSlug: "",
      authType: "none",
      needsEnv: marketEntry.envVars?.filter((v) => v.required).map((v) => v.name) ?? [],
      message: `No Pipedream app mapped for ${marketEntry.name}. Set environment variables manually.`,
    };
  }

  // Check if a Pipedream integration already exists for this app
  const existingConn = await IntegrationRegistry.getByApp(userId, pipedreamSlug);
  if (existingConn && existingConn.status === "connected") {
    // Already connected — try to use its credentials
    return {
      pipedreamSlug,
      authType: existingConn.authType,
      needsEnv: marketEntry.envVars?.filter((v) => v.required).map((v) => v.name) ?? [],
      message: "Integration already connected.",
    };
  }

  // Get the Pipedream API key
  const pdKey = await getPdApiKey(userId);
  if (!pdKey) {
    return {
      pipedreamSlug,
      authType: "unknown",
      needsEnv: marketEntry.envVars?.filter((v) => v.required).map((v) => v.name) ?? [],
      message: "Pipedream API key not configured.",
    };
  }

  // Fetch app details from Pipedream to know auth type. Components are
  // NOT in getApp's response under the new Connect API — we fetch them
  // separately via listComponents (best-effort, non-fatal).
  let app: any;
  try {
    const result = await PipedreamClient.getApp(pdKey, pipedreamSlug);
    app = result.app;
  } catch (e: any) {
    // If fetch fails, create a minimal connection anyway
    app = {
      name_slug: pipedreamSlug,
      name: marketEntry.name,
      description: marketEntry.description,
      auth_type: "api_key",
      auth_description: "Cloudflare API Token",
      logo_url: "",
      categories: marketEntry.categories,
    };
  }

  // Cache the action components (best-effort, non-fatal)
  try {
    const components = await PipedreamClient.listComponents(pdKey, pipedreamSlug);
    const cached = components.map((comp: any) => ({
      id: comp.id,
      appSlug: pipedreamSlug,
      actionKey: comp.key,
      name: comp.name,
      description: comp.description,
      type: comp.type,
      inputSchema: comp.input_schema ?? {},
      outputSchema: comp.output_schema ?? {},
    }));
    await IntegrationRegistry.cacheActions(pipedreamSlug, cached);
  } catch {
    // Non-fatal
  }

  // Create the integration connection record
  const conn = await IntegrationRegistry.create(userId, {
    appSlug: pipedreamSlug,
    appName: app.name ?? marketEntry.name,
    appDescription: app.description ?? marketEntry.description,
    authType: app.auth_type ?? "api_key",
    authDescription: app.auth_description ?? "",
    logoUrl: app.logo_url ?? "",
    categories: app.categories ?? marketEntry.categories,
  });

  // Store a reference linking this integration to the MCP server
  await SecretStore.set(userId, `mcp_int_link_${serverId}`, conn.id);

  const needsEnv = (marketEntry.envVars ?? [])
    .filter((v) => v.required)
    .map((v) => v.name);

  // For OAuth apps, create a Connect token to get the OAuth link
  if (app.auth_type === "oauth") {
    try {
      const oauthTokenRes = await PipedreamClient.createOAuthToken(
        connectCfg.clientId,
        connectCfg.clientSecret,
      );

      // Use the MCP-server-specific success redirect
      const oauthHost = process.env.RENDER_EXTERNAL_URL ?? "";
      const webhookUri = oauthHost
        ? `${oauthHost}/api/mcp/servers/${serverId}/oauth-callback`
        : undefined;

      const ctRes = await PipedreamClient.createConnectToken(
        oauthTokenRes.access_token,
        connectCfg.projectId,
        `lab_${userId}`,
        {
          app: pipedreamSlug,
          webhookUri,
          environment: connectCfg.environment,
        },
      );

      await IntegrationRegistry.updateStatus(conn.id, userId, "connecting");

      return {
        pipedreamSlug,
        authType: "oauth",
        connectLinkUrl: ctRes.connect_link_url,
        connectionId: conn.id,
        needsEnv,
        message: "Open the link to authorize via Pipedream Connect.",
      };
    } catch (e: any) {
      return {
        pipedreamSlug,
        authType: "oauth",
        needsEnv,
        message: `Failed to create OAuth link: ${e?.message ?? String(e)}`,
      };
    }
  }

  // For API key apps, the user just needs to provide the key
  return {
    pipedreamSlug,
    authType: app.auth_type ?? "api_key",
    connectionId: conn.id,
    needsEnv,
    message: "Provide credentials to connect.",
  };
}

/**
 * Verify that OAuth completed and try to start the MCP server.
 * Returns whether the server was successfully connected.
 */
export async function verifyMcpOAuth(
  serverId: string,
  userId: string,
): Promise<McpOAuthVerifyResult> {
  const srv = await McpStore.get(serverId);
  if (!srv) {
    return { connected: false, error: "Server not found" };
  }

  // Find the linked integration connection
  const linkedConnId = await SecretStore.get(userId, `mcp_int_link_${serverId}`);
  if (!linkedConnId) {
    return { connected: false, error: "No linked integration found. Start the OAuth flow first." };
  }

  const conn = await IntegrationRegistry.get(linkedConnId, userId);
  if (!conn) {
    return { connected: false, error: "Linked integration not found." };
  }

  // Already connected via webhook
  if (conn.status === "connected" && conn.connectedAccountId) {
    // Try to start the MCP server
    try {
      await mcpManager.startServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env });
    } catch (e: any) {
      // Server may not start if env vars are missing — that's ok
    }
    return { connected: true, connectedAccountId: conn.connectedAccountId };
  }

  // Try to find the connected account via Pipedream Connect API
  const connectCfg = getConnectConfig();
  if (!connectCfg) {
    return { connected: false, error: "Pipedream Connect not configured." };
  }

  try {
    const oauthTokenRes = await PipedreamClient.createOAuthToken(
      connectCfg.clientId,
      connectCfg.clientSecret,
    );
    const accounts = await PipedreamClient.listConnectAccounts(
      oauthTokenRes.access_token,
      connectCfg.projectId,
      `lab_${userId}`,
      connectCfg.environment,
    );
    const matching = accounts.find((a) => a.app_slug === conn.appSlug);

    if (matching) {
      await IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
        connectedAccountId: matching.id,
      });
      // Try to start the MCP server
      try {
        await mcpManager.startServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env });
      } catch (e: any) {
        // May still fail if env vars are missing
      }
      return { connected: true, connectedAccountId: matching.id };
    }

    return { connected: false, error: "No matching connected account found yet." };
  } catch (e: any) {
    return { connected: false, error: e?.message ?? String(e) };
  }
}

/**
 * Set environment variables on an MCP server (e.g. after the user provides
 * their API key) and attempt to start it.
 */
export async function setMcpEnvAndStart(
  serverId: string,
  env: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const srv = await McpStore.get(serverId);
  if (!srv) return { ok: false, error: "Server not found" };

  // Merge existing env with the new values
  const mergedEnv = { ...(srv.env ?? {}), ...env };

  // Re-save with updated env
  await McpStore.upsert(
    { name: srv.name, command: srv.command, args: srv.args, env: mergedEnv, enabled: true },
    "",  // ownerId not used for upsert's DB check since we match by name
  );

  // Re-read to get the server ID
  const updated = await McpStore.get(serverId);
  if (!updated) return { ok: false, error: "Failed to update server" };

  // Stored the env — now try to start
  try {
    await mcpManager.startServer({ name: updated.name, command: updated.command, args: updated.args, env: mergedEnv });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
