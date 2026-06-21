import { useEffect, useRef, useState } from "react";
import { useChatPanel } from "../contexts/ChatPanelContext";
import { Chats, Agents } from "../api";
import type { Chat, Message } from "../api";
import { getToken } from "../api/client";
import { useChatControlsStore } from "../stores/chatControlsStore";
import { getToolMeta, getToolLabel } from "../lib/toolMeta";
import { getLineDelta } from "../lib/toolMeta";

interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown> | null;
  status: "pending" | "ok" | "error";
  result?: unknown;
  error?: string | null;
  durationMs?: number;
  lineDelta?: { added: number; removed: number } | null;
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
              args: payload.args ?? null,
              status: "pending",
            };
            pushBlock(aid, { type: "tool_call", tool });
          } else if (type === "tool_result") {
            // Close active thinking block
            closeThinking(aid);
            // Find the matching tool_call block and add a result
            const blocks = blocksRef.current[aid] ?? [];
            // Walk backwards to find the tool_call with matching name
            let idx = -1;
            const len = blocks.length;
            for (let i = len - 1; i >= 0; i--) {
              const b = blocks[i];
              if (b.type === "tool_call" && b.tool.name === payload.name && b.tool.status === "pending") {
                idx = i; break;
              }
            }
            if (idx !== -1) {
              const block = blocks[idx];
              if (block.type === "tool_call") {
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
              }
            }
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
      <aside className="w-full shrink-0 border-l border-line bg-paper flex flex-col h-full overflow-hidden relative">
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
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const isAssistant = m.role === "assistant";
                if (m.role === "tool") return null;
                const blocks: Block[] = blocksByMessage[m.id] ?? [];
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
                            const isOpen = expandedTool.has(t.id);
                            const label = getToolLabel(t.name, meta, t.args);
                            return (
                              <div key={t.id} className="w-full">
                                <button type="button" className="flex items-center gap-1.5 w-full min-h-7 px-2 py-0.5 cursor-pointer rounded-md hover:bg-paper-200/30 text-left" aria-expanded={isOpen} onClick={() => setExpandedTool((p) => toggleSet(p, t.id))}>
                                  <Icon className="shrink-0 text-ink-400/500" size={16} />
                                  <span className="text-xs font-medium text-ink-500 capitalize">{((block.type === "tool_call" && !t.status || t.status === "pending") ? meta.verb : meta.verbPast) + (label ? '' : ' ' + t.name)}</span>
                                  {label && (
                                            <span className="text-xs text-ink-400/50 font-mono truncate min-w-0 inline-flex items-center gap-1">
                                              <span>{label}</span>
                                              {!isPending && t.lineDelta && (t.lineDelta.added > 0 || t.lineDelta.removed > 0) && (
                                                <span className="text-[10px] tabular-nums flex items-center gap-0.5">
                                                  <span className="text-emerald-700">+{t.lineDelta.added}</span>
                                                  {t.lineDelta.removed > 0 && <span className="text-red-600">−{t.lineDelta.removed}</span>}
                                                </span>
                                              )}
                                            </span>
                                          )}
                                  <span className="ml-auto flex items-center gap-1.5">
                                    {!isPending && !isError && t.durationMs !== undefined && <span className="text-2xs text-ink-400/500 font-mono shrink-0 tabular-nums">{t.durationMs}ms</span>}
                                    {isPending && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium" style={{backgroundImage:'linear-gradient(90deg, transparent 0%, transparent calc(50% - 16px), #5a5a52 50%, transparent calc(50% + 16px), transparent 100%),linear-gradient(#828278,#828278)',backgroundSize:'250% 100%,auto',backgroundRepeat:'no-repeat,no-repeat',backgroundClip:'text',color:'transparent',animation:'shimmer-sweep 1.5s linear infinite'}}>running</span>}
                                    {isError && <span className="text-2xs text-err font-mono shrink-0">error</span>}
                                  </span>
                                </button>
                                <div hidden={!isOpen} className={isOpen ? "" : "hidden"}>
                                  <div className="pl-9 pr-2 pb-1.5 text-xs text-ink-500 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-y-auto">
                                    {isError && t.error && <div className="text-err mb-1">{t.error}</div>}
                                    {!isPending && !isError && t.result !== undefined && (
                                      (() => {
                                          const val = t.result;
                                          if (val === undefined || val === null) return '';
                                          if (typeof val === 'string') return val.slice(0, 2000);
                                          if (typeof val === 'object') {
                                            const r = val as Record<string, unknown>;
                                            // Many tools return {ok: true} or similar — show the meaningful text
                                            const text = r.content || r.text || r.message || r.result;
                                            if (typeof text === 'string') return text.slice(0, 2000);
                                            if (typeof text === 'object' && text !== null) return JSON.stringify(text, null, 2).slice(0, 2000);
                                            // Strip transport wrapper
                                            const { ok, isError, error, ...rest } = r;
                                            const keys = Object.keys(rest);
                                            if (keys.length === 0) return '';
                                            if (keys.length === 1) {
                                              const v = rest[keys[0]];
                                              if (typeof v === 'string') return v.slice(0, 2000);
                                            }
                                            return JSON.stringify(r, null, 2).slice(0, 2000);
                                          }
                                          return String(val).slice(0, 2000);
                                        })()
                                    )}
                                    {isPending && <span className="text-ink-400">running…</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          if (block.type === "text") {
                            return (
                              <p key={`text_${m.id}_${bi}`} className="text-sm text-ink-900 leading-relaxed m-0">
                                {block.content}
                                {isLive && bi === blocks.length - 1 && <span className="inline-block w-1.5 h-4 bg-ink-700 ml-0.5 align-middle animate-pulse" />}
                              </p>
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
                <button onClick={streaming ? () => streamAbortRef.current?.abort() : send} disabled={!streaming && !input.trim()} className="shrink-0 px-3 py-1.5 text-xs border border-line rounded-sm text-ink-700 hover:bg-paper-200 disabled:opacity-30">
                  {streaming ? "Stop" : "Send"}
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
            <div className="flex-1 flex items-center justify-center text-xs text-ink-400">No chat selected</div>
          </>
        )}
      </aside>
    </>
  );
}
