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

  const iframeSrc = useMemo(() => {
    const p = routePath.startsWith("/") ? routePath : `/${routePath}`;
    const url = `/ws/${ownerId}${p === "" ? "/" : p}`;
    const token = getToken() || "";
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
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
            href={`/ws/${ownerId}${routePath.startsWith("/") ? routePath : "/" + routePath}?token=${encodeURIComponent(getToken() || "")}`}
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
            title="Lab Space preview"
            src={iframeSrc}
            className="w-full h-full block"
            sandbox="allow-scripts allow-forms allow-popups"
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
