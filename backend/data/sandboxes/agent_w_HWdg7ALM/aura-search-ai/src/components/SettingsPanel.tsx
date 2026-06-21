"use client";

interface SettingsPanelProps {
  isVoiceEnabled: boolean;
  setIsVoiceEnabled: (enabled: boolean) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  onClose: () => void;
}

export default function SettingsPanel({
  isVoiceEnabled,
  setIsVoiceEnabled,
  isMuted,
  setIsMuted,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-aura-border/60 bg-aura-surface/95 backdrop-blur-xl shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-aura-border/30">
          <h2 className="text-lg font-semibold text-aura-text">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-aura-muted hover:text-aura-text hover:bg-aura-border/30 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Voice Input */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-aura-text">Voice Input</p>
              <p className="text-xs text-aura-muted">Enable microphone for speech-to-text</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isVoiceEnabled}
                onChange={(e) => setIsVoiceEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 rounded-full peer bg-aura-border peer-checked:bg-gradient-to-r peer-checked:from-aura-primary peer-checked:to-aura-secondary peer-focus:outline-none after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

          {/* Speech Output (Mute) */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-aura-text">Speech Output</p>
              <p className="text-xs text-aura-muted">AI speaks responses aloud</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!isMuted}
                onChange={(e) => setIsMuted(!e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 rounded-full peer bg-aura-border peer-checked:bg-gradient-to-r peer-checked:from-aura-primary peer-checked:to-aura-secondary peer-focus:outline-none after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

          {/* LLM Provider Info */}
          <div className="p-3 rounded-lg bg-aura-bg/50 border border-aura-border/30">
            <p className="text-xs font-medium text-aura-muted uppercase tracking-wider mb-1">LLM Provider</p>
            <p className="text-sm text-aura-text">Default: Ollama (local)</p>
            <p className="text-xs text-aura-muted mt-1">
              Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env.local to configure.
              Supports OpenAI-compatible APIs too.
            </p>
          </div>

          {/* Search Provider Info */}
          <div className="p-3 rounded-lg bg-aura-bg/50 border border-aura-border/30">
            <p className="text-xs font-medium text-aura-muted uppercase tracking-wider mb-1">Search Provider</p>
            <p className="text-sm text-aura-text">Default: DuckDuckGo (free)</p>
            <p className="text-xs text-aura-muted mt-1">
              Configure Brave, Tavily, or SearXNG via environment variables.
            </p>
          </div>

          {/* About */}
          <div className="pt-2 text-center">
            <p className="text-xs text-aura-muted/50">
              AuraSearch AI v0.1.0 — Built with Next.js, Three.js, and local-first AI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
