import { useNavigate, useLocation } from "react-router-dom";
import {
  Globe, FolderTree, Timer, LayoutDashboard,
  Wand2, Wrench, Compass, Puzzle,
  Server,
} from "lucide-react";
import { useTabStore } from "../stores/tabStore";

const NAV_ITEMS = [
  { to: "/web-space", label: "Web Space", icon: Globe },
  { to: "/chats", label: "Home", icon: LayoutDashboard },
  { to: "/files", label: "Files", icon: FolderTree },
  { to: "/automations", label: "Automations", icon: Timer },
  { to: "/integrations", label: "Integrations", icon: Puzzle },
  { to: "/mcp", label: "MCP", icon: Wrench },
  { to: "/skills", label: "Skills", icon: Wand2 },
  { to: "/browser", label: "Browser", icon: Compass },
  { to: "/sites", label: "Hosting", icon: Server },
];

export default function LeftRail() {
  const navigate = useNavigate();
  const loc = useLocation();
  const openPageTab = useTabStore((s) => s.openPageTab);

  function handleNav(to: string) {
    openPageTab(to, NAV_ITEMS.find((n) => n.to === to)?.label ?? to);
    navigate(to);
  }

  return (
    <aside className="w-[44px] shrink-0 border-r border-border bg-sidebar flex flex-col items-center h-full z-20">
      {/* Logo */}
      <div className="h-8 flex items-center justify-center w-full mt-1">
        <div
          className="w-7 h-7 grid place-items-center bg-foreground text-background font-serif text-sm font-bold cursor-pointer rounded-md"
          onClick={() => handleNav("/chats")}
        >
          L
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-1 mt-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive =
            loc.pathname === to ||
            (to !== "/" && loc.pathname.startsWith(to));
          return (
            <button
              key={to}
              onClick={() => handleNav(to)}
              title={label}
              className={`flex items-center justify-center h-8 w-8 rounded-md transition-colors duration-75 ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="w-[18px] h-[18px] stroke-[1.5]" />
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="mb-2" />
    </aside>
  );
}
