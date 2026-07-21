import { useEffect, useRef, useState, useMemo } from "react";
import { ArrowRight, Bot, Check, ChevronDown, ChevronRight, Plus, Terminal, X } from "lucide-react";
import { useChatPanel } from "../contexts/ChatPanelContext";
import { Chats, Agents } from "../api";
import type { Chat, Message } from "../api";
import { getToken } from "../api/client";
import { useChatControlsStore } from "../stores/chatControlsStore";
import { getToolMeta, getToolLabel, getToolMedia, getLineDelta, getLiveLineCounts, getLivePreview, getToolPreview } from "../lib/toolMeta";
import MediaPreview from "./MediaPreview";
import MarkdownContent from "./MarkdownContent";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";
import AnimatedDots from "./AnimatedDots";

interface ToolCallInfo {
  id: string;
  toolCallId?: string;
  name: string;
  args: Record<string, unknown> | null;
  status: "pending" | "ok" | "error";
  result?: unknown;
  error?: string | null;
  durationMs?: number;
  lineDelta?: { added: number; removed: number } | null;
  startedAt: number;
  rawArgs?: string;
  /** Progressive reveal - how many chars of content have been shown so far, -1 = all at once */
  revealed?: number;
}

/**
 * Minimum time (ms) the tool call card should show the "pending" state
 * before transitioning to "completed". Fast synchronous tools like
 * lab_write_file would otherwise flicker past "Writing…" in <1 frame.
 */
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
  | { type: "approval"; approvalId: string; title: string; body: string; status: "pending" | "approved" | "rejected" | "expired"; toolName?: string }
  | { type: "text"; content: string };

interface MessageBlocks {
  blocks: Block[];
}

