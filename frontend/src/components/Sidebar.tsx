import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Globe, FolderTree, Timer, LayoutDashboard,
  Wand2, Wrench, Compass, Puzzle,
  PanelRightOpen, PanelRightClose, Plus, X,
  Settings, Server, Search, Trash2, MessageSquare,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../state/auth";
import { Personas as PersonasApi, type Persona, Chats, type Chat } from "../api";
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

export default function Sidebar({
  mobileOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
  contextPanel = false,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  contextPanel?: boolean;
} = {}) {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [showAllChats, setShowAllChats] = useState(false);
  const { openChat } = useChatPanel();

  useEffect(() => {
    PersonasApi.list().then(({ personas }) => {
      setActivePersona(personas.find((p) => p.isActive) ?? null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Chats.list().then(({ chats: list }) => setChats(list)).catch(() => {});
  }, [loc.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  // When used as context panel on desktop, navigate on click
  // When used as drawer on mobile, close drawer on click
  function handleNav(to: string) {
    navigate(to);
    onClose?.();
  }

  function handleChatClick(chatId: string) {
    openChat(chatId);
    onClose?.();
  }

  async function handleDeleteChat(e: React.MouseEvent, chatId: string) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    try {
      await Chats.remove(chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    } catch {}
  }

  const displayChats = showAllChats ? chats : chats.slice(0, 5);

  // Collapsed icon-only mode (desktop, non-panel mode) — same as before
  if (collapsed && !mobileOpen && !contextPanel) {
    return (
      <aside className="w-[44px] shrink-0 border-r border-border bg-sidebar flex flex-col items-center max-lg:hidden h-full">
        <div className="h-8 flex items-center justify-center w-full mt-1">
          <div
            className="w-7 h-7 grid place-items-center bg-foreground text-background font-serif text-sm font-bold cursor-pointer rounded-md"
            onClick={() => navigate("/")}
          >
            L
          </div>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-1 mt-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center justify-center h-8 w-8 rounded-md transition-colors duration-75 ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
                }`
              }
              title={label}
            >
              <Icon className="w-[18px] h-[18px] stroke-[1.5]" />
            </NavLink>
          ))}
        </nav>
        {activePersona && (
          <div
            className="w-2 h-2 rounded-full mb-1"
            style={{
              backgroundColor: activePersona.imageHue >= 0
                ? `hsl(${activePersona.imageHue}, 65%, 75%)`
                : "hsl(var(--muted-foreground))",
            }}
          />
        )}
        <button
          onClick={() => onToggleCollapse?.()}
          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-accent-foreground hover:bg-accent/50 mb-2"
          title="Expand sidebar"
        >
          <PanelRightClose className="w-[18px] h-[18px] stroke-[1.5]" />
        </button>
      </aside>
    );
  }

  // Determine if this is a mobile drawer or desktop context panel
  const isDrawer = mobileOpen;
  const isPanel = contextPanel && !mobileOpen;

  return (
    <>
      {isDrawer && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={
          isDrawer
            ? "fixed inset-y-0 left-0 z-40 w-[280px] max-w-[85vw] shrink-0 border-r border-border bg-sidebar flex flex-col shadow-xl"
            : "w-full shrink-0 border-r border-border bg-sidebar flex flex-col h-full"
        }
      >
        {/* Header — only show in drawer mode */}
        {isDrawer && (
          <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => handleNav("/")}
            >
              <div className="w-7 h-7 grid place-items-center bg-foreground text-background font-serif text-sm font-bold rounded-md">
                L
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-foreground tracking-tight">Lab</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-[0.15em] leading-none">Automation</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
              title="Close menu"
            >
              <X className="w-[16px] h-[16px] stroke-[1.5]" />
            </button>
          </div>
        )}

        {/* Navigation — only in drawer mode (desktop panel uses LeftRail) */}
        {isDrawer && (
          <nav className="px-2 py-1.5 space-y-0.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <button
                key={to}
                onClick={() => handleNav(to)}
                className={`flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-sm transition-colors duration-75 ${
                  loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to))
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
                }`}
              >
                <Icon className="w-[16px] h-[16px] stroke-[1.5]" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Panel title for context panel mode */}
        {isPanel && (
          <div className="h-10 flex items-center gap-2 px-3 border-b border-border shrink-0">
            <LayoutDashboard className="w-[16px] h-[16px] stroke-[1.5] text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Home</span>
            <button
              onClick={() => onToggleCollapse?.()}
              className="ml-auto flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-accent-foreground hover:bg-accent/50"
              title="Collapse side panel"
            >
              <PanelRightOpen className="w-[16px] h-[16px] stroke-[1.5]" />
            </button>
          </div>
        )}

        {/* Chat search */}
        <div className="px-2 pt-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 stroke-[1.5]" />
            <input
              placeholder="Search chats\u2026"
              className="w-full h-7 pl-7 pr-2 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/50"
            />
          </div>
        </div>

        {/* Recent chats */}
        <div className="flex-1 overflow-y-auto px-2 pt-1.5">
          <div className="flex items-center justify-between px-2.5 py-1">
            <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent
            </span>
            {chats.length > 5 && (
              <button
                onClick={() => setShowAllChats(!showAllChats)}
                className="text-2xs text-muted-foreground/60 hover:text-foreground"
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
                onClick={() => handleChatClick(chat.id)}
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

        {/* Footer — user info + logout */}
        <div className="border-t border-border px-2 py-2 space-y-1 shrink-0">
          <div className="flex items-center gap-2 px-2 py-1">
            {activePersona && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: activePersona.imageHue >= 0
                    ? `hsl(${activePersona.imageHue}, 65%, 75%)`
                    : "hsl(var(--muted-foreground))",
                }}
              />
            )}
            <NavLink
              to="/settings"
              className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent/50"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5 stroke-[1.5]" />
            </NavLink>
            <span className="text-2xs text-muted-foreground font-mono truncate flex-1">{email}</span>
            <button
              onClick={() => { logout(); onClose?.(); }}
              className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
              title="Sign out"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-[1.5]">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
