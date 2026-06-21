import { useState, useRef, useEffect, useCallback } from "react";
import { getToken } from "../api/client";

interface RawChatModeProps {
  chatId: string;
  onClose: () => void;
}

/**
 * Raw Chat Mode — a full overlay inside the chat panel that hides all
 * filtering, markdown rendering, thinking blocks, and tool cards.
 * Responses stream directly as plain text into a <pre> block.
 * No styles, no formatting, no filtering — just raw AI output.
 * Tool calls and results are shown inline with full arguments/results.
 */
export default function RawChatMode({ chatId, onClose }: RawChatModeProps) {
  const [input, setInput] = useState("");
  const [rawOutput, setRawOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Elapsed time since streaming started — updated every second as a
  // lightweight "still alive" indicator so the user can see the agent
  // is working even when the model is thinking silently.
  const [elapsedSec, setElapsedSec] = useState(0);
  const preRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bufRef = useRef("");
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inThinkingRef = useRef(false);
  // Track last data receipt time — if >30s with no data during streaming,
  // we show a warning but keep the connection alive.
  const lastDataTimeRef = useRef(Date.now());
  // Number of keepalive pings received (shown as dots so user sees activity)
  const keepaliveCountRef = useRef(0);

  function closeThinkingBlock() {
    if (inThinkingRef.current) {
      bufRef.current += `\n╚═══════════════════════════════════════════\n\n`;
      inThinkingRef.current = false;
    }
  }

  // Auto-scroll to bottom when rawOutput changes
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [rawOutput]);

  // Flush accumulated buffer to display every 50ms while streaming
  useEffect(() => {
    if (streaming) {
      flushTimer.current = setInterval(() => {
        if (bufRef.current) {
          setRawOutput((prev) => prev + bufRef.current);
          bufRef.current = "";
        }
      }, 50);
    } else {
      if (flushTimer.current) clearInterval(flushTimer.current);
      if (bufRef.current) {
        setRawOutput((prev) => prev + bufRef.current);
        bufRef.current = "";
      }
    }
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, [streaming]);

  // Elapsed-seconds counter — ticks every 1s while streaming, resets on start
  useEffect(() => {
    if (streaming) {
      setElapsedSec(0);
      elapsedTimer.current = setInterval(() => {
        setElapsedSec((s) => s + 1);
        // If >30s with no data while streaming, show a stale warning in the buffer
        const idle = Date.now() - lastDataTimeRef.current;
        if (idle > 30_000 && idle < 31_000) {
          // Only warn once at the 30s mark — append a visual cue to the output
          bufRef.current += `\n╔═══ ⏳ STILL WAITING (${Math.floor(idle / 1000)}s idle) ═══════════════\n`;
          bufRef.current += `║ The model is still processing but no data has arrived for ${Math.floor(idle / 1000)}s.\n`;
          bufRef.current += `║ The connection is alive — long reasoning chains can take time.\n`;
          bufRef.current += `╚═══════════════════════════════════════════════════\n\n`;
        }
        // Auto-abort after 120s of absolute silence — connection is likely dead
        if (idle > 120_000) {
          cancel();
        }
      }, 1000);
    } else {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      setElapsedSec(0);
    }
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, [streaming]);

  // Focus input when not streaming
  useEffect(() => {
    if (!streaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [streaming]);

  function cancel() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  /**
   * Format a value for inline display in raw mode.
   * Objects/arrays are pretty-printed JSON; strings shown directly;
   * null/undefined shown as "null".
   */
  function formatValue(value: unknown, maxLen = 2000): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "string") {
      if (value.length > maxLen) return value.slice(0, maxLen) + `\n… [truncated ${value.length - maxLen} more chars]`;
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      const str = JSON.stringify(value, null, 2);
      if (str.length > maxLen + 200) return str.slice(0, maxLen) + `\n… [truncated ${str.length - maxLen} more chars]`;
      return str;
    } catch {
      return String(value);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    // Append user message to raw output
    setRawOutput((prev) => prev + `\n>>> ${text}\n\n`);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ content: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setError(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }

      setStreaming(true);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += dec.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const lines = evt.split("\n");
          let type = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;

          let payload: any;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          switch (type) {
            case "token":
              closeThinkingBlock();
              bufRef.current += payload.delta;
              lastDataTimeRef.current = Date.now();
              break;
            case "thinking":
              // Raw mode — show reasoning with clear visual delineation,
              // using the same box-drawing style as tool calls so the
              // AI's thinking chain is directly visible and distinct.
              if (payload.delta) {
                if (!inThinkingRef.current) {
                  // Start a new thinking block
                  bufRef.current += `\n╔═══ THINKING ═══════════════════════════════\n║ `;
                  inThinkingRef.current = true;
                  // First delta: remove leading newline if present (it looks odd after the header)
                  const trimmed = payload.delta.replace(/^\n+/, "");
                  if (trimmed) {
                    bufRef.current += trimmed.replace(/\n/g, "\n║ ");
                  }
                } else {
                  // Continue existing thinking block
                  bufRef.current += payload.delta.replace(/\n/g, "\n║ ");
                }
              }
              lastDataTimeRef.current = Date.now();
              break;
            case "keepalive":
              // Heartbeat ping — connection is alive. Show a subtle dot
              // so the user can see ongoing activity during long thinking.
              if (inThinkingRef.current) {
                bufRef.current += "·";
              }
              lastDataTimeRef.current = Date.now();
              break;
            case "tool_call":
              closeThinkingBlock();
              // Raw mode — show full tool call with arguments inline
              const tcArgs = payload.args ? formatValue(payload.args, 800) : "";
              bufRef.current += `\n╔═══ TOOL CALL: ${payload.name} ${tcArgs ? "─" : ""}\n`;
              if (tcArgs) {
                bufRef.current += `║ ${tcArgs.replace(/\n/g, "\n║ ")}\n`;
              }
              bufRef.current += `╚═══════════════════════════════════════\n\n`;
              lastDataTimeRef.current = Date.now();
              break;
            case "tool_result":
              closeThinkingBlock();
              // Raw mode — show full tool result inline
              if (payload.ok) {
                const resultStr = formatValue(payload.result, 1500);
                bufRef.current += `╔═══ TOOL RESULT: ${payload.name} ✓ (${payload.durationMs ?? ""}ms)\n`;
                bufRef.current += `║ ${resultStr.replace(/\n/g, "\n║ ")}\n`;
                bufRef.current += `╚═══════════════════════════════════════\n\n`;
              } else {
                const errMsg = payload.error ?? payload.result?.error ?? "failed";
                const errStr = formatValue(errMsg, 1000);
                bufRef.current += `╔═══ TOOL ERROR: ${payload.name} ✗\n`;
                bufRef.current += `║ ${errStr.replace(/\n/g, "\n║ ")}\n`;
                bufRef.current += `╚═══════════════════════════════════════\n\n`;
              }
              lastDataTimeRef.current = Date.now();
              break;
            case "error":
              closeThinkingBlock();
              bufRef.current += `\n╔═══ ERROR ═══════════════════════════════\n`;
              bufRef.current += `║ ${payload.message}\n`;
              bufRef.current += `╚═══════════════════════════════════════════\n\n`;
              setError(payload.message);
              lastDataTimeRef.current = Date.now();
              break;
            case "run_started":
              closeThinkingBlock();
              bufRef.current += `\n[run ${payload.runId} started]\n`;
              lastDataTimeRef.current = Date.now();
              break;
            case "message":
              // Server persisted the message — close any open thinking block
              closeThinkingBlock();
              lastDataTimeRef.current = Date.now();
              break;
            case "done":
              closeThinkingBlock();
              bufRef.current += "\n";
              break;
            default:
              // Unknown event types — still update the data receipt timer
              lastDataTimeRef.current = Date.now();
              break;
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const msg = err?.message ?? String(err);
        bufRef.current += `\n╔═══ ERROR ═══════════════════════════════\n`;
        bufRef.current += `║ ${msg}\n`;
        bufRef.current += `╚═══════════════════════════════════════════\n\n`;
        setError(msg);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    // Escape to close
    if (e.key === "Escape" && !streaming) {
      onClose();
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-[#0d0d0c]"
      style={{ fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace' }}
    >
      {/* ─── Header ─── */}
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-[#2a2a28]">
        <span className="text-xs text-[#828278] font-mono uppercase tracking-wider select-none">
          RAW STREAM
        </span>
        <span className="text-[10px] text-[#5a5a52] font-mono">
          · full visibility · raw output · tool calls + results inline
        </span>
        <div className="flex-1" />
        {streaming && (
          <>
            <span className="text-[10px] text-[#6a9f6a] no-animation select-none font-mono w-14 text-right">
              {elapsedSec}s
            </span>
            <span className="text-[10px] text-[#6a9f6a] animate-pulse select-none">
              streaming…
            </span>
          </>
        )}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 text-[#5a5a52] hover:text-[#f5f3ee] transition-colors"
          title="Exit raw mode (Esc)"
        >
          ✕
        </button>
      </div>

      {/* ─── Raw output area ─── */}
      <div className="flex-1 overflow-auto p-0">
        <pre
          ref={preRef}
          className="p-4 text-sm leading-relaxed text-[#e8e5dc] whitespace-pre-wrap break-words min-h-full m-0"
          style={{
            background: "transparent",
            border: "none",
            fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
            fontSize: "13px",
            lineHeight: "1.6",
          }}
        >
          {rawOutput || (
            <span className="text-[#5a5a52] select-none">
              {` Raw stream mode.\n Type a message and press Enter.\n All AI output, tool calls, and tool results appear here as raw text.\n\n`}
            </span>
          )}
          {streaming && (
            <span className="inline-block w-2 h-4 bg-[#e8e5dc] ml-px align-middle animate-pulse" />
          )}
        </pre>
      </div>

      {/* ─── Error bar ─── */}
      {error && (
        <div className="shrink-0 px-4 py-1.5 text-xs text-[#ff6b6b] bg-[#1a0f0f] border-t border-[#3a1a1a] font-mono">
          {error}
        </div>
      )}

      {/* ─── Input area ─── */}
      <div className="shrink-0 border-t border-[#2a2a28] px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            placeholder={streaming ? "… receiving stream …" : "Type message, Enter to send…"}
            rows={2}
            className="flex-1 bg-[#1a1a18] border border-[#3a3a32] rounded-none px-3 py-2 text-sm text-[#e8e5dc] placeholder:text-[#5a5a52] resize-none outline-none focus:border-[#6a6a62] transition-colors font-mono"
            style={{ fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace' }}
          />
          <button
            onClick={streaming ? cancel : send}
            disabled={!streaming && !input.trim()}
            className="shrink-0 h-9 px-4 text-xs font-mono uppercase tracking-wider border border-[#3a3a32] bg-[#1a1a18] text-[#e8e5dc] hover:bg-[#2a2a28] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-none"
          >
            {streaming ? "STOP" : "SEND"}
          </button>
        </div>
      </div>
    </div>
  );
}
