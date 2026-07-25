import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";
import { getToken, getApiBase } from "../api/client";

export default function TerminalPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      theme: {
        background: "#0a0a0f",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        cursorAccent: "#0a0a0f",
        selectionBackground: "#33557788",
        black: "#1a1a2e",
        red: "#ff5370",
        green: "#c3e88d",
        yellow: "#ffcb6b",
        blue: "#82aaff",
        magenta: "#c792ea",
        cyan: "#89ddff",
        white: "#e0e0e0",
        brightBlack: "#545464",
        brightRed: "#ff8b92",
        brightGreen: "#ddffa7",
        brightYellow: "#ffe299",
        brightBlue: "#a9bffc",
        brightMagenta: "#e1acff",
        brightCyan: "#b4e8fd",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    // Connect WebSocket
    const token = getToken();
    const base = getApiBase();
    const wsBase = base || window.location.origin.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/api/terminal/ws?token=${encodeURIComponent(token || "")}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      // Send initial size
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "output") {
          term.write(msg.data);
        } else if (msg.type === "exit") {
          term.writeln("\r\n\x1b[33m[Shell exited]\x1b[0m");
          setStatus("disconnected");
        }
      } catch {
        // Raw data fallback
        if (typeof ev.data === "string") term.write(ev.data);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      term.writeln("\r\n\x1b[31m[Connection closed]\x1b[0m");
    };

    ws.onerror = () => {
      setStatus("disconnected");
    };

    // Forward terminal input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle terminal resize
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Status bar */}
      <div className="flex items-center gap-2 h-9 px-3 border-b border-border bg-[#0a0a0f] shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${
            status === "connected"
              ? "bg-green-500"
              : status === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-red-500"
          }`}
        />
        <span className="text-xs text-gray-400 font-mono">
          {status === "connected" ? "Terminal" : status === "connecting" ? "Connecting…" : "Disconnected"}
        </span>
        {status === "disconnected" && (
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
          >
            Reconnect
          </button>
        )}
      </div>
      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-1 overflow-hidden"
      />
    </div>
  );
}
