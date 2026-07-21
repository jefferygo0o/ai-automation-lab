import { Menu, PanelLeft, Globe, LayoutDashboard, FolderTree, Timer, Puzzle, Wrench, Wand2, Compass, Server } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, { label: string; icon: typeof Globe }> = {
  "/chats": { label: "Home", icon: LayoutDashboard },
  "/web-space": { label: "Web Space", icon: Globe },
  "/files": { label: "Files", icon: FolderTree },
  "/automations": { label: "Automations", icon: Timer },
  "/integrations": { label: "Integrations", icon: Puzzle },
  "/mcp": { label: "MCP", icon: Wrench },
  "/skills": { label: "Skills", icon: Wand2 },
  "/browser": { label: "Browser", icon: Compass },
  "/sites": { label: "Hosting", icon: Server },
};

export default function Topbar({
  onOpenMobileNav,
  onToggleSidebar,
}: {
  onOpenMobileNav?: () => void;
  onToggleSidebar?: () => void;
} = {}) {
  const loc = useLocation();
  const current = Object.entries(pageTitles).find(([path]) =>
    path === "/"
      ? loc.pathname === "/"
      : loc.pathname.startsWith(path)
  )?.[1] ?? { label: "Lab", icon: LayoutDashboard };
  const Icon = current.icon;

  return (
    <header className="h-10 border-b border-border bg-background flex items-center px-1 gap-1 shrink-0">
      {onOpenMobileNav && (
        <button
          onClick={onOpenMobileNav}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="w-[18px] h-[18px] stroke-[1.5]" />
        </button>
      )}
      <button
        onClick={onToggleSidebar}
        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0 max-lg:hidden"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="w-[18px] h-[18px] stroke-[1.5]" />
      </button>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground ml-1">
        <Icon className="w-[16px] h-[16px] stroke-[1.5] text-muted-foreground" />
        <span>{current.label}</span>
      </div>
    </header>
  );
}
