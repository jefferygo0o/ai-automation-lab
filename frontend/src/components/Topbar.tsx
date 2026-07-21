import { Menu, PanelLeft, X, Globe, LayoutDashboard, FolderTree, Timer, Puzzle, Wrench, Wand2, Compass, Server, MessageSquare } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useChatPanel } from "../contexts/ChatPanelContext";

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
  const { chatId, closeChat } = useChatPanel();
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

      {/* Page title or chat tab */}
      {chatId ? (
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 h-7 rounded-md bg-accent/60 border border-border/60 px-2.5 text-xs font-medium text-foreground">
            <MessageSquare className="w-3.5 h-3.5 stroke-[1.5] text-muted-foreground" />
            <span className="truncate max-w-[180px]">Chat</span>
            <button
              onClick={closeChat}
              className="ml-1 flex items-center justify-center h-4 w-4 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Close chat"
            >
              <X className="w-3 h-3 stroke-[1.5]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground ml-1 min-w-0 flex-1">
          <Icon className="w-[16px] h-[16px] stroke-[1.5] text-muted-foreground shrink-0" />
          <span className="truncate">{current.label}</span>
        </div>
      )}
    </header>
  );
}
