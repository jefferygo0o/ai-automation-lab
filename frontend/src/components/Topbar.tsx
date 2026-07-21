import { Menu, LayoutDashboard } from "lucide-react";

export default function Topbar({
  onOpenMobileNav,
}: {
  onOpenMobileNav?: () => void;
} = {}) {
  return (
    <header className="h-10 border-b border-border bg-background flex items-center px-1 gap-1 shrink-0">
      {onOpenMobileNav && (
        <button
          onClick={onOpenMobileNav}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-[18px] h-[18px] stroke-[1.5]" />
        </button>
      )}

      <div className="flex items-center gap-2 text-sm font-medium text-foreground ml-1 min-w-0 flex-1">
        <LayoutDashboard className="w-[16px] h-[16px] stroke-[1.5] text-muted-foreground shrink-0" />
        <span className="truncate">AI Automation Lab</span>
      </div>
    </header>
  );
}
