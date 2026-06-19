import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Chats, Agents, Agents as AgentsApi, Chat, Message, Run, ToolInvocation } from "../api";
import {
  Loader2, Bot,
  AlertCircle, PanelLeft,
} from "lucide-react";
import { getToken, api } from "../api/client";
import ChatMessage from "../components/ChatMessage";
import ThinkingIndicator from "../components/ThinkingIndicator";
import { AIInput } from "../components/ui/animated-ai-input";
import { useModels } from "../hooks/useModels";

interface ChatPageProps {
  chatIdOverride?: string;
  inPanel?: boolean;
}

export default function ChatPage({ chatIdOverride, inPanel = false }: ChatPageProps) {
  const paramsId = (useParams() as any).id;
  const id = chatIdOverride ?? paramsId ?? "";
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveRun, setLiveRun] = useState<Partial<Run> | null>(null);
  const [liveTools, setLiveTools] = useState<ToolInvocation[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [pendingToolCalls, setPendingToolCalls] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<string>("mock");
  const { models: availableModels, loading: modelsLoading } = useModels();
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renderRaf = useRef<number | null>(null);
  const pendingContent = useRef<string>("");

  async function load() {
    if (!id) return;
    const { chat, messages } = await Chats.get(id);
    setChat(chat);
    setMessages(messages);
    const { agents } = await Agents.list();
    setAgentsList(agents.map((a) => ({ id: a.id, name: a.name })));
    setAgentNames(Object.fromEntries(agents.map((a) => [a.id, a.name])));
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveTools]);

  useEffect(() => {
    if (!streaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [streaming]);

  async function setActive(agentId: string) {
    if (!id) return;
    await Chats.setActiveAgent(id, agentId);
    load();
  }

  // ─── SSE token batching (rAF-throttled renders) ───
  const flushContent = useCallback((content: string) => {
    if (pendingAssistantId) {
      setMessages((m) => m.map((x) => x.id === pendingAssistantId ? { ...x, content } : x));
    } else {
      const tid = `tmp_assist_${Date.now()}`;
      pendingAssistantId = tid;
      setMessages((m) => [...m, { id: tid, chatId: id, role: "assistant", content, createdAt: Date.now() } as Message]);
    }
  }, [id]);

  const scheduleRender = useCallback(() => {
    if (renderRaf.current) return;
    renderRaf.current = requestAnimationFrame(() => {
      renderRaf.current = null;
      flushContent(pendingContent.current);
    });
  }, [flushContent]);
  // ─── end SSE batching ───

  function handleModelChange(model: string) {
    setSelectedModel(model);
  }

  async function send() {
    if (!input.trim() || streaming || !id) return;
    const text = input;
    setInput("");
    setStreaming(true);
    setLiveRun(null);
    setLiveTools([]);
    setStreamError(null);
    setPendingToolCalls(new Set());

    setMessages((m) => [...m, {
      id: `tmp_${Date.now()}`,
      chatId: id, role: "user", content: text, createdAt: Date.now(),
    } as Message]);

    const res = await fetch(`/api/chats/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${getToken()}` },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok || !res.body) { setStreaming(false); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", acc = "", pendingAssistantId: string | null = null, pendingToolName: string | null = null;
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
          if (type === "token") {
            acc += payload.delta;
            pendingContent.current = acc;
            scheduleRender();
          } else if (type === "message") {
            if (renderRaf.current) cancelAnimationFrame(renderRaf.current);
            renderRaf.current = null;
            await load();
            acc = ""; pendingAssistantId = null; pendingToolName = null;
          } else if (type === "thinking") {
            if (!pendingAssistantId) {
              const tid = `tmp_thinking_${Date.now()}`;
              pendingAssistantId = tid;
              setMessages((m) => [...m, { id: tid, chatId: id, role: "assistant", content: "", createdAt: Date.now() } as Message]);
            }
          } else if (type === "tool_call") {
            pendingToolName = payload.name;
            setPendingToolCalls((prev) => new Set(prev).add(payload.name));
            if (pendingAssistantId) {
              setMessages((m) => m.map((x) => x.id === pendingAssistantId
                ? { ...x, toolCalls: [...((x.toolCalls as any[]) ?? []), { name: payload.name, args: payload.args, id: payload.id }] }
                : x));
            }
          } else if (type === "tool_result") {
            setPendingToolCalls((prev) => {
              const next = new Set(prev);
              next.delete(payload.name);
              return next;
            });
            setLiveTools((t) => [...t, {
              id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              runId: liveRun?.id ?? "",
              toolName: payload.name,
              arguments: payload.args ?? {},
              result: payload.result,
              status: payload.ok ? "ok" : "error",
              error: payload.ok ? null : payload.error ?? null,
              startedAt: Date.now(),
              finishedAt: Date.now(),
              durationMs: payload.durationMs ?? 0,
              sandboxId: null,
            } as ToolInvocation]);
          } else if (type === "run_started") {
            setLiveRun({ id: payload.runId } as Run);
          } else if (type === "error") {
            setStreamError(payload.message);
            console.error(payload.message);
          } else if (type === "done") {
            if (renderRaf.current) cancelAnimationFrame(renderRaf.current);
            renderRaf.current = null;
            setStreaming(false);
            setPendingToolCalls(new Set());
            await load();
          }
        }
      }
    } catch (error: any) {
      setStreamError(error?.message ?? "Network error");
    }
    if (renderRaf.current) cancelAnimationFrame(renderRaf.current);
    renderRaf.current = null;
    setStreaming(false);
    setPendingToolCalls(new Set());
    await load();
  }

  function cancel() {
    setStreaming(false);
  }

  if (!id) return null;

  if (!chat) return (
    <div className="flex items-center justify-center h-full bg-paper">
      <div className="flex items-center gap-2 text-sm text-ink-400">
        <Loader2 className="w-4 h-4 stroke-[1.5] animate-spin" />
        Loading…
      </div>
    </div>
  );

  const agentName = agentNames[chat.activeAgentId ?? chat.agentId] ?? "Agent";

  return (
    <div className="h-full flex flex-col bg-paper">
      {/* ─── Top bar ─── */}
      <div className="h-11 border-b border-line flex items-center gap-3 px-4 shrink-0 bg-paper-50/80 backdrop-blur-sm">
        {!inPanel && (
          <Link to="/chats" className="text-ink-400 hover:text-ink-900 transition-colors">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
          </Link>
        )}
        {inPanel && (
          <Link to="/chats" className="text-ink-400 hover:text-ink-900 transition-colors">
            <PanelLeft className="w-4 h-4 stroke-[1.75]" />
          </Link>
        )}
        <input
          value={chat.title}
          onChange={(e) => setChat({ ...chat, title: e.target.value })}
          onBlur={() => Chats.rename(id, chat.title)}
          className="bg-transparent text-sm font-medium flex-1 outline-none text-ink-900 min-w-0"
        />
        <div className="flex items-center gap-2 text-xs text-ink-400 shrink-0">
          <Bot className="w-3.5 h-3.5 stroke-[1.75]" />
          <select
            value={chat.activeAgentId ?? chat.agentId}
            onChange={(e) => setActive(e.target.value)}
            className="input py-0.5 text-xs max-w-[150px]"
          >
            {agentsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* ─── Messages area ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={inPanel ? "flex flex-col gap-4" : "max-w-3xl mx-auto flex flex-col gap-5"}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] text-center">
              <div className="w-10 h-10 rounded-full border-2 border-line grid place-items-center mb-3 text-ink-400">
                <Bot className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div className="text-sm font-medium text-ink-900">New conversation</div>
              <div className="text-xs text-ink-400 mt-1 max-w-xs leading-relaxed">
                Send a message to <span className="font-medium text-ink-700">{agentName}</span>.
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              streaming={streaming}
              agentName={agentName}
              toolInvocations={m.role === "assistant" && m.id === messages[messages.length - 1]?.id ? liveTools : undefined}
              isLast={i === messages.length - 1}
            />
          ))}

          {/* Stream error */}
          {streamError && (
            <div className="flex gap-3 max-w-3xl">
              <div className="w-7 h-7 rounded-full border border-rose-200 bg-rose-50 grid place-items-center shrink-0">
                <AlertCircle className="w-4 h-4 text-rose-700 stroke-[1.75]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xs uppercase tracking-wider text-rose-600 mb-1.5 font-mono">error</div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-rose-800 bg-rose-50/60 border border-rose-200 rounded-sm p-3">
                  {streamError}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>
      </div>

      {/* ─── Thinking indicator strip (above input) ─── */}
      {streaming && (
        <div className={`${inPanel ? "px-3 py-1" : "max-w-3xl mx-auto px-3 py-1"} shrink-0`}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-line bg-paper-100/60">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <ThinkingIndicator />
            </div>
            {pendingToolCalls.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {Array.from(pendingToolCalls).map((name) => (
                  <div key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs font-mono text-ink-400 bg-paper-200 border border-line rounded-sm">
                    <Loader2 className="w-2.5 h-2.5 stroke-[2] animate-spin" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Input area ─── */}
      <div className="border-t border-line bg-paper-50/80 backdrop-blur-sm shrink-0">
        <div className={inPanel ? "px-3 py-2" : "max-w-3xl mx-auto px-3 py-2.5"}>
          <AIInput
            value={input}
            onChange={setInput}
            onSend={send}
            onCancel={cancel}
            isStreaming={streaming}
            disabled={streaming}
            placeholder={`Message ${agentName}…`}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            availableModels={availableModels}
          />
        </div>
      </div>
    </div>
  );
}
