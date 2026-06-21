import { useEffect, useState } from "react";
import { getToken } from "../api/client";
import type { ToolMediaItem } from "../lib/toolMeta";

/**
 * Renders a media preview for a tool result item (image / video / audio).
 *
 * The sandbox file endpoint is bearer-authenticated, so we can't put the URL
 * straight into an <img>/<video> tag — the browser won't send the Authorization
 * header. Instead, we fetch the bytes with the token and create a blob URL.
 */
export default function MediaPreview({
  agentId,
  item,
}: {
  agentId: string;
  item: ToolMediaItem;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const url = `/api/agents/${agentId}/sandbox/file?path=${encodeURIComponent(item.path)}`;
    fetch(url, { headers: { authorization: `Bearer ${getToken() ?? ""}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? "preview failed");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [agentId, item.path]);

  if (item.kind === "image") {
    return (
      <div className="my-1.5">
        {src ? (
          <a href={src} target="_blank" rel="noreferrer" className="block">
            <img
              src={src}
              alt={item.alt ?? item.path}
              className="max-w-full max-h-96 rounded border border-line bg-paper-200"
            />
          </a>
        ) : (
          <div className="h-32 w-48 bg-paper-200 animate-pulse rounded" />
        )}
        {err && <div className="text-err text-2xs mt-1">preview failed: {err}</div>}
        <div className="text-2xs text-ink-400/70 font-mono mt-0.5 truncate">{item.path}</div>
      </div>
    );
  }
  if (item.kind === "video") {
    return (
      <div className="my-1.5">
        {src ? (
          <video
            src={src}
            controls
            className="max-w-full max-h-96 rounded border border-line bg-black"
          />
        ) : (
          <div className="h-32 w-48 bg-paper-200 animate-pulse rounded" />
        )}
        {err && <div className="text-err text-2xs mt-1">preview failed: {err}</div>}
        <div className="text-2xs text-ink-400/70 font-mono mt-0.5 truncate">{item.path}</div>
      </div>
    );
  }
  // audio
  return (
    <div className="my-1.5">
      {src ? (
        <audio controls className="w-full" src={src} />
      ) : (
        <div className="h-8 w-48 bg-paper-200 animate-pulse rounded" />
      )}
      {err && <div className="text-err text-2xs mt-1">preview failed: {err}</div>}
      <div className="text-2xs text-ink-400/70 font-mono mt-0.5 truncate">{item.path}</div>
    </div>
  );
}
