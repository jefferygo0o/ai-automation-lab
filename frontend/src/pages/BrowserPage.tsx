import { useState, useRef, useCallback } from "react";
import {
  ArrowLeft, ArrowRight, RefreshCw, Home,
  ExternalLink, AlertCircle, Globe, Search,
} from "lucide-react";

export default function BrowserPage() {
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const defaultUrl = "about:blank";

  const navigate = useCallback((targetUrl: string) => {
    let normalized = targetUrl.trim();
    if (!normalized) return;
    if (!/^https?:\/\/./i.test(normalized)) normalized = "https://" + normalized;

    setUrl(normalized);
    setCurrentUrl(normalized);
    setLoading(true);
    setError(null);

    const newHistory = history.slice(0, historyIdx + 1);
    newHistory.push(normalized);
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);

    if (iframeRef.current) {
      iframeRef.current.src = normalized;
    }
  }, [history, historyIdx]);

  const goBack = () => {
    if (historyIdx > 0) {
      const idx = historyIdx - 1;
      setHistoryIdx(idx);
      const u = history[idx];
      setUrl(u);
      setCurrentUrl(u);
      if (iframeRef.current) iframeRef.current.src = u;
    }
  };

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      const idx = historyIdx + 1;
      setHistoryIdx(idx);
      const u = history[idx];
      setUrl(u);
      setCurrentUrl(u);
      if (iframeRef.current) iframeRef.current.src = u;
    }
  };

  const refresh = () => {
    if (currentUrl && iframeRef.current) {
      iframeRef.current.src = currentUrl;
    }
  };

  const goHome = () => {
    setUrl("");
    setCurrentUrl("");
    if (iframeRef.current) iframeRef.current.src = defaultUrl;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (url.trim()) navigate(url);
    }
  };

  const isBlank = !currentUrl || currentUrl === "about:blank";

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Browser chrome */}
      <div className="border-b border-line bg-paper-50 shrink-0">
        {/* Navigation bar */}
        <div className="flex items-center gap-1.5 px-2 py-2">
          <button onClick={goBack} disabled={historyIdx <= 0} className="btn btn-ghost btn-icon" title="Back">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={goForward} disabled={historyIdx >= history.length - 1} className="btn btn-ghost btn-icon" title="Forward">
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={refresh} disabled={isBlank} className="btn btn-ghost btn-icon" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={goHome} className="btn btn-ghost btn-icon" title="Home">
            <Home className="w-3.5 h-3.5" />
          </button>

          {/* URL bar */}
          <div className="flex-1 relative">
            <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a URL to browse..."
              className="input h-8 pl-8 pr-3 text-sm font-mono"
            />
          </div>

          <button
            onClick={() => url.trim() && navigate(url)}
            className="btn btn-sm"
            title="Go"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Go</span>
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-paper-100/50">
          <div className="flex items-center gap-2 text-2xs text-ink-400">
            {loading && <span className="dot dot-warn animate-pulse" />}
            <span className="truncate max-w-[400px]">{currentUrl || defaultUrl}</span>
          </div>
          <div className="flex items-center gap-2 text-2xs text-ink-400">
            <span className="text-2xs">⚡ Lab Browser</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-err/5 border-b border-err/30 text-xs text-err flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto btn btn-ghost btn-xs">Dismiss</button>
        </div>
      )}

      {/* Iframe or blank-state placeholder */}
      {isBlank ? (
        <div className="flex-1 flex items-center justify-center bg-paper-50/30">
          <div className="text-center max-w-md px-6">
            <Globe className="w-16 h-16 mx-auto text-ink-300 mb-4" />
            <h2 className="text-lg font-semibold text-ink-700 mb-2">Lab Browser</h2>
            <p className="text-sm text-ink-500 mb-6">
              Enter a URL above and click <strong>Go</strong> to browse the web.
            </p>
            <div className="text-xs text-ink-400 space-y-2">
              <p className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                <span>
                  Many sites (Google, YouTube, etc.) block embedding in iframes via
                  <code className="mx-1 px-1 py-0.5 bg-paper-200 rounded">X-Frame-Options</code>.
                  Use the <strong>Open in new tab</strong> button to view those.
                </span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative bg-white">
          <iframe
            ref={iframeRef}
            src={currentUrl}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="Lab Browser"
            onLoad={() => setLoading(false)}
            onError={() => {
              setError("Failed to load page. Some sites block iframe embedding.");
              setLoading(false);
            }}
          />
          <div className="absolute bottom-4 right-4">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm bg-paper-50/90 backdrop-blur-sm"
            >
              <ExternalLink className="w-3 h-3" />
              Open in new tab
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
