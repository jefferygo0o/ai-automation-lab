import { useLocation, NavLink } from "react-router-dom";
import { useAuth } from "../state/auth";
import { Menu } from "lucide-react";
import { useChatPanel } from "../contexts/ChatPanelContext";

const TABS = [
  { to: "/chats", label: "Chats" },
  { to: "/agents", label: "Agents" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/automations", label: "Automations" },
  { to: "/skills", label: "Skills" },
  { to: "/integrations", label: "Integrations" },
  { to: "/mcp", label: "MCP" },
  { to: "/web-space", label: "Web Space" },
  { to: "/files", label: "Files" },
  { to: "/browser", label: "Browser" },
  { to: "/settings", label: "Settings" },
];

export default function Topbar({
  onOpenMobileNav,
  onToggleSidebar,
}: {
  onOpenMobileNav?: () => void;
  onToggleSidebar?: () => void;
} = {}) {
  const loc = useLocation();
  const { toggleChat, isOpen } = useChatPanel();

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
      <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide min-w-0">
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `h-7 px-3 flex items-center text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={toggleChat}
          className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
            isOpen
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
          title={isOpen ? "Close chat panel" : "Open chat panel"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
