import { toolRegistry } from "../src/tools/registry.ts";
import "../src/tools/lab_tools_extra.ts";
import { SecretStore } from "../src/secrets/store.ts";

// Pick the most recently active user with secrets set
const ownerId = process.env.OWNER_ID ?? "usr_iyrXl8fP_aK8";
const acct = SecretStore.get(ownerId, "CF_ACCOUNT_ID");
const tok = SecretStore.get(ownerId, "CF_API_TOKEN");
console.log("CF creds present:", !!acct && !!tok);

async function run(name: string, args: any) {
  const t = toolRegistry.get(name);
  if (!t) return console.log(`[${name}] NOT REGISTERED`);
  const ctx: any = {
    agentId: "smoke",
    ownerId,
    chatId: "smoke",
    runId: null,
    sandbox: null,
    secrets: { get: (n: string) => SecretStore.get(ownerId, n) },
    mcp: { call: async () => null, listServers: () => [] },
    abort: new AbortController().signal,
    onLog: () => {},
  };
  try {
    const r = await t.execute(args, ctx);
    const txt = (r as any)?.content?.[0]?.text ?? JSON.stringify(r);
    console.log(`[${name}] ok=${!r?.isError}\n${txt.slice(0, 400)}${txt.length > 400 ? "..." : ""}\n---`);
  } catch (e: any) {
    console.log(`[${name}] THREW: ${e.message}\n---`);
  }
}

await run("lab_generate_image", { prompt: "a small red cube on a white background, minimal", file_stem: "smoke-cube", aspect_ratio: "1:1" });
