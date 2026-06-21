"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceControlsProps {
  isVoiceEnabled: boolean;
  isVoiceInputActive: boolean;
  setIsVoiceInputActive: (active: boolean) => void;
  onVoiceResult: (transcript: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onStopSpeaking: () => void;
  isSpeaking: boolean;
}

export default function VoiceControls({
  isVoiceEnabled,
  isVoiceInputActive,
  setIsVoiceInputActive,
  onVoiceResult,
  isMuted,
  onToggleMute,
  onStopSpeaking,
  isSpeaking,
}: VoiceControlsProps) {
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [supportStatus, setSupportStatus] = useState<"checking" | "supported" | "unsupported">("checking");

  // Check for browser support
  useEffect(() => {
    const hasSpeechRecognition =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    setSupportStatus(hasSpeechRecognition ? "supported" : "unsupported");
  }, []);

  // Start/stop speech recognition
  const startListening = useCallback(() => {
    if (!isVoiceEnabled || !isVoiceInputActive) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError("Speech recognition not supported in this browser.");
      setIsVoiceInputActive(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let finalTranscript = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + " ";
          } else {
            interimTranscript += result[0].transcript;
          }
        }
      };

      recognition.onerror = (event: Event) => {
        const err = event as SpeechRecognitionErrorEvent;
        setVoiceError(`Recognition error: ${err.error}`);
        setIsVoiceInputActive(false);
      };

      recognition.onend = () => {
        if (finalTranscript.trim()) {
          onVoiceResult(finalTranscript.trim());
        }
        setIsVoiceInputActive(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setVoiceError(null);
    } catch (err) {
      setVoiceError("Failed to start speech recognition.");
      setIsVoiceInputActive(false);
    }
  }, [isVoiceEnabled, isVoiceInputActive, setIsVoiceInputActive, onVoiceResult]);

  // Control listening state
  useEffect(() => {
    if (isVoiceInputActive) {
      startListening();
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isVoiceInputActive, startListening]);

  const toggleListening = () => {
    if (isVoiceInputActive) {
      setIsVoiceInputActive(false);
    } else {
      setVoiceError(null);
      setIsVoiceInputActive(true);
    }
  };

  // Load voices for speech synth preview
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices(); // trigger loading
      window.speechSynthesis.onvoiceschanged = () => setVoicesLoaded(true);
    }
  }, []);

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Microphone button */}
      <button
        onClick={toggleListening}
        disabled={supportStatus === "unsupported" || !isVoiceEnabled}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
          isVoiceInputActive
            ? "bg-red-500/20 border-2 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            : "bg-aura-surface border border-aura-border hover:border-aura-primary/50 hover:shadow-[0_0_15px_rgba(0,212,255,0.1)]"
        } disabled:opacity-30 disabled:cursor-not-allowed`}
        aria-label={isVoiceInputActive ? "Stop listening" : "Start listening"}
      >
        {isVoiceInputActive ? (
          <>
            <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" />
            </svg>
            {/* Animated rings */}
            <span className="absolute inset-0 rounded-full animate-ping bg-red-400/20" />
          </>
        ) : (
          <svg className="w-6 h-6 text-aura-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Mute/Unmute button for speech output */}
      <button
        onClick={onToggleMute}
        className={`p-3 rounded-full transition-all ${
          isMuted
            ? "bg-red-500/10 text-red-400 border border-red-500/30"
            : "bg-aura-surface border border-aura-border text-aura-muted hover:text-aura-text hover:border-aura-primary/30"
        }`}
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        )}
      </button>

      {/* Stop speaking */}
      {isSpeaking && (
        <button
          onClick={onStopSpeaking}
          className="p-3 rounded-full bg-aura-surface border border-aura-border text-aura-muted hover:text-aura-text transition-all"
          aria-label="Stop speaking"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
      )}

      {/* Voice error */}
      {voiceError && (
        <span className="text-xs text-red-400 absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
          {voiceError}
        </span>
      )}
    </div>
  );
}
