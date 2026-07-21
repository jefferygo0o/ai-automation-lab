import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Globe, FolderTree, Timer, LayoutDashboard,
  Wand2, Wrench, Compass, Puzzle,
  Server, Search, MessageSquare, Trash2,
  Settings, PanelRightClose, PanelRightOpen, Terminal,
} from "lucide-react";
import { useAuth } from "../state/auth";
import { Chats, type Chat } from "../api";
import { useTabStore } from "../stores/tabStore";

const NAV_ITEMS = [
  { to: "/web-space", label: "Web Space", icon: Globe },
  { to: "/chats", label: "Home", icon: LayoutDashboard },
  { to: "/files", label: "Files", icon: FolderTree },
  { to: "/automations", label: "Automations", icon: Timer },
  { to: "/integrations", label: "Integrations", icon: Puzzle },
  { to: "/skills", label: "Skills", icon: Wand2 },
  { to: "/browser", label: "Browser", icon: Compass },
  { to: "/sites", label: "Hosting", icon: Server },
  { to: "/terminal", label: "Terminal", icon: Terminal },
];

export default function LeftRail() {
  const [collapsed, setCollapsed] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [showAllChats, setShowAllChats] = useState(false);
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const openPageTab = useTabStore((s) => s.openPageTab);
  const openChatTab = useTabStore((s) => s.openChatTab);

  useEffect(() => {
    Chats.list().then(({ chats: list }) => setChats(list)).catch(() => {});
  }, [loc.pathname]);

  const displayChats = showAllChats ? chats : chats.slice(0, 5);

  function handleNav(to: string) {
    const label = NAV_ITEMS.find((n) => n.to === to)?.label ?? to;
    openPageTab(to, label);
    navigate(to);
  }

  function handleChatClick(chatId: string, title?: string) {
    openChatTab(chatId, title || "Chat");
  }

  async function handleDeleteChat(e: React.MouseEvent, chatId: string) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    try {
      await Chats.remove(chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    } catch {}
  }

  function isActive(to: string) {
    return loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
  }

  // ── Collapsed: 44px icon-only nav ──
  if (collapsed) {
    return (
      <aside className="w-[44px] shrink-0 border-r border-border bg-sidebar flex flex-col items-center h-full z-20">
        <div className="h-8 flex items-center justify-center w-full mt-1">
          <div
            className="w-7 h-7 grid place-items-center bg-foreground text-background font-serif text-sm font-bold cursor-pointer rounded-md"
            onClick={() => handleNav("/chats")}
          >
            L
          </div>
        </div>

        <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-1 mt-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => handleNav(to)}
              title={label}
              className={`flex items-center justify-center h-8 w-8 rounded-md transition-colors duration-75 ${
                isActive(to)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="w-[18px] h-[18px] stroke-[1.5]" />
            </button>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-accent-foreground hover:bg-accent/50 mb-2"
          title="Expand sidebar"
        >
          <PanelRightClose className="w-[18px] h-[18px] stroke-[1.5]" />
        </button>
      </aside>
    );
  }

  // ── Expanded: ~317px sidebar with labels, chats, user footer ──
  return (
    <aside className="shrink-0 border-r border-border bg-sidebar flex flex-col h-full z-20 relative select-none" style={{ width: "316.667px" }}>
      {/* Header: logo + collapse */}
      <div className="flex h-8 w-full items-center px-0.5 mt-1">
        <button
          onClick={() => handleNav("/chats")}
          className="flex-none h-8 flex items-center justify-center rounded-md transition-colors duration-150 w-12 hover:bg-accent/30"
          title="Home"
        >
          <div className="w-7 h-7 grid place-items-center bg-foreground text-background font-serif text-sm font-bold rounded-md">
            L
          </div>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(true)}
          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
          title="Collapse sidebar"
        >
          <PanelRightOpen className="w-[18px] h-[18px] stroke-[1.5]" />
        </button>
      </div>

      {/* Navigation items with labels */}
      <div className="flex flex-col flex-none px-1 pt-1.5 gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <button
            key={to}
            onClick={() => handleNav(to)}
            className={`group flex items-center rounded-lg h-8 w-full transition-colors duration-75 ${
              isActive(to)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
            }`}
          >
            <div className="h-full flex-none flex items-center justify-center w-9">
              <Icon className="w-[18px] h-[18px] stroke-[1.5]" />
            </div>
            <div className="flex items-center gap-1.5 overflow-hidden pl-0.5 flex-1 min-w-0">
              <span className="text-sm leading-5 whitespace-nowrap min-w-0 truncate">{label}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col flex-none px-1 pt-2 gap-0.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 stroke-[1.5]" />
          <input
            placeholder="Search chats…"
            className="w-full h-8 pl-7 pr-2 text-xs bg-background/60 border border-border/40 rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/50"
          />
        </div>
      </div>

      {/* Recent chats */}
      <div className="flex min-h-0 flex-1 flex-col pt-1 px-1">
        <div className="relative flex h-full flex-col overflow-hidden min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto py-1">
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recent</span>
              {chats.length > 5 && (
                <button
                  onClick={() => setShowAllChats(!showAllChats)}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground"
                >
                  {showAllChats ? "Less" : "View all"}
                </button>
              )}
            </div>
            <div className="space-y-px">
              {displayChats.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-muted-foreground/40">No chats yet</p>
              )}
              {displayChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleChatClick(chat.id, chat.title)}
                  className="flex items-center gap-2 w-full h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-accent-foreground hover:bg-accent/50 transition-colors duration-75 text-left group"
                >
                  <MessageSquare className="w-3 h-3 stroke-[1.5] shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{chat.title || "Untitled"}</span>
                  <button
                    onClick={(e) => handleDeleteChat(e, chat.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-opacity"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3 h-3 stroke-[1.5]" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: email + settings */}
      <div className="flex-none px-1 pb-2">
        <div className="flex w-full items-center gap-2 px-1 pt-2 border-t border-border">
          <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-transparent bg-transparent">
            <span className="text-xs text-muted-foreground font-mono truncate pl-1.5">{email || "blackbox"}</span>
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 stroke-[1.5]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
