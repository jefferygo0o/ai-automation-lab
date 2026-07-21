import { NavLink, useNavigate } from "react-router-dom";
import {
  Globe, FolderTree, Timer, LayoutDashboard,
  Wand2, Wrench, Compass, Puzzle,
  Server, PanelRightClose,
} from "lucide-react";
import { useChatPanel } from "../contexts/ChatPanelContext";

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

export default function LeftRail({
  onExpandPanel,
}: {
  onExpandPanel?: () => void;
}) {
  const navigate = useNavigate();
  const { chatId, closeChat } = useChatPanel();

  return (
    <aside className="w-[44px] shrink-0 border-r border-border bg-sidebar flex flex-col items-center h-full z-20">
      {/* Logo */}
      <div className="h-8 flex items-center justify-center w-full mt-1">
        <div
          className="w-7 h-7 grid place-items-center bg-foreground text-background font-serif text-sm font-bold cursor-pointer rounded-md"
          onClick={() => { closeChat(); navigate("/"); }}
        >
          L
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-1 mt-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/chats"}
            className={({ isActive }) =>
              `flex items-center justify-center h-8 w-8 rounded-md transition-colors duration-75 ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
              }`
            }
            title={label}
            onClick={() => closeChat()}
          >
            <Icon className="w-[18px] h-[18px] stroke-[1.5]" />
          </NavLink>
        ))}
      </nav>

      {/* Expand panel button */}
      <button
        onClick={() => onExpandPanel?.()}
        className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-accent-foreground hover:bg-accent/50 mb-2"
        title="Expand side panel"
      >
        <PanelRightClose className="w-[18px] h-[18px] stroke-[1.5]" />
      </button>
    </aside>
  );
}
