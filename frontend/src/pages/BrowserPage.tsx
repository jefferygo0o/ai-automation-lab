import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowLeft, ArrowRight, RefreshCw, Home,
  ExternalLink, AlertCircle, Globe, Monitor,
  Play,
} from "lucide-react";
import { getToken } from "../api/client";

const POLL_INTERVAL = 3000;

export default function BrowserPage() {
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const defaultUrl = "about:blank";

  // AI browser preview state
  const [aiActive, setAiActive] = useState(false);
  const [aiUrl, setAiUrl] = useState("");
  const [aiTitle, setAiTitle] = useState("");
  const [aiTimestamp, setAiTimestamp] = useState(0);
  const [showAiPreview, setShowAiPreview] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for AI browser activity
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE || "";
    const token = getToken();

    async function checkAiBrowser() {
      try {
        const res = await fetch(`${apiBase}/api/browser/active`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.active) {
          setAiActive(true);
          setAiUrl(data.url || "");
          setAiTitle(data.title || "");
          setAiTimestamp(data.timestamp || 0);
        } else {
          setAiActive(false);
        }
      } catch {
        // ignore poll errors
      }
    }

    // Check immediately, then poll
    checkAiBrowser();
    pollRef.current = setInterval(checkAiBrowser, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Automatically show AI preview when active
  useEffect(() => {
    if (aiActive && aiUrl) {
      setShowAiPreview(true);
    }
  }, [aiActive, aiUrl]);

  // Toggle between AI preview and manual browser
  function togglePreview() {
    setShowAiPreview((p) => !p);
  }

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
    setShowAiPreview(false);
    if (iframeRef.current) iframeRef.current.src = defaultUrl;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (url.trim()) navigate(url);
    }
  };

  const isBlank = !currentUrl || currentUrl === "about:blank";
  const age = aiTimestamp ? Math.floor((Date.now() - aiTimestamp) / 1000) : 0;

  // Proxy URL for iframe with auth token query param
  const token = getToken();
  const proxyUrl = showAiPreview
    ? `/api/browser/active/content${token ? `?token=${encodeURIComponent(token)}` : ""}`
    : (currentUrl || defaultUrl);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Browser chrome */}
      <div className="border-b border-line bg-paper-50 shrink-0">
        {/* Navigation bar */}
        <div className="flex items-center gap-1.5 px-2 py-2">
          {!showAiPreview && (
            <>
              <button onClick={goBack} disabled={historyIdx <= 0} className="btn btn-ghost btn-icon" title="Back">
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={goForward} disabled={historyIdx >= history.length - 1} className="btn btn-ghost btn-icon" title="Forward">
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={refresh} disabled={isBlank} className="btn btn-ghost btn-icon" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </>
          )}
          {showAiPreview && (
            <button onClick={togglePreview} className="btn btn-ghost btn-xs text-ink-500" title="Switch to manual browser">
              Exit AI View
            </button>
          )}
          <button onClick={goHome} className="btn btn-ghost btn-icon" title="Home">
            <Home className="w-3.5 h-3.5" />
          </button>

          {/* URL bar */}
          <div className="flex-1 relative">
            <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={showAiPreview ? aiUrl : url}
              onChange={(e) => { if (!showAiPreview) setUrl(e.target.value); }}
              onKeyDown={!showAiPreview ? handleKeyDown : undefined}
              placeholder={showAiPreview ? aiUrl || "Waiting for AI to browse..." : "Enter a URL to browse..."}
              readOnly={showAiPreview}
              className="input h-8 pl-8 pr-3 text-sm font-mono"
            />
          </div>

          {!showAiPreview && (
            <button
              onClick={() => url.trim() && navigate(url)}
              className="btn btn-sm"
              title="Go"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Go</span>
            </button>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-paper-100/50">
          <div className="flex items-center gap-2 text-2xs text-ink-400 min-w-0">
            {showAiPreview && <span className="dot dot-ok" />}
            {loading && <span className="dot dot-warn animate-pulse" />}
            <span className="truncate max-w-[400px]">{showAiPreview ? (aiTitle || aiUrl) : (currentUrl || defaultUrl)}</span>
          </div>
          <div className="flex items-center gap-2 text-2xs text-ink-400 shrink-0">
            {showAiPreview && aiActive && (
              <span className="flex items-center gap-1 text-green-600">
                <Play className="w-3 h-3" />
                AI Browser {age > 60 ? `${Math.floor(age / 60)}m ago` : `${age}s ago`}
              </span>
            )}
            {!showAiPreview && <span className="text-2xs">Manual</span>}
            <span className="text-2xs">Lab Browser</span>
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

      {/* AI preview banner */}
      {aiActive && !showAiPreview && (
        <button
          onClick={() => setShowAiPreview(true)}
          className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-primary/20 text-xs text-primary font-medium hover:bg-primary/10 transition-colors"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>AI is browsing {aiTitle || aiUrl}</span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-muted-foreground">View</span>
            <Play className="w-3 h-3" />
          </span>
        </button>
      )}

      {/* Iframe or blank-state */}
      {showAiPreview && aiActive && aiUrl ? (
        <div className="flex-1 relative bg-white">
          <iframe
            src={proxyUrl}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="AI Browser Preview"
          />
          <div className="absolute bottom-4 right-4 flex gap-2">
            <a
              href={aiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm bg-paper-50/90 backdrop-blur-sm"
            >
              <ExternalLink className="w-3 h-3" />
              Open original
            </a>
          </div>
        </div>
      ) : !showAiPreview && !isBlank ? (
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
      ) : (
        <div className="flex-1 flex items-center justify-center bg-paper-50/30">
          <div className="text-center max-w-md px-6">
            <Globe className="w-16 h-16 mx-auto text-ink-300 mb-4" />
            <h2 className="text-lg font-semibold text-ink-700 mb-2">
              {aiActive ? "AI Browser Preview" : "Lab Browser"}
            </h2>
            <p className="text-sm text-ink-500 mb-6">
              {aiActive
                ? "The AI is currently browsing. This view will update automatically."
                : "Enter a URL above and click Go to browse the web."}
            </p>
            {aiActive && (
              <button onClick={() => setShowAiPreview(true)} className="btn btn-primary">
                <Monitor className="w-4 h-4" />
                Show AI Browser
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
