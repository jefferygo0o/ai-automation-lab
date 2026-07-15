import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { BrowserSessionStore } from "./store.ts";

interface BrowserRuntime {
  close(): Promise<void>;
  listDownloads(): Promise<Array<{ name: string; size: number; modifiedAt: number }>>;
  accessibility(): Promise<string>;
}

const runtimes = new Map<string, BrowserRuntime>();

export const browserSessions = {
  register(id: string, runtime: BrowserRuntime) {
    runtimes.set(id, runtime);
    void BrowserSessionStore.touch(id, "", { status: "active" }).catch(() => {});
  },
  async close(id: string) {
    const runtime = runtimes.get(id);
    runtimes.delete(id);
    if (runtime) await runtime.close();
  },
  async listDownloads(id: string, ownerId = "") {
    const runtime = runtimes.get(id);
    if (runtime) return runtime.listDownloads();
    const session = await BrowserSessionStore.get(id, ownerId);
    if (!session?.downloadPath) return [];
    try {
      const names = await readdir(session.downloadPath);
      return Promise.all(names.map(async (name) => {
        const info = await stat(join(session.downloadPath, name));
        return { name, size: info.size, modifiedAt: info.mtimeMs };
      }));
    } catch { return []; }
  },
  async accessibility(id: string, _ownerId = "") {
    const runtime = runtimes.get(id);
    return runtime ? runtime.accessibility() : "Browser session is not active in this process.";
  },
};

export async function markBrowserSessionsLost() {
  await BrowserSessionStore.markLostOnBoot();
}
