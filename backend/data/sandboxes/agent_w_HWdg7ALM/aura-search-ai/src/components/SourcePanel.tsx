"use client";

import type { Source } from "@/lib/types";

interface SourcePanelProps {
  sources: Source[];
  isVisible: boolean;
  onToggle: () => void;
}

export default function SourcePanel({ sources, isVisible, onToggle }: SourcePanelProps) {
  return (
    <div className="h-full flex flex-col">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-aura-surface/50 border border-aura-border/50 hover:border-aura-primary/30 transition-all"
      >
        <span className="text-sm font-medium text-aura-text/80 flex items-center gap-2">
          <svg className="w-4 h-4 text-aura-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Sources ({sources.length})
        </span>
        <svg
          className={`w-4 h-4 text-aura-muted transition-transform ${isVisible ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isVisible && (
        <div className="flex-1 overflow-y-auto mt-3 space-y-2">
          {sources.map((source, idx) => (
            <a
              key={idx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg bg-aura-surface/30 border border-aura-border/30 hover:border-aura-primary/30 hover:bg-aura-surface/50 transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-aura-primary/60 mt-0.5 shrink-0 w-5">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-aura-text group-hover:text-aura-primary transition-colors line-clamp-2">
                    {source.title || "Untitled"}
                  </p>
                  <p className="text-xs text-aura-muted mt-1 line-clamp-2">
                    {source.snippet || "No description"}
                  </p>
                  <p className="text-[10px] text-aura-muted/50 mt-1 truncate">
                    {source.url}
                  </p>
                  {source.publishedDate && (
                    <p className="text-[10px] text-aura-muted/40 mt-0.5">
                      {new Date(source.publishedDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {!isVisible && sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.slice(0, 5).map((source, idx) => (
            <a
              key={idx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] px-2 py-0.5 rounded-full bg-aura-surface/40 border border-aura-border/30 text-aura-muted hover:text-aura-primary hover:border-aura-primary/30 transition-all truncate max-w-[120px]"
            >
              {idx + 1}. {source.title?.slice(0, 30) || "Link"}
            </a>
          ))}
          {sources.length > 5 && (
            <span className="text-[10px] text-aura-muted/50 px-1">+{sources.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  );
}