export default function ChatPanel({ onCollapse }: { onCollapse?: () => void } = {}) {
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{preview: string; name: string; file: File}>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if ((!input.trim() && attachedFiles.length === 0) || streaming || !chatId) return;
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
    const useFormData = attachedFiles.length > 0;
    const res = useFormData
      ? await (() => {
          const fd = new FormData();
          if (text.trim()) fd.append("content", text);
          for (const af of attachedFiles) fd.append(af.name, af.file);
          setAttachedFiles([]);
          return fetch(`/api/chats/${chatId}/messages`, {
            method: "POST",
            headers: { authorization: `Bearer ${getToken()}` },
            body: fd,
            signal: controller.signal,
          });
        })()
      : await fetch(`/api/chats/${chatId}/messages`, {
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

        // Process one event at a time from the buffer, yielding the event
        // loop between events. This mirrors how thinking events naturally
        // arrive in separate reader.read() macrotasks — the browser gets a
        // paint cycle between tool_call and tool_result, so the user always
        // sees the "pending" tool card.
        while (true) {
          const sepIdx = buf.indexOf("\n\n");
          if (sepIdx < 0) break;
          const evt = buf.slice(0, sepIdx);
          buf = buf.slice(sepIdx + 2);

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
            // Check if this is a streaming delta for an existing tool
            const aidBlocks = blocksRef.current[aid] ?? [];
            // Match by toolCallId when available, else by name+pending (backward compat)
            const existingIdx = aidBlocks.findIndex((b): boolean => {
              if (b.type !== "tool_call") return false;
              return payload.toolCallId
                ? b.tool.toolCallId === payload.toolCallId
                : b.tool.name === payload.name && b.tool.status === "pending";
            });
            if (existingIdx >= 0) {
              // Update existing block (streaming delta or name/args finalisation)
              const existing = aidBlocks[existingIdx] as Extract<Block, { type: "tool_call" }>;
              const mergedName = payload.name || existing.tool.name;
              let mergedArgs = existing.tool.args;
              let rawArgs = existing.tool.rawArgs ?? '';
              if (payload.args) {
                const newRaw = typeof payload.args === 'string' ? payload.args : JSON.stringify(payload.args ?? {});
                rawArgs = rawArgs.length >= newRaw.length ? rawArgs : newRaw;
                const parsedArgs = (() => {
                  try { return JSON.parse(rawArgs); } catch { return null; }
                })();
                const liveArgsStream = parsedArgs && typeof parsedArgs === 'object' ? parsedArgs : null;
                mergedArgs = {
                  ...(existing.tool.args ?? {}),
                  ...(liveArgsStream ?? {}),
                };
              }
              const updatedTool: ToolCallInfo = {
                ...existing.tool,
                name: mergedName,
                args: mergedArgs,
                rawArgs,
              };
              const newBlocks = [...aidBlocks];
              newBlocks[existingIdx] = { type: "tool_call", tool: updatedTool };
              setBlocksByMessage((p) => ({ ...p, [aid]: newBlocks }));
              blocksRef.current[aid] = newBlocks;
            } else {
              toolSeqRef.current++;
              // New tool call
              const tool: ToolCallInfo = {
                id: `tool_${aid}_${toolSeqRef.current}`,
                toolCallId: payload.toolCallId,
                name: payload.name,
                args: parseToolArgs(payload.args),
                rawArgs: typeof payload.args === 'string' ? payload.args : undefined,
                status: "pending",
                startedAt: Date.now(),
              };
              pushBlock(aid, { type: "tool_call", tool });
              // Expand immediately — stream live to the chat like thinking blocks
              setExpandedTool((p) => new Set([...p, tool.id]));
            }

          } else if (type === "tool_result") {
            closeThinking(aid);
            const blocks = blocksRef.current[aid] ?? [];
            let idx = -1;
            // Match by toolCallId when available (fast path), else by name+pending (backward compat)
            if (payload.toolCallId) {
              idx = blocks.findIndex((b) => b.type === "tool_call" && b.tool.toolCallId === payload.toolCallId);
            } else {
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type !== "tool_call") continue;
                if (b.tool.name === payload.name && b.tool.status === "pending") {
                  idx = i; break;
                }
              }
            }
            if (idx === -1) continue;
            const block = blocks[idx] as Extract<Block, { type: "tool_call" }>;
            const updated: ToolCallInfo = {
              ...block.tool,
              status: payload.ok ? ("ok" as const) : ("error" as const),
              result: payload.result,
              error: payload.ok ? null : (payload.error ?? payload.result?.error ?? "failed"),
              durationMs: payload.durationMs ?? 0,
              lineDelta: getLineDelta(payload.result),
            };
            const newBlocks = [...blocks];
            newBlocks[idx] = { type: "tool_call", tool: updated };
            setBlocksByMessage((ps) => ({ ...ps, [aid]: newBlocks }));
            blocksRef.current[aid] = newBlocks;
            setExpandedTool((ps) => { const n = new Set(ps); n.delete(updated.id); return n; });
          } else if (type === "approval_requested") {
            closeThinking(aid);
            pushBlock(aid, { type: "approval", approvalId: payload.approvalId, title: payload.title ?? "Approval required", body: payload.body ?? "", status: payload.status ?? "pending", toolName: payload.toolName });
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
      <aside className="w-full shrink-0 border-l border-line bg-paper-50 flex flex-col h-full min-h-0 overflow-hidden relative">
        {chatId && chat ? (
          <>
            {/* Header */}
            <div className="h-10 shrink-0 border-b border-line flex items-center gap-2 px-3">
              <button onClick={closeChat} className="text-xs text-ink-400 hover:text-ink-900">✕</button>
              {onCollapse && <button onClick={onCollapse} className="text-xs text-ink-400 hover:text-ink-900 ml-1" title="Collapse chat panel"><ChevronRight className="w-3 h-3" /></button>}
              <span className="text-xs font-medium text-ink-900 truncate flex-1">{chat.title || "Chat"}</span>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const isAssistant = m.role === "assistant";
                if (m.role === "tool") return null;
                const liveBlocks: Block[] = blocksByMessage[m.id] ?? [];
                const persistedToolCalls = isAssistant && liveBlocks.length === 0 && Array.isArray(m.toolCalls)
                  ? (m.toolCalls as Array<{ id?: string; name: string; arguments?: any }>)
                  : [];
                const blocks: Block[] = liveBlocks.length > 0
                  ? liveBlocks
                  : persistedToolCalls.map((tc, i) => ({
                      type: "tool_call" as const,
                      tool: {
                        id: tc.id ?? `${m.id}_tool_${i}`,
                        name: tc.name,
                        args: parseToolArgs(tc.arguments),
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
                            const t = block.tool;
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
                            const totalLen = spanContent?.length ?? 0;
                            // For streaming tools with rawArgs, extract content from partial JSON
                            const streamContent = (() => {
                              if (!isPending || !t.rawArgs) return null;
                              const m = t.rawArgs.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/);
                              return m ? m[1] : null;
                            })();
                            // Use streamContent for live preview when available
                            const effectiveContent = streamContent ?? spanContent;
                            const revealedContent = effectiveContent && effectiveContent.length > 0 ? effectiveContent : null;
                            // Best-effort parse of accumulated rawArgs for live data
                            const liveArgs = (() => {
                              if (!isPending || !t.rawArgs) return null;
                              try {
                                const parsed = JSON.parse(t.rawArgs);
                                if (parsed && typeof parsed === 'object') return parsed;
                              } catch {}
                              return null;
                            })();
                            const liveAddedLines = (() => {
                              // Check liveArgs for existing line count data first
                              if (isPending && liveArgs) {
                                // For write tools with content field
                                if (typeof liveArgs.content === 'string' && liveArgs.content.length > 0) {
                                  return liveArgs.content.split("\n").length;
                                }
                                // For edit tools with operations that have new_text
                                if (Array.isArray(liveArgs.operations)) {
                                  let added = 0;
                                  for (const op of liveArgs.operations) {
                                    if (typeof op?.new_text === 'string') added += op.new_text.split("\n").length;
                                    else if (typeof op?.content === 'string') added += op.content.split("\n").length;
                                  }
                                  return added || (effectiveContent ? effectiveContent.split("\n").length : 0);
                                }
                              }
                              // Fallback to regex-extracted content
                              return effectiveContent ? effectiveContent.split("\n").length : 0;
                            })();
                            // Live file path extracted from streaming rawArgs
                            const livePath = (() => {
                              if (!isPending || !t.rawArgs) return null;
                              // Check fully parsed args first
                              if (liveArgs) {
                                const p = liveArgs.target_file || liveArgs.file || liveArgs.path || liveArgs.source;
                                if (typeof p === 'string') return p;
                              }
                              // Fall back to regex on raw JSON
                              const pm = t.rawArgs.match(/"(?:target_file|file|path)"\s*:\s*"((?:[^"\\]|\\.)*)/);
                              if (pm) return pm[1];
                              return null;
                            })();
                            // Live removed lines for edit tools from streaming rawArgs
                            const liveRemovedLines = (() => {
                              if (!isPending || !t.rawArgs) return 0;
                              if (t.name === "edit_file" || t.name === "lab_edit_file" || t.name === "lab_edit_file_llm") {
                                // Count "old_text" fields in the streaming operations
                                const oldTexts = t.rawArgs.match(/"old_text"\s*:\s*"(?:\.|[^"])*"/g);
                                if (oldTexts) {
                                  let total = 0;
                                  for (const ot of oldTexts) {
                                    const val = ot.replace(/"old_text"\s*:\s*"/, '').replace(/"$/, '');
                                    total += val.split("\n").length;
                                  }
                                  return total;
                                }
                              }
                              return 0;
                            })();
                            const verbWord = isPending ? meta.verb : meta.verbPast;
                            const verbCap = verbWord.charAt(0).toUpperCase() + verbWord.slice(1);
                            const kindNoun = ({
                              read: "file",
                              write: "file",
                              edit: "file",
                              delete: "file",
                              list: "files",
                              exec: "bash",
                              http: "http",
                              mcp: "mcp",
                              "mcp-list": "mcp",
                              memory: "memory",
                              agent: "agent",
                              image: "image",
                              video: "video",
                              audio: "audio",
                              generic: "tool",
                            } as Record<string, string>)[meta.kind] ?? "tool";
                            const isOpen = expandedTool.has(t.id) || isPending;
                            const contentId = 'radix-' + t.id;
                            // Live line count: during pending use streamed data, after completion use
                            // args-derived counts (present for write/edit) or finalCounts from result.
                            const argsLineCounts = (() => {
                              if (meta.kind === "write" && t.args && typeof t.args.content === "string") {
                                const lines = t.args.content.split("\n").length;
                                return { added: lines, removed: 0 };
                              }
                              if (meta.kind === "edit" && t.args && Array.isArray(t.args.operations)) {
                                let added = 0, removed = 0;
                                for (const op of t.args.operations) {
                                  if (op?.new_text) added += op.new_text.split("\n").length;
                                  if (op?.old_text) removed += op.old_text.split("\n").length;
                                }
                                return (added > 0 || removed > 0) ? { added, removed } : null;
                              }
                              return null;
                            })();
                            const displayCounts = isPending
                              ? (liveAddedLines > 0 || liveRemovedLines > 0 ? { added: liveAddedLines, removed: liveRemovedLines } : null)
                              : (finalCounts ?? argsLineCounts);

                            // --- TERMINAL WIDGET for exec tools (execute_command, lab_bash, etc.) ---
                            if (meta.kind === "exec") {
                              // Parse result to extract exit code, stdout, stderr
                              const parsedResult = (() => {
                                if (isPending || isError || typeof t.result !== "string") return null;
                                const r = t.result as string;
                                const exitMatch = r.match(/exit=(-?\d+)/);
                                const stderrSep = r.indexOf("--- stderr ---");
                                const stdoutSep = r.indexOf("--- stdout ---");
                                if (!exitMatch) return null;
                                let stdout = "";
                                let stderr = "";
                                if (stdoutSep >= 0) {
                                  const stdoutStart = stdoutSep + "--- stdout ---".length;
                                  if (stderrSep > stdoutSep) {
                                    stdout = r.slice(stdoutStart, stderrSep).trim();
                                  } else {
                                    stdout = r.slice(stdoutStart).trim();
                                  }
                                }
                                if (stderrSep >= 0) {
                                  stderr = r.slice(stderrSep + "--- stderr ---".length).trim();
                                }
                                // If no stdout/stderr separators, the whole thing after exit line is output
                                if (stdoutSep < 0 && stderrSep < 0) {
                                  stdout = r.replace(/^exit=-?\d+.*\n?/, "").trim();
                                }
                                return {
                                  exitCode: parseInt(exitMatch[1], 10),
                                  stdout,
                                  stderr,
                                };
                              })();
                              const exitCode = parsedResult?.exitCode ?? null;
                              // Clean raw revealedContent by stripping markers and exit lines
                              const cleanContent = (revealedContent ?? "")
                                .replace(/^exit=-?\d+.*\n?/gm, "")
                                .replace(/^--- stdout ---\n?/gm, "")
                                .replace(/^--- stderr ---\n?/gm, "")
                                .replace(/--- stdout ---|--- stderr ---/g, "")
                                .trim();
                              const execOutput = parsedResult?.stdout ?? cleanContent ?? "";
                              // Truncate to keep it manageable
                              const displayOutput = execOutput.length > 5000 ? execOutput.slice(0, 5000) + "\n… (truncated)" : execOutput;

                              return (
                                <div key={t.id} className="w-full min-w-0">
                                  <div data-state={isOpen ? "open" : "closed"} data-slot="collapsible">
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      aria-expanded={isOpen}
                                      data-slot="collapsible-trigger"
                                      onClick={() => { setExpandedTool((p) => toggleSet(p, t.id)); }}
                                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedTool((p) => toggleSet(p, t.id)); } }}
                                      className="cursor-pointer"
                                    >
                                      <div
                                        className="grid w-full min-w-0 grid-cols-1 gap-1 overflow-hidden"
                                        style={{ "--tool-min-width": "100px", "--tool-icon-size": "16px" } as React.CSSProperties}
                                      >
                                        <button
                                          type="button"
                                          className="flex min-w-0 items-center gap-1.5 overflow-hidden w-full min-h-7 px-2 py-0.5 cursor-pointer rounded-md hover:bg-muted/30 text-left"
                                          onClick={() => {}}
                                        >
                                          <Terminal size={16} className="shrink-0 text-muted-foreground/50" />
                                          <span className="flex items-center gap-1.5 min-w-(--tool-min-width) flex-shrink-0">
                                            <span
                                              className={`text-xs font-medium ${isPending ? "text-transparent bg-clip-text relative inline-block" : "text-muted-foreground"}`}
                                              style={isPending ? {
                                                backgroundImage: "linear-gradient(90deg, transparent 0%, transparent calc(50% - 22px), #5a5a52 50%, transparent calc(50% + 22px), transparent 100%), linear-gradient(#828278, #828278)",
                                                backgroundSize: "250% 100%, auto",
                                                backgroundRepeat: "no-repeat, no-repeat",
                                                backgroundClip: "text",
                                                color: "transparent",
                                                animation: "shimmer-sweep 1.5s linear infinite",
                                              } as React.CSSProperties : undefined}
                                            >
                                              Ran command
                                            </span>
                                            <ChevronRight
                                              size={14}
                                              className={"shrink-0 text-muted-foreground/50 transition-transform duration-150 " + (isOpen ? "rotate-90" : "")}
                                            />
                                          </span>
                                          <div className="flex items-center justify-end gap-1.5 pl-2 min-w-0 flex-1 [&_p]:my-0 [&_p]:whitespace-nowrap [&_p]:overflow-hidden [&_p]:text-ellipsis [&_code]:whitespace-nowrap">
                                            {label && (
                                              <span className="min-w-0 max-w-full truncate font-mono text-xs text-muted-foreground/50">
                                                {label}
                                              </span>
                                            )}
                                          </div>
                                        </button>
                                      </div>
                                    </div>
                                    <div
                                      id={contentId}
                                      data-state={isOpen ? "open" : "closed"}
                                      hidden={!isOpen}
                                      data-slot="collapsible-content"
                                      className="overflow-hidden"
                                    >
                                      <div className="min-w-0 overflow-hidden">
                                        <div
                                          className="grid overflow-hidden w-full min-w-0 rounded-sm border border-border/20"
                                          style={{ maxHeight: "240px", gridTemplateRows: "auto minmax(0px, 1fr)" }}
                                        >
                                          {/* Terminal header bar */}
                                          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border/20 bg-muted/10 min-w-0">
                                            <div className="min-w-0 truncate">
                                              <span className="text-xs font-mono font-medium tracking-tight truncate text-muted-foreground">
                                                Terminal
                                              </span>
                                            </div>
                                            <div className="shrink-0 flex items-center gap-2">
                                              {parsedResult !== null && exitCode !== null && (
                                                <span className={`text-3xs px-1 py-0.5 rounded border font-mono ${
                                                  exitCode === 0
                                                    ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                                                    : "border-red-500/30 text-red-600 bg-red-500/5"
                                                }`}>
                                                  exit {exitCode}
                                                </span>
                                              )}
                                              {parsedResult === null && selfHostedOutput && !isPending && !isError && (
                                                <span className="text-3xs px-1 py-0.5 rounded border border-emerald-500/30 text-emerald-600 bg-emerald-500/5 font-mono">
                                                  done
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {/* Scrollable terminal output */}
                                          <div className="relative overflow-hidden h-full min-h-0 min-w-0">
                                            <div
                                              className="overflow-x-auto overflow-y-auto h-full"
                                              style={{
                                                maskImage: "linear-gradient(transparent 0px, black 0.75rem, black calc(100% - 0.75rem), transparent 100%)",
                                                maxHeight: "180px",
                                              }}
                                            >
                                              <div className="py-2">
                                                {isPending ? (
                                                  <pre className="m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground px-3">
                                                    {revealedContent && revealedContent.length > 0 ? (
                                                      <>
                                                        {revealedContent.slice(0, 4000)}
                                                        <span className="inline-block w-1 h-3 bg-muted-foreground/40 ml-0.5 align-middle animate-pulse" />
                                                      </>
                                                    ) : (
                                                      <span className="text-muted-foreground/40 italic">Running…</span>
                                                    )}
                                                  </pre>
                                                ) : isError ? (
                                                  <pre className="m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-red-500 px-3">
                                                    {t.error ?? "Command failed"}
                                                  </pre>
                                                ) : (
                                                  <>
                                                    {displayOutput ? (
                                                      <pre className="m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-foreground/80 px-3">
                                                        {displayOutput}
                                                      </pre>
                                                    ) : (
                                                      <div className="px-3">
                                                        {cleanContent !== null && cleanContent.length > 0 ? (
                                                          <pre className="m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-foreground/80">
                                                            {cleanContent}
                                                          </pre>
                                                        ) : revealedContent !== null ? (
                                                          <pre className="m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-foreground/80">
                                                            {revealedContent}
                                                          </pre>
                                                        ) : (
                                                          <span className="text-xs text-muted-foreground/40 italic">(no output)</span>
                                                        )}
                                                      </div>
                                                    )}
                                                    {parsedResult?.stderr && (
                                                      <pre className="m-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-red-500/80 px-3 mt-1 border-t border-border/10 pt-1">
                                                        {parsedResult.stderr}
                                                      </pre>
                                                    )}
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            // --- END TERMINAL WIDGET ---

                            return (
                              <div key={t.id} className="w-full min-w-0 space-y-0.5">
                                <div data-state={isOpen ? "open" : "closed"} data-slot="collapsible">
                                  <button
                                    type="button"
                                    aria-controls={contentId}
                                    aria-expanded={isOpen}
                                    data-state={isOpen ? "open" : "closed"}
                                    data-slot="collapsible-trigger"
                                  >
                                    <div
                                      className="grid grid-cols-1 gap-1 w-full"
                                      style={{ "--tool-min-width": "100px", "--tool-icon-size": "16px" } as React.CSSProperties}
                                    >
                                      <button
                                        type="button"
                                        className="flex items-center gap-1.5 w-full min-h-7 px-2 py-0.5 cursor-pointer rounded-md hover:bg-muted/30 text-left"
                                        onClick={() => { setExpandedTool((p) => toggleSet(p, t.id)); }}
                                      >
                                        <Icon size={16} className="shrink-0 text-muted-foreground/50" />
                                        <span className="flex items-center gap-1.5 min-w-(--tool-min-width) flex-shrink-0">
                                          <span
                                            className={`text-xs font-medium ${isPending ? "text-transparent bg-clip-text relative inline-block" : "text-muted-foreground"}`}
                                            style={isPending ? {
                                              backgroundImage: "linear-gradient(90deg, transparent 0%, transparent calc(50% - 22px), #5a5a52 50%, transparent calc(50% + 22px), transparent 100%), linear-gradient(#828278, #828278)",
                                              backgroundSize: "250% 100%, auto",
                                              backgroundRepeat: "no-repeat, no-repeat",
                                              backgroundClip: "text",
                                              color: "transparent",
                                              animation: "shimmer-sweep 1.5s linear infinite",
                                            } as React.CSSProperties : undefined}
                                          >
                                            {verbCap} {kindNoun}
                                          </span>
                                          {displayCounts && (
                                            <span className="text-[10px] tabular-nums flex items-center gap-0.5">
                                              {displayCounts.added > 0 && <span className="text-emerald-600">+{displayCounts.added}</span>}
                                              {displayCounts.removed > 0 && <span className="text-muted-foreground">-{displayCounts.removed}</span>}
                                            </span>
                                          )}
                                          <ChevronRight
                                            size={14}
                                            className={"shrink-0 text-muted-foreground/50 transition-transform duration-150 " + (isOpen ? "rotate-90" : "")}
                                          />
                                        </span>
                                        <div className="flex items-center justify-end gap-1.5 pl-2 min-w-0 flex-1 [&_p]:my-0 [&_p]:whitespace-nowrap [&_p]:overflow-hidden [&_p]:text-ellipsis [&_code]:whitespace-nowrap">
                                          {(livePath || label) && (
                                            <span
                                              className="text-xs text-muted-foreground/50 font-mono truncate min-w-0 cursor-pointer hover:text-muted-foreground hover:underline transition-colors duration-150"
                                              role="button"
                                              tabIndex={0}
                                            >
                                              {livePath || label}
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    </div>
                                  </button>
                                  <div
                                    id={contentId}
                                    data-state={isOpen ? "open" : "closed"}
                                    hidden={!isOpen}
                                    data-slot="collapsible-content"
                                    className="overflow-hidden"
                                    style={{}}
                                  >
                                    <div className="pl-7 pr-1.5 py-1.5 space-y-1.5">
                                      {/* Media previews */}
                                      {!isPending && !isError && (() => {
                                        const media = getToolMedia(t.result);
                                        if (!media || media.length === 0) return null;
                                        const activeAgentId = chat?.activeAgentId ?? chat?.agentId;
                                        if (!activeAgentId) return null;
                                        return (
                                          <div className="not-italic not-mono -ml-1 mb-2 font-sans max-h-none overflow-visible whitespace-normal">
                                            {media.map((item, i) => (
                                              <MediaPreview key={t.id + "_media_" + i} agentId={activeAgentId} item={item} />
                                            ))}
                                          </div>
                                        );
                                      })()}
                                      {/* Content preview — live stream while pending */}
                                      {revealedContent !== null && (
                                        <pre className="m-0 font-mono text-2xs whitespace-pre-wrap break-words text-ink-600 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto max-h-80 overflow-y-auto">
                                          {revealedContent.slice(0, 4000)}{revealedContent.length > 4000 ? "\n…" : ""}
                                          {isPending && <span className="inline-block w-1 h-3.5 bg-ink-400 ml-0.5 align-middle animate-pulse" />}
                                        </pre>
                                      )}
                                      {/* Fallback result display when no spanContent */}
                                      {revealedContent === null && !isPending && !isError && t.result !== undefined && (
                                        (() => {
                                          const val = t.result;
                                          if (val === undefined || val === null) return null;
                                          let display = "";
                                          if (typeof val === "string") display = val.slice(0, 2000);
                                          else if (typeof val === "object") {
                                            const r = val as Record<string, unknown>;
                                            const text = r.content || r.text || r.message || r.result;
                                            if (typeof text === "string") display = String(text).slice(0, 2000);
                                            else if (typeof text === "object" && text !== null) display = JSON.stringify(text, null, 2).slice(0, 2000);
                                            else {
                                              const rest_keys = Object.keys(r);
                                              const filtered: Record<string, unknown> = {};
                                              for (const k of rest_keys) {
                                                if (k !== "ok" && k !== "isError" && k !== "error") filtered[k] = r[k];
                                              }
                                              const fkeys = Object.keys(filtered);
                                              if (fkeys.length === 1) {
                                                const v = filtered[fkeys[0]];
                                                if (typeof v === "string") display = v.slice(0, 2000);
                                                else display = JSON.stringify(r, null, 2).slice(0, 2000);
                                              } else if (fkeys.length > 0) {
                                                display = JSON.stringify(r, null, 2).slice(0, 2000);
                                              }
                                            }
                                          } else display = String(val).slice(0, 2000);
                                          if (!display) return null;
                                          return (
                                            <pre className="m-0 font-mono text-2xs whitespace-pre-wrap break-words text-ink-600 bg-paper-100 border border-line-soft rounded-sm px-2 py-1.5 overflow-x-auto max-h-60 overflow-y-auto">
                                              {display}
                                            </pre>
                                          );
                                        })()
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }                          if (block.type === "approval") {
                            const pending = block.status === "pending";
                            const resolveApproval = async (decision: "approve" | "reject") => {
                              const path = `/api/approvals/${encodeURIComponent(block.approvalId)}/${decision}`;
                              const token = getToken();
                              const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
                              if (res.ok) {
                                const json = await res.json();
                                block.status = json.approval?.status ?? (decision === "approve" ? "approved" : "rejected");
                                setBlocksByMessage((p) => ({ ...p }));
                              }
                            };
                            const resolveAlwaysAllow = async () => {
                              const path = `/api/approvals/${encodeURIComponent(block.approvalId)}/always-allow`;
                              const token = getToken();
                              const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
                              if (res.ok) {
                                const json = await res.json();
                                block.status = json.approval?.status ?? "approved";
                                setBlocksByMessage((p) => ({ ...p }));
                              }
                            };
                            const toolMeta = block.toolName ? getToolMeta(block.toolName) : null;
                            return (
                              <div key={`approval_${block.approvalId}`} className="border border-line rounded-lg overflow-hidden text-sm">
                                {/* Header */}
                                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 border-b border-amber-200 dark:border-amber-800/50">
                                  <span className="size-2 shrink-0 rounded-full bg-amber-500" />
                                  <span className="font-medium text-amber-900 dark:text-amber-200 text-xs uppercase tracking-wide">Approval Required</span>
                                  {toolMeta && (
                                    <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-200/60 dark:bg-amber-800/40 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                                      <toolMeta.icon size={12} />
                                      {block.toolName}
                                    </span>
                                  )}
                                </div>
                                {/* Body */}
                                <div className="bg-paper-100 dark:bg-paper-800/50 px-3 py-2.5">
                                  <div className="text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">{block.title}</div>
                                  <div className="whitespace-pre-wrap text-xs text-ink-700 dark:text-ink-300 leading-relaxed">{block.body}</div>
                                </div>
                                {/* Actions */}
                                {pending ? (
                                  <div className="flex items-center gap-1.5 px-3 py-2 bg-paper-200/50 dark:bg-paper-800/30 border-t border-line">
                                    <button
                                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                                      onClick={() => resolveApproval("approve")}
                                    >
                                      <Check className="size-3" />
                                      Approve
                                    </button>
                                    <button
                                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                                      onClick={resolveAlwaysAllow}
                                    >
                                      <Check className="size-3" />
                                      Always Allow
                                    </button>
                                    <button
                                      className="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 transition-colors ml-auto"
                                      onClick={() => resolveApproval("reject")}
                                    >
                                      <X className="size-3" />
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 px-3 py-2 bg-paper-200/50 dark:bg-paper-800/30 border-t border-line">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      block.status === "approved"
                                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                        : block.status === "rejected"
                                        ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                        : "bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-400"
                                    }`}>
                                      {block.status === "approved" ? <Check className="size-2.5" /> : block.status === "rejected" ? <X className="size-2.5" /> : null}
                                      {block.status === "approved" ? "Approved" : block.status === "rejected" ? "Rejected" : block.status}
                                    </span>
                                  </div>
                                )}
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
              <div className="bg-paper-100 border border-line rounded-xl overflow-hidden">
                {/* Attached file previews */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-3 pt-3">
                    {attachedFiles.map((af, i) => (
                      <div key={i} className="relative group">
                        {af.file.type.startsWith("image/") ? (
                          <img
                            src={af.preview}
                            alt={af.name}
                            className="w-16 h-16 object-cover rounded-lg border border-line"
                          />
                        ) : (
                          <div className="w-16 h-16 flex items-center justify-center rounded-lg border border-line bg-paper-200 text-[10px] text-ink-500 truncate px-1 text-center">
                            {af.name}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(af.preview);
                            setAttachedFiles((prev) => prev.filter((_, j) => j !== i));
                          }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-ink-800 text-paper-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      const newFiles: Array<{preview: string; name: string; file: File}> = [];
                      for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        if (item.type.startsWith("image/")) {
                          const file = item.getAsFile();
                          if (file) {
                            const ext = file.name.split('.').pop() || 'png';
                            newFiles.push({
                              preview: URL.createObjectURL(file),
                              name: `pasted-image-${Date.now()}.${ext}`,
                              file,
                            });
                          }
                        }
                      }
                      if (newFiles.length > 0) {
                        e.preventDefault();
                        setAttachedFiles((prev) => [...prev, ...newFiles]);
                      }
                    }}
                    disabled={streaming}
                    placeholder={streaming ? "…" : "Type message…"}
                    className="w-full bg-transparent px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 resize-none outline-none font-sans min-h-[72px]"
                    style={{ height: "auto" }}
                    rows={2}
                  />
                </div>
                <div className="h-12 bg-paper-100 rounded-b-xl flex items-center px-3">
                  <div className="w-full flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.md"
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (!files) return;
                          const newFiles: Array<{preview: string; name: string; file: File}> = [];
                          for (let i = 0; i < files.length; i++) {
                            const f = files[i];
                            newFiles.push({
                              preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
                              name: f.name,
                              file: f,
                            });
                          }
                          setAttachedFiles((prev) => [...prev, ...newFiles]);
                          e.target.value = "";
                        }}
                      />
                      {hasRunningTools && (
                        <div className="flex items-center justify-center h-8 w-6" title="AI agent running">
                          <AnimatedDots size={20} />
                        </div>
                      )}
                      <DropdownMenu open={agentDropdownOpen} onOpenChange={setAgentDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1 h-8 pl-1.5 pr-2 text-xs rounded-md text-ink-500 hover:bg-paper-200 transition-colors"
                          >
                            <Bot size={13} className="shrink-0 text-ink-400" />
                            <span className="max-w-[70px] truncate">
                              {agentsList.find((a) => a.id === (selectedAgentId || chat?.activeAgentId || chat?.agentId))?.name ?? "Agent"}
                            </span>
                            <ChevronDown size={11} className="shrink-0 text-ink-400 opacity-40" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" sideOffset={6} className="min-w-[10rem]">
                          {agentsList.map((a) => (
                            <DropdownMenuItem
                              key={a.id}
                              onSelect={() => {
                                setSelectedAgentId(a.id);
                                if (chatId) Chats.setActiveAgent(chatId, a.id);
                              }}
                              className="flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2">
                                <Bot size={14} className="shrink-0 text-ink-400" />
                                <span>{a.name}</span>
                              </div>
                              {(selectedAgentId || chat?.activeAgentId || chat?.agentId) === a.id && (
                                <Check size={14} className="text-ink-700" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className="h-4 w-px bg-line ml-1" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg p-2 hover:bg-paper-200 text-ink-400 hover:text-ink-700 transition-colors"
                        aria-label="Attach files"
                        title="Attach files or images"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={hasRunningTools ? () => streamAbortRef.current?.abort() : send}
                      disabled={!hasRunningTools && !input.trim() && attachedFiles.length === 0}
                      className={cn(
                        "rounded-lg p-2 hover:bg-paper-200 transition-colors",
                        "disabled:opacity-30 disabled:hover:bg-transparent"
                      )}
                      aria-label="Send message"
                    >
                      {hasRunningTools ? (
                        <span className="text-xs font-medium text-err">■</span>
                      ) : (
                        <ArrowRight
                          size={18}
                          className={cn(
                            "text-ink-700 transition-opacity duration-200",
                            input.trim() || attachedFiles.length > 0 ? "opacity-100" : "opacity-30"
                          )}
                        />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-10 shrink-0 border-b border-line flex items-center gap-2 px-3">
              <span className="text-xs font-medium text-ink-700 flex-1">Chat</span>
              {onCollapse && <button onClick={onCollapse} className="text-xs text-ink-400 hover:text-ink-900 ml-1" title="Collapse chat panel"><ChevronRight className="w-3 h-3" /></button>}
              <button onClick={closeChat} className="text-xs text-ink-400 hover:text-ink-900">✕</button>
              {onCollapse && <button onClick={onCollapse} className="text-xs text-ink-400 hover:text-ink-900 ml-1" title="Collapse chat panel"><ChevronRight className="w-3 h-3" /></button>}
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-ink-400">No chat selected</div>
          </>
        )}
      </aside>
    </>
  );
}
