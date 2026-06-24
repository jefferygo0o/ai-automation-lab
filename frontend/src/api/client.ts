const TOKEN_KEY = "lab.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  body?: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const t = await res.text();
    let body: any = t;
    try { body = JSON.parse(t); } catch {}
    const status = res.status;
    if (status === 401) {
      setToken(null);
      const onAuthPage = typeof window !== "undefined" && (window.location.pathname === "/login" || window.location.pathname === "/signup" || window.location.pathname.startsWith("/auth/"));
      if (!onAuthPage) {
        console.warn("401 Unauthorized");
        window.location.href = "/login";
      }
      throw new ApiError(status, body?.error || res.statusText, body);
    }
    throw new ApiError(status, body?.error || res.statusText, body);
  }
  if (res.headers.get("content-type")?.includes("application/json")) return res.json() as Promise<T>;
  return res.text() as unknown as T;
}

export async function streamSSE(path: string, body: any, onEvent: (e: { event: string; data: string }) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, `SSE failed: ${res.statusText}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      let event = "message"; let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim() + "\n";
      }
      if (data) onEvent({ event, data: data.trim() });
    }
  }
}