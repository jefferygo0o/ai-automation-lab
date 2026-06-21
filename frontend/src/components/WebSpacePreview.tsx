import { useMemo, useState } from "react";
import { getToken } from "../api/client";
import {
  RefreshCw, Maximize2, Smartphone, Monitor, Tablet, ExternalLink,
} from "lucide-react";

type Viewport = "desktop" | "tablet" | "mobile";
const VIEWPORT_WIDTHS: Record<Viewport, number> = { desktop: 1280, tablet: 768, mobile: 390 };

interface Props {
  ownerId: string;
  routePath: string;
  previewKey: number;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onRefresh: () => void;
}

export function WebSpacePreview({
  ownerId, routePath, previewKey, fullscreen, onToggleFullscreen, onRefresh,
}: Props) {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  const srcDoc = useMemo(() => {
    const p = routePath.startsWith("/") ? routePath : `/${routePath}`;
    const url = `/ws/${ownerId}${p === "" ? "/" : p}`;
    const token = getToken() || "";
    return `<!doctype html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;height:100%;background:#0b0d10;color:#e6e6e6;font:13px ui-sans-serif,system-ui,-apple-system,sans-serif}
#spinner{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;gap:8px}
#err{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:32px;text-align:left;white-space:pre-wrap;overflow:auto;background:#1a0d10;color:#ffb4b4;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
#err.show{display:flex}
.dot{width:6px;height:6px;border-radius:50%;background:#888;animation:p 1.2s infinite}
.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
@keyframes p{0%,80%,100%{opacity:.25}40%{opacity:1}}
</style>
</head><body>
<div id="spinner"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
<pre id="err"></pre>
<script>
(async () => {
  const url = ${JSON.stringify(url)};
  const token = ${JSON.stringify(token)};
  const err = document.getElementById("err");
  const sp = document.getElementById("spinner");
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "authorization": "Bearer " + token, "accept": "text/html, application/json" }
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      const t = await res.text();
      err.textContent = "Preview failed (HTTP " + res.status + "):\\n\\n" + t.slice(0, 2000);
      err.classList.add("show");
      sp.style.display = "none";
      return;
    }
    if (ct.includes("application/json")) {
      const j = await res.text();
      err.textContent = "API routes don't render visually. Response:\\n\\n" + j.slice(0, 4000);
      err.classList.add("show");
      sp.style.display = "none";
      return;
    }
    const html = await res.text();
    sp.style.display = "none";
    document.open();
    document.write(html);
    document.close();
  } catch (e) {
    err.textContent = "Preview error: " + (e && e.message ? e.message : String(e));
    err.classList.add("show");
    sp.style.display = "none";
  }
})();
</script>
</body></html>`;
  }, [ownerId, routePath, previewKey]);

  const width = VIEWPORT_WIDTHS[viewport];

  return (
    <div className="h-full flex flex-col bg-paper-200">
      <div className="h-9 border-b border-line flex items-center justify-between px-3 shrink-0 bg-paper-100">
        <div className="flex items-center gap-1">
          <ViewportBtn active={viewport === "desktop"} onClick={() => setViewport("desktop")} title="Desktop">
            <Monitor className="w-3.5 h-3.5" />
          </ViewportBtn>
          <ViewportBtn active={viewport === "tablet"} onClick={() => setViewport("tablet")} title="Tablet">
            <Tablet className="w-3.5 h-3.5" />
          </ViewportBtn>
          <ViewportBtn active={viewport === "mobile"} onClick={() => setViewport("mobile")} title="Mobile">
            <Smartphone className="w-3.5 h-3.5" />
          </ViewportBtn>
          <span className="ml-2 text-2xs text-ink-400 font-mono">{width}px</span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/ws/${ownerId}${routePath.startsWith("/") ? routePath : "/" + routePath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-icon"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onRefresh}
            className="btn btn-ghost btn-icon"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleFullscreen}
            className="btn btn-ghost btn-icon"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-paper-200">
        <div
          className="bg-white border border-line rounded-sm shadow-sm overflow-hidden"
          style={{ width: fullscreen ? "100%" : width, maxWidth: "100%", height: fullscreen ? "calc(100vh - 120px)" : 720 }}
        >
          <iframe
            key={previewKey}
            title="Web Space preview"
            srcDoc={srcDoc}
            className="w-full h-full block"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
}

function ViewportBtn({
  active, onClick, title, children,
}: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`btn btn-ghost btn-icon ${active ? "bg-paper-200 text-ink-900" : "text-ink-400"}`}
    >
      {children}
    </button>
  );
}
