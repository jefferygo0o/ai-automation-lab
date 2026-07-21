import { useLocation, NavLink } from "react-router-dom";
import { Menu, PanelLeft } from "lucide-react";

const TABS = [
  { to: "/chats", label: "Home" },
  { to: "/web-space", label: "Web Space" },
  { to: "/files", label: "Files" },
  { to: "/automations", label: "Automations" },
  { to: "/integrations", label: "Integrations" },
  { to: "/mcp", label: "MCP" },
  { to: "/skills", label: "Skills" },
  { to: "/browser", label: "Browser" },
  { to: "/sites", label: "Hosting" },
];

export default function Topbar({
  onOpenMobileNav,
  onToggleSidebar,
}: {
  onOpenMobileNav?: () => void;
  onToggleSidebar?: () => void;
} = {}) {
  const loc = useLocation();

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
    </header>
  );
}
