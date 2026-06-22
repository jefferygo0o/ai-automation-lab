import { useEffect, useRef, useState, useMemo } from "react";
import { useChatPanel } from "../contexts/ChatPanelContext";
import { Chats, Agents } from "../api";
import type { Chat, Message } from "../api";
import { getToken } from "../api/client";
import { useChatControlsStore } from "../stores/chatControlsStore";
import { cn } from "../lib/utils";
import { getToolMeta, getToolLabel, getToolMedia, getLineDelta, getLiveLineCounts, getLivePreview, getToolPreview } from "../lib/toolMeta";
import MediaPreview from "./MediaPreview";
import MarkdownContent from "./MarkdownContent";

interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown> | null;
  status: "pending" | "ok" | "error";
  result?: unknown;
  error?: string | null;
  durationMs?: number;
  lineDelta?: { added: number; removed: number } | null;
  startedAt: number;
}

/**
 * Tool arguments can arrive in three shapes depending on whether they came
 * from a live SSE event (parsed by JSON.stringify of an object), from a
 * re-hydrated chat (stringified in the DB as `arguments`), or already an
 * object. Normalise all three into a plain Record<string, unknown> | null.
 */
function parseToolArgs(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}

type Block =
  | { type: "thinking"; content: string; done: boolean }
  | { type: "tool_call"; tool: ToolCallInfo }
  | { type: "tool_result"; tool: ToolCallInfo }
  | { type: "text"; content: string };

interface MessageBlocks {
  blocks: Block[];
}

