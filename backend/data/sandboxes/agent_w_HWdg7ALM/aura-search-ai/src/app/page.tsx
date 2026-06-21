"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import AIFace from "@/components/AIFace";
import ChatPanel from "@/components/ChatPanel";
import VoiceControls from "@/components/VoiceControls";
import SourcePanel from "@/components/SourcePanel";
import AgentStatus from "@/components/AgentStatus";
import ConfirmationModal from "@/components/ConfirmationModal";
import SettingsPanel from "@/components/SettingsPanel";
import { Message, Source, AgentState, PendingAction } from "@/lib/types";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [inputText, setInputText] = useState("");
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((updater: (msg: Message) => Message) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = updater(updated[updated.length - 1]);
      return updated;
    });
  }, []);

  const handleSpeak = useCallback(
    (text: string) => {
      if (!isVoiceEnabled || isMuted) return;
      if (!window.speechSynthesis) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.lang.startsWith("en") && v.name.includes("Google")
      ) || voices.find((v) => v.lang.startsWith("en")) || null;
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onstart = () => setAgentState("speaking");
      utterance.onend = () => setAgentState("idle");
      utterance.onerror = () => setAgentState("idle");
      window.speechSynthesis.speak(utterance);
    },
    [isVoiceEnabled, isMuted]
  );

  const handleStopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setAgentState("idle");
  }, []);

  const handleSubmit = useCallback(
    async (text?: string) => {
      const query = (text || inputText).trim();
      if (!query) return;

      setInputText("");
      addMessage({ role: "user", content: query, timestamp: Date.now() });

      try {
        // Set thinking state based on what the user is asking
        const lower = query.toLowerCase();
        if (
          lower.includes("search") ||
          lower.includes("find") ||
          lower.includes("look up") ||
          lower.includes("what") ||
          lower.includes("who") ||
          lower.includes("where")
        ) {
          setAgentState("searching");
        } else if (
          lower.includes("open") ||
          lower.includes("go to") ||
          lower.includes("navigate") ||
          lower.includes("screenshot") ||
          lower.includes("click")
        ) {
          setAgentState("reading");
        } else {
          setAgentState("thinking");
        }

        // Add an empty assistant message that we'll stream updates to
        addMessage({
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isStreaming: true,
        });

        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            history: messages.slice(-10),
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        // Update the assistant message
        updateLastMessage((msg) => ({
          ...msg,
          role: "assistant",
          content: data.response || data.message || "",
          timestamp: Date.now(),
          isStreaming: false,
          sources: data.sources,
          action: data.action,
          riskLevel: data.riskLevel,
        }));

        // Track sources
        if (data.sources && data.sources.length > 0) {
          setSources((prev) => {
            const existing = new Set(prev.map((s) => s.url));
            const newSources = data.sources.filter(
              (s: Source) => !existing.has(s.url)
            );
            return [...newSources, ...prev].slice(0, 20);
          });
          setShowSources(true);
        }

        // Handle pending action (confirmation needed)
        if (data.pendingAction) {
          setPendingAction(data.pendingAction);
          setAgentState("waiting");
        } else {
          setAgentState("idle");
        }

        // Speak the response if voice is on
        const responseText = data.response || data.message || "";
        if (responseText) {
          setTimeout(() => handleSpeak(responseText), 100);
        }
      } catch (error: any) {
        updateLastMessage((msg) => ({
          ...msg,
          role: "assistant",
          content: `⚠️ Error: ${error.message || "Something went wrong. Please try again."}`,
          timestamp: Date.now(),
          isStreaming: false,
        }));
        setAgentState("error");
        setTimeout(() => setAgentState("idle"), 3000);
      }
    },
    [inputText, messages, addMessage, updateLastMessage, handleSpeak]
  );

  const handleVoiceResult = useCallback(
    (transcript: string) => {
      if (transcript.trim()) {
        handleSubmit(transcript);
      }
    },
    [handleSubmit]
  );

  const handleConfirmAction = useCallback(
    async (confirmed: boolean) => {
      if (!pendingAction) return;

      if (confirmed) {
        setAgentState("thinking");
        try {
          const response = await fetch("/api/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `CONFIRM: ${pendingAction.action}`,
              confirmationId: pendingAction.id,
              confirmed: true,
              history: messages.slice(-10),
            }),
          });

          if (!response.ok) throw new Error("Confirmation failed");

          const data = await response.json();
          updateLastMessage((msg) => ({
            ...msg,
            content: data.response || data.message || msg.content,
            sources: data.sources,
          }));

          if (data.response) {
            setTimeout(() => handleSpeak(data.response), 100);
          }
        } catch (error: any) {
          addMessage({
            role: "assistant",
            content: `⚠️ Error executing confirmed action: ${error.message}`,
            timestamp: Date.now(),
          });
        }
      } else {
        addMessage({
          role: "assistant",
          content: "✅ Action cancelled. Let me know if you need anything else.",
          timestamp: Date.now(),
        });
      }

      setPendingAction(null);
      setAgentState("idle");
    },
    [pendingAction, messages, addMessage, updateLastMessage, handleSpeak]
  );

  // Infer agent state from what's happening
  const currentAgentState = pendingAction
    ? "waiting"
    : agentState === "speaking"
    ? "speaking"
    : messages.length > 0 &&
      messages[messages.length - 1]?.role === "assistant" &&
      messages[messages.length - 1]?.isStreaming
    ? "thinking"
    : agentState === "error"
    ? "error"
    : isVoiceInputActive
    ? "listening"
    : agentState;

  return (
    <main className="relative min-h-screen flex flex-col items-center bg-aura-bg overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-aura-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-aura-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top bar */}
      <header className="relative z-10 w-full flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-aura-primary animate-pulse-glow" />
          <span className="text-sm font-medium text-aura-text/60 tracking-wider uppercase">
            AuraSearch AI
          </span>
        </div>
        <div className="flex items-center gap-3">
          <AgentStatus state={currentAgentState} />
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-aura-muted hover:text-aura-text hover:bg-aura-surface transition-all"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          isVoiceEnabled={isVoiceEnabled}
          setIsVoiceEnabled={setIsVoiceEnabled}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-6xl mx-auto px-4 pb-4">
        {/* AI Face section - top center */}
        <div className="w-full flex justify-center mb-2">
          <AIFace state={currentAgentState} />
        </div>

        {/* Chat & Sources row */}
        <div className="w-full flex flex-col lg:flex-row gap-4 flex-1 min-h-0 max-h-[60vh]">
          {/* Chat panel */}
          <div className="flex-1 min-w-0">
            <ChatPanel
              messages={messages}
              inputText={inputText}
              setInputText={setInputText}
              onSubmit={handleSubmit}
              chatEndRef={chatEndRef}
              isVoiceInputActive={isVoiceInputActive}
            />
          </div>

          {/* Sources panel */}
          {sources.length > 0 && (
            <div className="w-full lg:w-80 shrink-0">
              <SourcePanel
                sources={sources}
                isVisible={showSources}
                onToggle={() => setShowSources(!showSources)}
              />
            </div>
          )}
        </div>

        {/* Voice controls */}
        <div className="mt-4">
          <VoiceControls
            isVoiceEnabled={isVoiceEnabled}
            isVoiceInputActive={isVoiceInputActive}
            setIsVoiceInputActive={setIsVoiceInputActive}
            onVoiceResult={handleVoiceResult}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            onStopSpeaking={handleStopSpeaking}
            isSpeaking={agentState === "speaking"}
          />
        </div>
      </div>

      {/* Confirmation modal */}
      {pendingAction && (
        <ConfirmationModal
          action={pendingAction}
          onConfirm={() => handleConfirmAction(true)}
          onCancel={() => handleConfirmAction(false)}
        />
      )}
    </main>
  );
}
