/**
 * MCP Connect bridge — wires MCP servers to Foundry Connect OAuth.
 *
 * When a marketplace MCP server (e.g. Cloudflare) needs env vars that a
 * Foundry Connect provider can provide, this module handles the OAuth dance:
 *   1. Create (or find) a Foundry integration connection for the provider
 *   2. Return a Foundry Connect authorization URL to the frontend
 *   3. Foundry completes the OAuth flow and stores the connection
 *   4. Frontend calls verify-oauth → we finalize + start the MCP server
 *
 * Foundry's OAuth model differs from Foundry Connect:
 *   - We POST /v1/oauth/start with { provider, redirectUri? } to get an
 *     authorizationUrl managed by Foundry. The token callback lives on
 *     Foundry (OAUTH_CALLBACK_BASE), not on our server.
 *   - On success, the connection surfaces via GET /v1/connections.
 */

import { FoundryClient } from "../integrations/foundry.ts";
import { IntegrationRegistry } from "../integrations/registry.ts";
import { SecretStore } from "../secrets/store.ts";
import { McpStore, mcpManager } from "./client.ts";
import { MCP_MARKETPLACE, MCP_TO_FOUNDRY_MAP } from "./marketplace.ts";

// ---------------------------------------------------------------------------
// Foundry Connect config (single API key; replaces Foundry's client/secret/project envs)
// ---------------------------------------------------------------------------

interface FoundryConfig {
  apiKey: string;
  /** Foundry's OAuth callback base (their hosted flow). Override for non-prod. */
  oauthCallbackBase: string;
}

function getFoundryConfig(): FoundryConfig | null {
  const envKey = process.env.FOUNDRY_API_KEY?.trim();
  const apiKey = envKey && envKey.length > 0
    ? envKey
    : null;
  if (!apiKey) return null;
  return {
    apiKey,
    oauthCallbackBase:
      process.env.FOUNDRY_OAUTH_CALLBACK_BASE?.trim() ??
      "https://api-gateway-production-4984.up.railway.app/v1/connections/oauth/callback",
  };
}