export default function ChatPanel() {
  const { isOpen, chatId, closeChat, openChat } = useChatPanel();

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);
  const [blocksByMessage, setBlocksByMessage] = useState<Record<string, Block[]>>({});
  const [tick, setTick] = useState(0);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [expandedRun, setExpandedRun] = useState<Set<string>>(new Set());
  const [expandedTool, setExpandedTool] = useState<Set<string>>(new Set());

  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const pendingAssistantId = useRef<string | null>(null);
  const lastSeenCancelRef = useRef<number>(0);
  const blocksRef = useRef<Record<string, Block[]>>({});
  const msgCounterRef = useRef<number>(0);
  const toolSeqRef = useRef<number>(0);
  const currentRunIdRef = useRef<string>("");

  // Live ticking — drives running-tool duration labels. Only ticks while
  // we actually have something pending (LLM streaming OR a tool call
  // that hasn't returned yet) so idle chats stay still.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    function loop() {
      const blocks = blocksRef.current;
      let anyPending = false;
      for (const arr of Object.values(blocks)) {
        for (const b of arr) {
          if (b.type === "tool_call" && b.tool.status === "pending") { anyPending = true; break; }
        }
        if (anyPending) break;
      }
      if (streaming || anyPending) setTick((t) => t + 1);
      else if (id) { clearInterval(id); id = null; }
    }
    loop();
    id = setInterval(loop, 250);
    return () => { if (id) clearInterval(id); };
  }, [streaming]);

  // True while anything is in flight: the LLM stream OR any pending tool call.
  // Drives the Send-button label so it shows "Stop" even when the LLM has
  // finished but a tool (e.g. lab_generate_video) is still running.
  const hasRunningTools = useMemo(() => {
    if (streaming) return true;
    for (const arr of Object.values(blocksRef.current)) {
      for (const b of arr) {
        if (b.type === "tool_call" && b.tool.status === "pending") return true;
      }
    }
    return false;
  // recompute on tick so the button label updates as tools start/finish
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, tick]);

  async function load() {
    if (!chatId) return;
    const { chat: c, messages: msgs } = await Chats.get(chatId);
    setChat(c);
    setMessages(msgs);
    const { agents } = await Agents.list();
    setAgentsList(agents);
  }

  useEffect(() => {
    if (!chatId) {
      setChat(null); setMessages([]); setInput(""); setStreaming(false);
      setBlocksByMessage({}); setExpandedThinking(new Set());
      pendingAssistantId.current = null;
      streamAbortRef.current?.abort(); streamAbortRef.current = null;
      return;
    }
    setChat(null); setMessages([]); setInput(""); setStreaming(false);
    setBlocksByMessage({}); pendingAssistantId.current = null;
    load();
  }, [chatId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, blocksByMessage]);

  useEffect(() => {
    if (!streaming && inputRef.current) inputRef.current.focus();
  }, [streaming]);

  const cancelTick = useChatControlsStore((s) => chatId ? s.cancelTick[chatId] ?? 0 : 0);
  useEffect(() => {
    if (cancelTick !== lastSeenCancelRef.current) {
      lastSeenCancelRef.current = cancelTick;
      if (cancelTick > 0) streamAbortRef.current?.abort();
    }
  }, [cancelTick]);

  function pushBlock(aid: string, block: Block) {
    setBlocksByMessage((p) => ({ ...p, [aid]: [...(p[aid] ?? []), block] }));
    blocksRef.current[aid] = [...(blocksRef.current[aid] ?? []), block];
  }

  function replaceLastBlock(aid: string, updater: (b: Block) => Block) {
    const arr = blocksRef.current[aid] ?? [];
    if (arr.length === 0) return;
    const updated = arr.map((b, i) => i === arr.length - 1 ? updater(b) : b);
    setBlocksByMessage((p) => ({ ...p, [aid]: updated }));
    blocksRef.current[aid] = updated;
  }

  function getLastBlock(aid: string): Block | null {
    const arr = blocksRef.current[aid] ?? [];
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }

  function closeThinking(aid: string) {
    const arr = blocksRef.current[aid] ?? [];
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      if (last.type === "thinking" && !last.done) {
        const updated = arr.map((b, i) => i === arr.length - 1 ? { ...b, done: true } : b);
        setBlocksByMessage((p) => ({ ...p, [aid]: updated }));
        blocksRef.current[aid] = updated;
      }
    }
  }

  async function send() {
    if (!input.trim() || streaming || !chatId) return;
    const text = input;
    setInput(""); setStreaming(true);
    // Ensure fresh state for this new message
    pendingAssistantId.current = null;
    msgCounterRef.current += 1;

    const userMsgId = `user_${msgCounterRef.current}`;
    setMessages((m) => [...m, {
      id: userMsgId, chatId, role: "user", content: text, createdAt: Date.now(),
    } as Message]);

    const controller = new AbortController();
    streamAbortRef.current = controller;
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ content: text }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) { setStreaming(false); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    const getAid = () => {
      if (!pendingAssistantId.current) {
        msgCounterRef.current += 1; const tid = `assist_${msgCounterRef.current}`;
        pendingAssistantId.current = tid;
        setMessages((m) => [...m, {
          id: tid, chatId, role: "assistant", content: "", createdAt: Date.now(),
        } as Message]);
        blocksRef.current[tid] = [];
      }
      return pendingAssistantId.current;
    };

    toolSeqRef.current = 0;
    currentRunIdRef.current = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const lines = evt.split("\n");
          let type = "message", data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload: any;
          try { payload = JSON.parse(data); } catch { continue; }

          const aid = getAid();

          if (type === "token") {
            // Live vs. final line counts (ticks while pending).
            const last = getLastBlock(aid);
            if (last?.type === "text") {
              replaceLastBlock(aid, (b) => b.type === "text" ? { ...b, content: b.content + payload.delta } : b);
            } else {
              pushBlock(aid, { type: "text", content: payload.delta });
            }
          } else if (type === "thinking") {
            const delta = payload.delta ?? "";
            const last = getLastBlock(aid);
            if (last?.type === "thinking" && !last.done) {
              replaceLastBlock(aid, (b) => b.type === "thinking" ? { ...b, content: b.content + delta } : b);
            } else {
              pushBlock(aid, { type: "thinking", content: delta, done: false });
            }
          } else if (type === "tool_call") {
            // Close active thinking block
            closeThinking(aid);
            toolSeqRef.current++;
            const tool: ToolCallInfo = {
              id: `tool_${aid}_${toolSeqRef.current}`,
              name: payload.name,
              args: parseToolArgs(payload.args),
              status: "pending",
              startedAt: Date.now(),
            };
            pushBlock(aid, { type: "tool_call", tool });
            // Expand immediately — like thinking blocks, stream live to the chat
            setExpandedTool((p) => new Set([...p, tool.id]));
            // Yield to React so the pending tool_call card renders before any
            // tool_result that follows in the same SSE chunk — without this,
            // React batches both state updates into one paint and the user
            // never sees the "Writing…" (pending) state.
            await new Promise(r => setTimeout(r, 0));
          } else if (type === "tool_result") {
            closeThinking(aid);
            // Update immediately — no rAF deferring, so the card is always visible
            const blocks = blocksRef.current[aid] ?? [];
            // Walk backwards to find the tool_call with matching name
            let idx = -1;
            for (let i = blocks.length - 1; i >= 0; i--) {
              const b = blocks[i];
              if (b.type === "tool_call" && b.tool.name === payload.name && b.tool.status === "pending") {
                idx = i; break;
              }
            }
            if (idx === -1) continue;
            const block = blocks[idx];
            if (block.type !== "tool_call") continue;
            const updated: ToolCallInfo = {
              ...block.tool,
              status: payload.ok ? "ok" : "error",
              result: payload.result,
              error: payload.ok ? null : (payload.error ?? payload.result?.error ?? "failed"),
              durationMs: payload.durationMs ?? 0,
              lineDelta: getLineDelta(payload.result),
            };
            const newBlocks = [...blocks];
            newBlocks[idx] = { type: "tool_call", tool: updated };
            setBlocksByMessage((p) => ({ ...p, [aid]: newBlocks }));
            blocksRef.current[aid] = newBlocks;
            // Keep expanded so the user can see the result — they can collapse manually
          } else if (type === "run_started") {
            currentRunIdRef.current = payload.runId;
          } else if (type === "message") {
            if (pendingAssistantId.current && payload.messageId) {
              const oldId = pendingAssistantId.current;
              const oldBlocks = blocksRef.current[oldId] ?? [];
              // Mark thinking blocks as done
              const closedBlocks = oldBlocks.map((b) =>
                b.type === "thinking" ? { ...b, done: true } : b
              );
              setMessages((m) => m.map((x) => x.id === oldId ? { ...x, id: payload.messageId } : x));
              setBlocksByMessage((p) => {
                const n = { ...p };
                delete n[oldId];
                n[payload.messageId] = closedBlocks;
                return n;
              });
              blocksRef.current[payload.messageId] = closedBlocks;
              delete blocksRef.current[oldId];
              pendingAssistantId.current = payload.messageId;
            }
          } else if (type === "error") {
            pushBlock(aid, { type: "text", content: `\n[Error: ${payload.message}]\n` });
          } else if (type === "done") {
            // Mark last thinking block as done
            const blocks = blocksRef.current[aid] ?? [];
            if (blocks.length > 0) {
              const last = blocks[blocks.length - 1];
              if (last.type === "thinking") {
                const closed = blocks.map((b, i) =>
                  i === blocks.length - 1 && b.type === "thinking" ? { ...b, done: true } : b
                );
                setBlocksByMessage((p) => ({ ...p, [aid]: closed }));
                blocksRef.current[aid] = closed;
              }
            }
            pendingAssistantId.current = null;
            setStreaming(false);
          }
        }
      }
    } catch { /* stream ended */ }
    setStreaming(false);
  }

  function toggleSet(s: Set<string>, key: string): Set<string> {
    const n = new Set(s);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="hidden max-lg:block fixed inset-0 bg-black/20 z-30" onClick={closeChat} />
      <aside className="w-full shrink-0 border-l border-line bg-paper-50 flex flex-col h-full min-h-0 overflow-hidden relative">
        {chatId && chat ? (
          <>
            {/* Header */}
            <div className="h-10 shrink-0 border-b border-line flex items-center gap-2 px-3">
              <button onClick={closeChat} className="text-xs text-ink-400 hover:text-ink-900">✕</button>
              <span className="text-xs font-medium text-ink-900 truncate flex-1">{chat.title || "Chat"}</span>
              <select value={chat.activeAgentId ?? chat.agentId} onChange={(e) => { const v = e.target.value; if (chatId) Chats.setActiveAgent(chatId, v); }} className="text-xs max-w-[120px] bg-transparent border border-line rounded-sm px-1 py-0.5">
                {agentsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const isAssistant = m.role === "assistant";
                if (m.role === "tool") return null;
                const liveBlocks: Block[] = blocksByMessage[m.id] ?? [];
                const persistedToolCalls = isAssistant && liveBlocks.length === 0 && Array.isArray(m.toolCalls)
                  ? (m.toolCalls as Array<{ id?: string; name: string; args?: any }>)
                  : [];
                const blocks: Block[] = liveBlocks.length > 0
                  ? liveBlocks
                  : persistedToolCalls.map((tc, i) => ({
                      type: "tool_call" as const,
                      tool: {
                        id: tc.id ?? `${m.id}_tool_${i}`,
                        name: tc.name,
                        args: parseToolArgs(tc.args),
                        status: "ok" as const,
                        startedAt: m.createdAt,
                        durationMs: 0,
                      },
                    }));
                const isLive = streaming && m.id === pendingAssistantId.current;

                return (
                  <div key={m.id} className={`mb-4 ${isUser ? "flex justify-end" : ""}`}>
                    {isUser && (
                      <div className="max-w-[90%] bg-paper-200 border border-line rounded-sm px-3 py-2 text-sm text-ink-900 leading-relaxed">
                        {m.content}
                      </div>
                    )}
                    {isAssistant && (
                      <div className="min-w-0 space-y-2">
                        {blocks.length === 0 && isLive && (
                          <span className="inline-block w-1.5 h-4 bg-ink-700 align-middle animate-pulse" />
                        )}
                        {blocks.map((block, bi) => {
                          if (block.type === "thinking") {
                            const isActive = isLive && !block.done;
                            const thinkKey = `${m.id}_think_${bi}`;
                            const isOpen = expandedThinking.has(thinkKey) || isActive;
                            return (
                              <div key={thinkKey} className="max-w-4xl mx-auto w-full">
                                <button type="button" className="flex items-center gap-2 w-full min-h-7 px-3 py-0.5 cursor-pointer rounded-md hover:bg-paper-200/50 text-left" aria-expanded={isOpen} onClick={() => setExpandedThinking((p) => toggleSet(p, thinkKey))}>
                                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-500">
                                    {isActive ? (
                                      <span className="relative inline-block" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, transparent calc(50% - 22px), #5a5a52 50%, transparent calc(50% + 22px), transparent 100%), linear-gradient(#828278, #828278)", backgroundSize: "250% 100%, auto", backgroundRepeat: "no-repeat, no-repeat", backgroundClip: "text", color: "transparent", animation: "shimmer-sweep 1.5s linear infinite" }}>Thinking...</span>
                                    ) : "Thought"}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" color="currentColor" className={`text-ink-400/500 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}>
                                      <path d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                                    </svg>
                                  </span>
                                  {!isActive && <span className="min-w-0 flex-1 truncate text-xs text-ink-400/50">{block.content.slice(0, 50)}</span>}
                                  {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse ml-auto" />}
                                </button>
                                <div hidden={!isOpen} className={isOpen ? "" : "hidden"}>
                                  <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap break-words text-ink-600 font-sans">
                                    {block.content}{isActive && <span className="inline-block w-1.5 h-4 bg-ink-400 ml-0.5 align-middle animate-pulse" />}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          if (block.type === "tool_call") {
                            const t = block.type === "tool_call" ? block.tool : block.tool;
                            const isPending = t.status === "pending";
                            const isError = t.status === "error";
                            const meta = getToolMeta(t.name);
                            const Icon = meta.icon;
                            const label = getToolLabel(t.name, meta, t.args);
                            const liveCounts = isPending ? getLiveLineCounts(t.name, t.args) : null;
                            const finalCounts = !isPending && !isError ? t.lineDelta : null;
                            const spanContent = isPending
                              ? (getLivePreview(t.name, t.args) ?? null)
                              : !isError
                                ? (getToolPreview(t.result, t.name, t.args) ?? null)
                                : null;
                            const verbWord = isPending ? meta.verb : meta.verbPast;
                            const verbCap = verbWord.charAt(0).toUpperCase() + verbWord.slice(1);
                            const liveCountText = isPending && liveCounts
                              ? (liveCounts.removed > 0
                                  ? `+${liveCounts.added} −${liveCounts.removed}`
                                  : `+${liveCounts.added}`)
                              : null;
                            const elapsedMs = isPending ? Date.now() - t.startedAt : (t.durationMs ?? 0);
                            const elapsedLabel = isPending
                              ? `${(elapsedMs / 1000).toFixed(1)}s`
                              : elapsedMs < 1000
                                ? `${elapsedMs}ms`
                                : `${(elapsedMs / 1000).toFixed(2)}s`;

                            // New: render write tools (lab_write_file, write_file) in thinking style —
                            // auto-expanded while pending, shimmer verb, live cursor, collapses when done.
                            const isThinkStyle = t.name === "lab_write_file" || t.name === "write_file";
                            if (isThinkStyle) {
                              const isActive = isPending;
                              const thinkKey = t.id;
                              const isOpen = expandedTool.has(thinkKey) || isActive;
                              const shimmerStyle: React.CSSProperties = {
                                backgroundImage:
                                  "linear-gradient(90deg, transparent 0%, transparent calc(50% - 22px), #5a5a52 50%, transparent calc(50% + 22px), transparent 100%), linear-gradient(#828278, #828278)",
                                backgroundSize: "250% 100%, auto",
                                backgroundRepeat: "no-repeat, no-repeat",
                                backgroundClip: "text",
                                color: "transparent",
                                animation: "shimmer-sweep 1.5s linear infinite",
                              };
                              return (
                                <div key={thinkKey} className="max-w-4xl mx-auto w-full">
                                  <button
                                    type="button"
                                    className="flex items-center gap-2 w-full min-h-7 px-3 py-0.5 cursor-pointer rounded-md hover:bg-paper-200/50 text-left"
                                    aria-expanded={isOpen}
                                    onClick={() => !isActive && setExpandedTool((p) => toggleSet(p, thinkKey))}
                                  >
                                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-500">
                                      <Icon size={14} className="shrink-0 text-ink-400/500" />
                                      {isActive ? (
                                        <span className="relative inline-block" style={shimmerStyle}>
                                          {verbCap}...
                                        </span>
                                      ) : (
                                        verbCap
                                      )}
                                      {label && (
                                        <span className="text-ink-400/70 font-mono font-normal inline-flex items-center gap-1 min-w-0">
                                          <span className="mx-0.5" aria-hidden="true">&gt;</span>
                                          <span className="truncate min-w-0">{label}</span>
                                        </span>
                                      )}
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        color="currentColor"
                                        className={`text-ink-400/500 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                                      >
                                        <path
                                          d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18"
                                          stroke="currentColor"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth="1.5"
                                        />
                                      </svg>
                                    </span>
                                    {!isActive && spanContent !== null && (
                                      <span className="min-w-0 flex-1 truncate text-xs text-ink-400/50">{spanContent.slice(0, 50)}</span>
                                    )}
                                    {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse ml-auto" />}
                                  </button>
                                  <div hidden={!isOpen} className={isOpen ? "" : "hidden"}>
                                    <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap break-words text-ink-600 font-sans">
                                      {spanContent ?? null}
                                      {isActive && <span className="inline-block w-1.5 h-4 bg-ink-400 ml-0.5 align-middle animate-pulse" />}
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={t.id}
                                className={cn(
                                  "rounded-md border",
                                  isPending
                                    ? "bg-blue-50/30 border-l-2 border-l-blue-400"
                                    : isError
                                      ? "bg-red-50/30 border-l-2 border-l-red-400"
                                      : "bg-paper-50/60 border-line",
                                )}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "flex items-center gap-1.5 w-full min-h-7 px-2 py-0.5 rounded-md text-left",
                                    isPending
                                      ? "cursor-default hover:bg-blue-100/30"
                                      : "cursor-pointer hover:bg-paper-200/30",
                                  )}
                                  aria-expanded={isOpen}
                                  onClick={() => !isPending && setExpandedTool((p) => toggleSet(p, t.id))}
                                >
                                  <Icon className="shrink-0 text-ink-400/500" size={16} />
                                  <span className="text-xs font-medium text-ink-500 whitespace-nowrap">
                                    {verbCap}
                                    {isPending && (
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-1.5 align-middle" />
                                    )}
                                    {liveCountText && (
                                      <span className="ml-1 text-emerald-700 font-mono tabular-nums">
                                        {liveCountText}
                                      </span>
                                    )}
                                    {label ? "" : ` ${t.name}`}
                                    {label && (
                                      <span className="text-ink-400/70 font-mono font-normal inline-flex items-center gap-1 min-w-0">
                                        <span className="mx-1" aria-hidden="true">&gt;</span>
                                        <span className="truncate min-w-0">{label}</span>
                                      </span>
                                    )}
                                  </span>
                                  {/* Line counts: live counts are shown inline for pending write/edit tools. */}
                                  {!isPending && (liveCounts || finalCounts) && (
                                    <span className="text-[10px] tabular-nums flex items-center gap-0.5 shrink-0">
                                      {(() => {
                                        const c = liveCounts ?? finalCounts!;
                                        const onlyAdded = (c.removed ?? 0) === 0;
                                        return (
                                          <>
                                            {c.added > 0 && (
                                              <span className="text-emerald-700">{onlyAdded ? "+" : "+"}{c.added}</span>
                                            )}
                                            {(c.removed ?? 0) > 0 && (
                                              <span className="text-red-600">−{c.removed}</span>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </span>
                                  )}
                                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                                    {/* Duration: ticks while pending, freezes to t.durationMs after. */}
                                    {!isError && (
                                      <span className={`text-2xs font-mono tabular-nums ${isPending ? "text-ink-500" : "text-ink-400/500"}`}>
                                        {elapsedLabel}
                                      </span>
                                    )}
                                    {isError && <span className="text-2xs text-err font-mono">error</span>}
                                  </span>
                                </button>
                                <div hidden={!isOpen} className={isOpen ? "" : "hidden"}>
                                  <div className="pl-9 pr-2 pb-1.5 text-xs text-ink-500 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-y-auto">
                                    {/* Media previews (images / videos / audio). Show for completed runs. */}
                                    {!isPending && !isError && (() => {
                                      const media = getToolMedia(t.result);
                                      if (!media || media.length === 0) return null;
                                      const activeAgentId = chat?.activeAgentId ?? chat?.agentId;
                                      if (!activeAgentId) return null;
                                      return (
                                        <div className="not-italic not-mono -ml-1 mb-2 font-sans max-h-none overflow-visible whitespace-normal">
                                          {media.map((item, i) => (
                                            <MediaPreview key={`${t.id}_media_${i}`} agentId={activeAgentId} item={item} />
                                          ))}
                                        </div>
                                      );
                                    })()}
                                    {/* Error message */}
                                    {isError && t.error && <div className="text-err mb-1 not-italic font-sans">{t.error}</div>}
                                    {/* Live preview while pending, result text after. */}
                                    {spanContent !== null ? (
                                      <pre className="m-0 font-mono whitespace-pre-wrap break-words text-ink-600">{spanContent.slice(0, 4000)}{spanContent.length > 4000 ? "\n…" : ""}</pre>
                                    ) : !isPending && !isError && t.result !== undefined ? (
                                      (() => {
                                        const val = t.result;
                                        if (val === undefined || val === null) return null;
                                        if (typeof val === "string") return val.slice(0, 2000);
                                        if (typeof val === "object") {
                                          const r = val as Record<string, unknown>;
                                          const text = r.content || r.text || r.message || r.result;
                                          if (typeof text === "string") return text.slice(0, 2000);
                                          if (typeof text === "object" && text !== null) return JSON.stringify(text, null, 2).slice(0, 2000);
                                          const { ok, isError, error, ...rest } = r;
                                          const keys = Object.keys(rest);
                                          if (keys.length === 0) return null;
                                          if (keys.length === 1) {
                                            const v = rest[keys[0]];
                                            if (typeof v === "string") return v.slice(0, 2000);
                                          }
                                          return JSON.stringify(r, null, 2).slice(0, 2000);
                                        }
                                        return String(val).slice(0, 2000);
                                      })()
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          if (block.type === "text") {
                            return (
                              <MarkdownContent key={`text_${m.id}_${bi}`} content={block.content + (isLive && bi === blocks.length - 1 ? "▍" : "")} />
                            );
                          }

                          return null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEnd} />
            </div>

            {/* Input */}
            <div className="border-t border-line px-3 py-2">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={streaming} placeholder={streaming ? "…" : "Type message…"} rows={2} className="flex-1 bg-transparent border border-line rounded-sm px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-300 resize-none outline-none font-sans" />
                <button onClick={hasRunningTools ? () => streamAbortRef.current?.abort() : send} disabled={!hasRunningTools && !input.trim()} className="shrink-0 px-3 py-1.5 text-xs border border-line rounded-sm text-ink-700 hover:bg-paper-200 disabled:opacity-30">
                  {hasRunningTools ? "Stop" : "Send"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-10 shrink-0 border-b border-line flex items-center gap-2 px-3">
              <span className="text-xs font-medium text-ink-700 flex-1">Chat</span>
              <button onClick={closeChat} className="text-xs text-ink-400 hover:text-ink-900">✕</button>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-ink-400">No chat selected</div>
          </>
        )}
      </aside>
    </>
  );
}
