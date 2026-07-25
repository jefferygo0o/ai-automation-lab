import { Plus, X } from "lucide-react";

type AnyTab = { id: string; label?: string; title?: string };

export default function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNewChat,
  label,
}: {
  tabs: AnyTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewChat?: () => void;
  label: string;
}) {
  return (
    <div className="h-9 border-b border-border bg-sidebar flex items-center shrink-0 overflow-hidden">
      <div className="flex items-center gap-px h-full overflow-x-auto scrollbar-hide flex-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const tabLabel = "label" in tab ? tab.label : ("title" in tab ? tab.title : tab.id);
          return (
            <div
              key={tab.id}
              className={`group flex items-center gap-1 h-full px-3 text-xs border-r border-border/50 cursor-pointer select-none shrink-0 transition-colors ${
                isActive
                  ? "bg-background text-foreground font-medium"
                  : "text-muted-foreground/70 hover:text-foreground hover:bg-accent/30"
              }`}
              onClick={() => onSelect(tab.id)}
            >
              <span className="truncate max-w-[140px]">{tabLabel || "Untitled"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="ml-0.5 flex items-center justify-center h-4 w-4 rounded-sm text-muted-foreground/40 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <X className="w-3 h-3 stroke-[1.5]" />
              </button>
            </div>
          );
        })}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="flex items-center justify-center h-full px-2.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/40 shrink-0 transition-colors"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {tabs.length === 0 && (
        <span className="text-2xs font-medium text-muted-foreground/40 uppercase tracking-wider px-3 shrink-0">
          {label}
        </span>
      )}
    </div>
  );
}