async function getFoundryApiKey(ownerId: string): Promise<string | null> {
  const envKey = process.env.FOUNDRY_API_KEY?.trim();
  if (envKey && envKey.length > 0) return envKey;
  return await SecretStore.getCI(ownerId, "foundry_api_key");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface McpOAuthStartResult {
  /** The Foundry provider slug we're connecting to. */
  foundrySlug: string;
  /** Auth type: "oauth" or "api_key". */
  authType: string;
  /** The authorization URL to open in a new window. */
  authorizationUrl?: string;
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
 * Initiate a Foundry Connect OAuth flow for an MCP server that was
 * installed from the marketplace.
 */
export async function startMcpOAuthFlow(
  serverId: string,
  userId: string,
): Promise<McpOAuthStartResult> {
  const cfg = getFoundryConfig();
  if (!cfg) {
    return {
      foundrySlug: "",
      authType: "none",
      needsEnv: [],
      message:
        "Foundry Connect not configured. Set FOUNDRY_API_KEY in the environment.",
    };
  }

  // Find the marketplace entry matching this server
  const srv = await McpStore.get(serverId, userId);
  if (!srv) {
    return { foundrySlug: "", authType: "none", needsEnv: [], message: "Server not found" };
  }

  const marketEntry = MCP_MARKETPLACE.find((e) => e.name === srv.name);
  if (!marketEntry) {
    return { foundrySlug: "", authType: "none", needsEnv: [], message: "This server is not from the marketplace." };
  }

  const foundrySlug = MCP_TO_FOUNDRY_MAP[marketEntry.id];
  if (!foundrySlug) {
    // No Foundry mapping — just return the needed env vars
    return {
      foundrySlug: "",
      authType: "none",
      needsEnv: marketEntry.envVars?.filter((v) => v.required).map((v) => v.name) ?? [],
      message: `No Foundry provider mapped for ${marketEntry.name}. Set environment variables manually.`,
    };
  }

  // Check if a Foundry integration already exists for this provider
  const existingConn = await IntegrationRegistry.getByApp(userId, foundrySlug);
  if (existingConn && existingConn.status === "connected") {
    return {
      foundrySlug,
      authType: existingConn.authType,
      needsEnv: marketEntry.envVars?.filter((v) => v.required).map((v) => v.name) ?? [],
      message: "Integration already connected.",
    };
  }

  // Get the Foundry API key (env first, then per-user secret)
  const apiKey = await getFoundryApiKey(userId);
  if (!apiKey) {
    return {
      foundrySlug,
      authType: "unknown",
      needsEnv: marketEntry.envVars?.filter((v) => v.required).map((v) => v.name) ?? [],
      message: "Foundry API key not configured.",
    };
  }

  // Fetch provider details from Foundry. Components are NOT included in
  // getProvider's response — we fetch them separately via listActions.
  const foundry = FoundryClient;
  let provider: any;
  try {
    provider = provider = await foundry.getProvider(apiKey, foundrySlug);
  } catch (e: any) {
    // If fetch fails, create a minimal connection anyway
    provider = {
      name: foundrySlug,
      displayName: marketEntry.name,
      description: marketEntry.description,
      auth: { type: "api_key" },
      categories: marketEntry.categories,
    };
  }

  // Cache the action components (best-effort, non-fatal)
  try {
    const actions = await foundry.listProviderActions(apiKey, foundrySlug);
    const cached = actions.map((a: any) => ({
      id: `${foundrySlug}:${a.name}`,
      appSlug: foundrySlug,
      actionKey: a.name,
      name: a.displayName ?? a.name,
      description: a.description ?? "",
      type: "action" as const,
      inputSchema: a.inputSchema ?? {},
      outputSchema: a.outputSchema ?? {},
    }));
    await IntegrationRegistry.cacheActions(foundrySlug, cached);
  } catch {
    // Non-fatal
  }

  // Create the integration connection record
  const authType = (provider.auth?.type ?? "api_key") as string;
  const conn = await IntegrationRegistry.create(userId, {
    appSlug: foundrySlug,
    appName: provider.displayName ?? provider.name ?? marketEntry.name,
    appDescription: provider.description ?? marketEntry.description ?? "",
    authType: authType as "oauth" | "api_key" | "keys" | "none",
    authDescription: "",
    logoUrl: "",
    categories: provider.categories ?? marketEntry.categories ?? [],
  });

  // Store a reference linking this integration to the MCP server
  await SecretStore.set(userId, `mcp_int_link_${serverId}`, conn.id);

  const needsEnv = (marketEntry.envVars ?? [])
    .filter((v) => v.required)
    .map((v) => v.name);

  // For OAuth providers, ask Foundry to mint an authorizationUrl.
  if (authType === "oauth" || authType === "oauth2") {
    try {
      const { authorizationUrl } = await FoundryClient.startOAuth(apiKey, foundrySlug, { externalUserId: userId, redirectUri: cfg.oauthCallbackBase, clientRedirectUri: 'https://' + (process.env.HOST ?? 'localhost:7777') + '/integrations' });

      await IntegrationRegistry.updateStatus(conn.id, userId, "connecting");

      return {
        foundrySlug,
        authType: "oauth",
        authorizationUrl,
        connectionId: conn.id,
        needsEnv,
        message: "Open the link to authorize via Foundry Connect.",
      };
    } catch (e: any) {
      return {
        foundrySlug,
        authType: "oauth",
        needsEnv,
        message: `Failed to create OAuth link: ${e?.message ?? String(e)}`,
      };
    }
  }

  // For API key providers, the user just needs to provide the key
  return {
    foundrySlug,
    authType,
    connectionId: conn.id,
    needsEnv,
    message: "Provide credentials to connect.",
  };
}

/**
 * Verify that OAuth completed (by polling Foundry's /v1/connections) and
 * try to start the MCP server.
 */
export async function verifyMcpOAuth(
  serverId: string,
  userId: string,
): Promise<McpOAuthVerifyResult> {
  const srv = await McpStore.get(serverId, userId);
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

  // Already marked connected
  if (conn.status === "connected" && conn.connectedAccountId) {
    try {
      await mcpManager.startServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env });
    } catch (e: any) {
      // Server may not start if env vars are missing — that's ok
    }
    return { connected: true, connectedAccountId: conn.connectedAccountId };
  }

  const apiKey = await getFoundryApiKey(userId);
  if (!apiKey) {
    return { connected: false, error: "Foundry API key not configured." };
  }

  // Poll Foundry for a connection matching our provider.
  try {
    const conns = await FoundryClient.listConnections(apiKey, { provider: conn.appSlug });
    const matching = conns[0];

    if (matching) {
      await IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
        connectedAccountId: matching.id,
      });
      try {
        await mcpManager.startServer({ name: srv.name, command: srv.command, args: srv.args, env: srv.env });
      } catch (e: any) {
        // May still fail if env vars are missing
      }
      return { connected: true, connectedAccountId: matching.id };
    }

    return { connected: false, error: "No matching connection found yet." };
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
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const srv = await McpStore.get(serverId, userId);
  if (!srv) return { ok: false, error: "Server not found" };

  // Merge existing env with the new values
  const mergedEnv = { ...(srv.env ?? {}), ...env };

  // Re-save with updated env
  await McpStore.upsert(
    { name: srv.name, command: srv.command, args: srv.args, env: mergedEnv, enabled: true },
    userId,
  );

  // Re-read to get the server ID
  const updated = await McpStore.get(serverId, userId);
  if (!updated) return { ok: false, error: "Failed to update server" };

  // Stored the env — now try to start
  try {
    await mcpManager.startServer({ name: updated.name, command: updated.command, args: updated.args, env: mergedEnv });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
