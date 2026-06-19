"use client";

import { ArrowRight, Bot, Check, ChevronDown, Paperclip, Loader2 } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Model preset icons ───
const OPENAI_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 260" className="shrink-0">
    <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" fill="currentColor"/>
  </svg>
);

const ANTHROPIC_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className="shrink-0" fill="currentColor">
    <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"/>
  </svg>
);

const MOCK_ICON = (
  <div className="w-4 h-4 rounded-full border border-dashed border-ink-300 grid place-items-center shrink-0">
    <span className="text-[8px] font-bold text-ink-400">M</span>
  </div>
);

interface ModelPreset {
  id: string;
  provider: string;
  model: string;
  label: string;
  icon?: React.ReactNode;
}

const DEFAULT_PRESETS: ModelPreset[] = [
  { id: "mock", provider: "mock", model: "mock", label: "Mock LLM", icon: MOCK_ICON },
  { id: "openai/gpt-4.1-mini", provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 Mini", icon: OPENAI_ICON },
  { id: "openai/gpt-4.1", provider: "openai", model: "gpt-4.1", label: "GPT-4.1", icon: OPENAI_ICON },
  { id: "openai/o3-mini", provider: "openai", model: "o3-mini", label: "o3-mini", icon: OPENAI_ICON },
  { id: "anthropic/claude-sonnet-4-20250514", provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", icon: ANTHROPIC_ICON },
  { id: "anthropic/claude-3-5-haiku", provider: "anthropic", model: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", icon: ANTHROPIC_ICON },
];

interface AIInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  availableModels?: ModelPreset[];
  isStreaming?: boolean;
  onCancel?: () => void;
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: {
  minHeight: number;
  maxHeight?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rafRef = useRef<number | null>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        textarea.style.overflowY = "hidden";
        return;
      }
      // Defer forced-reflow to next frame so it doesn't block input handler
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        textarea.style.height = `${minHeight}px`;
        const newHeight = Math.max(
          minHeight,
          Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
        );
        textarea.style.height = `${newHeight}px`;
        textarea.style.overflowY = newHeight >= (maxHeight ?? Infinity) ? "auto" : "hidden";
      });
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

export function AIInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "What can I do for you?",
  selectedModel,
  onModelChange,
  availableModels = DEFAULT_PRESETS,
  isStreaming = false,
  onCancel,
}: AIInputProps) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  });

  const modelMap = new Map(availableModels.map((m) => [m.id, m]));
  const selected = modelMap.get(selectedModel) ?? availableModels[0];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim() && !disabled) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="w-full">
      <div className="rounded-sm border border-line bg-paper-50/90 backdrop-blur-sm transition-colors focus-within:border-ink-700">
        <div className="relative flex flex-col">
          <div className="overflow-y-auto" style={{ maxHeight: "300px" }}>
            <Textarea
              ref={textareaRef}
              value={value}
              placeholder={placeholder}
              onChange={(e) => {
                onChange(e.target.value);
                adjustHeight();
              }}
              disabled={disabled}
              className={cn(
                "w-full rounded-sm rounded-b-none px-4 py-3",
                "border-none bg-transparent",
                "text-ink-900 placeholder:text-ink-400",
                "resize-none",
                "min-h-[52px]",
                "focus-visible:ring-0 focus-visible:ring-offset-0"
              )}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="h-12 bg-paper-50/90 rounded-b-sm flex items-center border-t border-line-soft">
            <div className="absolute left-3 right-3 bottom-2.5 flex items-center justify-between w-[calc(100%-24px)]">
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      disabled={disabled}
                      className={cn(
                        "flex items-center gap-1.5 h-7 pl-1.5 pr-2",
                        "text-xs rounded-sm",
                        "text-ink-600",
                        "focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-ink-400"
                      )}
                    >
                      <div className="flex items-center gap-1.5 transition-opacity duration-100">
                        {selected.icon ?? <Bot className="w-3.5 h-3.5 text-ink-400" />}
                        <span className="font-medium">{selected.label}</span>
                        <ChevronDown className="w-3 h-3 text-ink-300" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className={cn(
                      "min-w-[11rem]",
                      "border border-line",
                      "bg-paper-50 shadow-pop"
                    )}
                  >
                    {availableModels.map((model) => (
                      <DropdownMenuItem
                        key={model.id}
                        onSelect={() => onModelChange(model.id)}
                        className={cn(
                          "flex items-center justify-between gap-2",
                          "text-xs text-ink-700",
                          selectedModel === model.id && "bg-paper-200 text-ink-900"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {model.icon ?? <Bot className="w-3.5 h-3.5 text-ink-400" />}
                          <span>{model.label}</span>
                        </div>
                        {selectedModel === model.id && (
                          <Check className="w-3.5 h-3.5 text-ink-900" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="h-4 w-px bg-line-soft" />
                <label
                  className={cn(
                    "rounded-sm p-1.5 cursor-pointer",
                    "text-ink-300 hover:text-ink-700 hover:bg-paper-200/60 transition-colors",
                    "focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-ink-400",
                    disabled && "opacity-50 pointer-events-none"
                  )}
                  aria-label="Attach file"
                >
                  <input type="file" className="hidden" />
                  <Paperclip className="w-3.5 h-3.5" />
                </label>
              </div>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className={cn(
                    "rounded-sm p-1.5",
                    "text-err hover:bg-err/10 transition-colors",
                    "focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-err"
                  )}
                  aria-label="Stop generating"
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin stroke-[2]" />
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!value.trim()}
                  className={cn(
                    "rounded-sm p-1.5 transition-colors",
                    "text-ink-400 hover:text-ink-900 hover:bg-paper-200/60",
                    "focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-ink-400",
                    !value.trim() && "opacity-30 cursor-default"
                  )}
                  aria-label="Send message"
                >
                  <ArrowRight className="w-3.5 h-3.5 stroke-[1.75]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ModelPreset };