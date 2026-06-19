import { Loader2 } from "lucide-react";

export default function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 px-1 select-none">
      <Loader2 className="w-3.5 h-3.5 stroke-[1.5] text-ink-400 animate-spin" />
      <span className="text-xs text-ink-400 font-medium tracking-tight">Thinking</span>
      <span className="flex items-center gap-[3px]">
        <span className="w-[5px] h-[5px] rounded-full bg-ink-300 animate-think-dot" />
        <span className="w-[5px] h-[5px] rounded-full bg-ink-300 animate-think-dot [animation-delay:0.2s]" />
        <span className="w-[5px] h-[5px] rounded-full bg-ink-300 animate-think-dot [animation-delay:0.4s]" />
      </span>
    </div>
  );
}
