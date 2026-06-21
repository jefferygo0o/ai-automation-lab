"use client";

import { Message } from "@/lib/types";

interface ChatPanelProps {
  messages: Message[];
  inputText: string;
  setInputText: (text: string) => void;
  onSubmit: (text?: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  isVoiceInputActive: boolean;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isStreaming = message.isStreaming;

  // Check if content contains a screenshot (data URI image)
  const screenshotMatch = message.content.match(/!\[Screenshot\]\(data:image\/[^)]+\)/);
  const hasScreenshot = !!screenshotMatch;

  // Extract the data URI if present
  const screenshotUri = hasScreenshot
    ? screenshotMatch![0].match(/\(([^)]+)\)/)?.[1]
    : null;

  // Clean screenshot from text for display
  const displayContent = hasScreenshot
    ? message.content.replace(/!\[Screenshot\]\(data:image\/[^)]+\)\n*/, "").trim()
    : message.content;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-aura-primary/10 border border-aura-primary/20 text-aura-text"
            : "glass text-aura-text"
        }`}
      >
        {/* Assistant label */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-aura-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-aura-primary/70">
              Aura
            </span>
          </div>
        )}

        {/* Screenshot display */}
        {screenshotUri && (
          <div className="mb-3 rounded-xl overflow-hidden border border-aura-border/50 bg-aura-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUri}
              alt="Browser screenshot"
              className="w-full h-auto max-h-96 object-contain"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {displayContent || (isStreaming ? "..." : "")}
          {isStreaming && (
            <span className="typing-cursor inline-block ml-0.5" />
          )}
        </div>

        {/* Action / Risk badge */}
        {message.action && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider bg-aura-surface border border-aura-border/50">
            {message.riskLevel === "high" ? (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            ) : message.riskLevel === "medium" ? (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
            {message.action.replace(/_/g, " ")}
          </div>
        )}

        {/* Sources inline */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-aura-border/50">
            <div className="text-[10px] uppercase tracking-wider text-aura-muted mb-1.5">
              Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-aura-surface border border-aura-border/50 text-aura-primary/80 hover:text-aura-primary hover:border-aura-primary/50 transition-all"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  [{idx + 1}] {source.title?.slice(0, 35) || source.source}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-1.5 text-[10px] text-aura-muted/50">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({
  messages,
  inputText,
  setInputText,
  onSubmit,
  chatEndRef,
  isVoiceInputActive,
}: ChatPanelProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full glass rounded-2xl overflow-hidden border border-aura-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-aura-border/30">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-aura-primary">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs font-medium text-aura-text/60 uppercase tracking-wider">
            Conversation
          </span>
        </div>
        <span className="text-[10px] text-aura-muted/50">
          {messages.filter((m) => m.role === "user").length} messages
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-aura-muted mb-3">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="text-sm text-aura-muted">
              Click the microphone or type to start
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble key={`${msg.timestamp}-${idx}`} message={msg} />
          ))
        )}
        <div ref={chatEndRef as React.LegacyRef<HTMLDivElement>} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-aura-border/30">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isVoiceInputActive ? "Listening..." : "Type a message..."}
            disabled={isVoiceInputActive}
            className="flex-1 bg-aura-bg/50 border border-aura-border/50 rounded-xl px-4 py-2.5 text-sm text-aura-text placeholder-aura-muted/50 outline-none focus:border-aura-primary/50 focus:ring-1 focus:ring-aura-primary/20 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => onSubmit()}
            disabled={!inputText.trim() || isVoiceInputActive}
            className="p-2.5 rounded-xl bg-aura-primary/10 border border-aura-primary/20 text-aura-primary hover:bg-aura-primary/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
