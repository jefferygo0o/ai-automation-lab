import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowLeft, ArrowRight, RefreshCw, Home,
  ExternalLink, AlertCircle, Globe, Monitor,
  Play,
  Activity,
  RotateCw,
} from "lucide-react";
import { getToken } from "../api/client";

const BASE_POLL_MS = 3000;
const MAX_POLL_MS = 30_000;
const MAX_CONSECUTIVE_ERRORS = 5; // stop polling after this many failures in a row

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
  const [aiRevision, setAiRevision] = useState(0);
  const [aiHtml, setAiHtml] = useState(""); // fetched HTML for srcdoc
  const [showAiPreview, setShowAiPreview] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [navRevision, setNavRevision] = useState(0);
  const [tick, setTick] = useState(0); // drives the age counter
  const [pollingStopped, setPollingStopped] = useState(false); // true when we gave up polling

  // Tick every second so the "Xs ago" counter updates live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ───────────────────────────────────────────────────────────────────
  // Poll for AI browser activity with exponential backoff.
  // Stops entirely after MAX_CONSECUTIVE_ERRORS failures (polling storm fix).
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE || "";
    const token = getToken();
    let lastTimestamp = 0;
    let consecutiveErrors = 0;
    let currentInterval = BASE_POLL_MS;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function scheduleNext() {
      if (stopped) return;
      if (timer) clearInterval(timer);
      timer = setInterval(checkAiBrowser, currentInterval);
    }

    async function checkAiBrowser() {
      if (stopped) return;
      try {
        const res = await fetch(`${apiBase}/api/browser/active?_=${Date.now()}`, {
          cache: "no-store",
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            stopped = true;
            setPollingStopped(true);
            if (timer) clearInterval(timer);
            return;
          }
          currentInterval = Math.min(BASE_POLL_MS * Math.pow(2, consecutiveErrors), MAX_POLL_MS);
          scheduleNext();
          return;
        }
        consecutiveErrors = 0;
        currentInterval = BASE_POLL_MS;
        setPollingStopped(false);
        const data = await res.json();
        if (data.active) {
          setAiActive(true);
          setAiUrl(data.url || "");
          setAiTitle(data.title || "");
          setAiTimestamp(data.timestamp || 0);
          if (data.timestamp && data.timestamp !== lastTimestamp) {
            lastTimestamp = data.timestamp;
            setAiRevision((r) => r + 1);
          }
        } else {
          setAiActive(false);
        }
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          stopped = true;
          setPollingStopped(true);
          if (timer) clearInterval(timer);
          return;
        }
        currentInterval = Math.min(BASE_POLL_MS * Math.pow(2, consecutiveErrors), MAX_POLL_MS);
        scheduleNext();
      }
    }

    // Check immediately, then poll
    checkAiBrowser();
    timer = setInterval(checkAiBrowser, currentInterval);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────
  // Fetch HTML content when aiRevision changes (new snapshot available).
  // This powers the srcdoc approach — no iframe src, no allow-same-origin.
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showAiPreview || !aiActive || !aiUrl) return;
    const apiBase = import.meta.env.VITE_API_BASE || "";
    const token = getToken();
    let cancelled = false;

    async function fetchContent() {
      try {
        const res = await fetch(
          `${apiBase}/api/browser/active/content?_=${Date.now()}`,
          {
            cache: "no-store",
            headers: token ? { authorization: `Bearer ${token}` } : {},
          },
        );
        if (!res.ok || cancelled) return;
        const html = await res.text();
        if (!cancelled) setAiHtml(html);
      } catch {
        // Silent — poll loop handles connectivity errors
      }
    }

    fetchContent();
    return () => { cancelled = true; };
  }, [showAiPreview, aiActive, aiRevision, aiUrl]);

  // ───────────────────────────────────────────────────────────────────
  // Resume polling after it was stopped (user clicks "Resume")
  // ───────────────────────────────────────────────────────────────────
  function resumePolling() {
    // The easiest way to restart is to unmount/remount the poll effect.
    // We do this by toggling a key. For now, just force-reload the page.
    window.location.reload();
  }

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
    if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;

    setUrl(normalized);
    setCurrentUrl(normalized);
    setLoading(true);
    setError(null);

    const newHistory = history.slice(0, historyIdx + 1);
    newHistory.push(normalized);
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    setNavRevision(r => r + 1);
  }, [history, historyIdx]);

  const goBack = () => {
    if (historyIdx > 0) {
      const idx = historyIdx - 1;
      setHistoryIdx(idx);
      const u = history[idx];
      setUrl(u);
      setCurrentUrl(u);
      setNavRevision(r => r + 1);
    }
  };

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      const idx = historyIdx + 1;
      setHistoryIdx(idx);
      const u = history[idx];
      setUrl(u);
      setCurrentUrl(u);
      setNavRevision(r => r + 1);
    }
  };

  const refresh = () => {
    setNavRevision(r => r + 1);
  };

  const goHome = () => {
    setUrl("");
    setCurrentUrl("");
    setShowAiPreview(false);
    setNavRevision(r => r + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (url.trim()) navigate(url);
    }
  };

  const isBlank = !currentUrl || currentUrl === "about:blank";
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  tick; // ensure re-render every second
  const age = aiTimestamp ? Math.floor((Date.now() - aiTimestamp) / 1000) : 0;

  // Proxy URL for manual browser iframe (server-side proxy to bypass XFO)
  const token = getToken();
  const apiBase = import.meta.env.VITE_API_BASE || "";

  const manualProxyUrl = currentUrl && currentUrl !== "about:blank"
    ? `${apiBase}/api/browser/proxy?url=${encodeURIComponent(currentUrl)}&token=${token ? encodeURIComponent(token) : ""}&_=${navRevision}`
    : defaultUrl;

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

      {/* Polling stopped banner */}
      {pollingStopped && showAiPreview && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Polling paused after repeated errors. The preview may be stale.</span>
          <button onClick={resumePolling} className="ml-auto btn btn-ghost btn-xs flex items-center gap-1">
            <RotateCw className="w-3 h-3" />
            Resume
          </button>
        </div>
      )}

      {/* Live interaction indicator — pulsing bar when AI is actively using the browser */}
      {aiActive && showAiPreview && aiUrl && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-green-50 border-b border-green-200 text-xs text-green-700">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <Activity className="w-3 h-3 shrink-0" />
          <span className="font-medium">Live interaction</span>
          <span className="text-green-600 truncate">— AI is actively browsing</span>
          <span className="ml-auto shrink-0 text-green-500 tabular-nums">{age > 60 ? `${Math.floor(age / 60)}m ${age % 60}s ago` : `${age}s ago`}</span>
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

      {/* ─────────────────────────────────────────────────────────── */}
      {/* AI preview iframe — uses srcdoc (no allow-same-origin)       */}
      {/* Fixes: sandbox escape warning + 401 on relative sub-resources */}
      {/* ─────────────────────────────────────────────────────────── */}
      {showAiPreview && aiActive && aiUrl ? (
        <div className="flex-1 relative bg-white">
          {aiHtml ? (
            <iframe
              key={`srcdoc-${aiRevision}`}
              srcDoc={aiHtml}
              sandbox="allow-scripts allow-popups allow-forms"
              className="w-full h-full border-0"
              title="AI Browser Preview"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-paper-50/30">
              <div className="text-center">
                <Activity className="w-8 h-8 mx-auto text-ink-300 mb-2 animate-pulse" />
                <p className="text-sm text-ink-400">Loading preview...</p>
              </div>
            </div>
          )}
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
            key={`manual-${navRevision}`}
            ref={iframeRef}
            src={manualProxyUrl}
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
