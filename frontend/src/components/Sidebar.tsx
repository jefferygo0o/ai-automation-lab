import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot, MessagesSquare, Globe, FolderTree, Timer,
  Wand2, Wrench, KeyRound, History, Compass, Puzzle,
  Panel, PanelRightOpen, Plus, X, Sparkles, Clock,
  LayoutDashboard, Scale,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../state/auth";
import { Personas as PersonasApi, type Persona } from "../api";

const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/chats", label: "Chat", icon: MessagesSquare },
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/web-space", label: "Web Space", icon: Globe },
      { to: "/files", label: "Files", icon: FolderTree },
      { to: "/automations", label: "Automations", icon: Timer },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/skills", label: "Skills", icon: Wand2 },
      { to: "/mcp", label: "MCP", icon: Wrench },
      { to: "/integrations", label: "Integrations", icon: Puzzle },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", icon: Wrench },
      { to: "/browser", label: "Browser", icon: Compass },
    ],
  },
];

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);

  useEffect(() => {
    PersonasApi.list().then(({ personas }) => {
      setActivePersona(personas.find((p) => p.isActive) ?? null);
    }).catch(() => {});
  }, []);

  // Lock body scroll when the mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function handleNav(to: string) {
    navigate(to);
    onClose?.();
  }

  if (collapsed && !mobileOpen) {
    return (
      <aside className="w-[52px] shrink-0 border-r border-line bg-paper-50 flex flex-col items-center max-lg:hidden">
        <div className="h-12 flex items-center justify-center border-b border-line w-full">
          <div className="w-6 h-6 grid place-items-center bg-ink-900 text-paper-50 font-serif text-sm cursor-pointer" onClick={() => navigate("/")}>
            L
          </div>
        </div>
        {NAV_SECTIONS.map((section) =>
          section.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `w-full flex items-center justify-center h-9 text-ink-400 hover:text-ink-900 hover:bg-paper-200/60 transition-colors ${isActive ? "text-ink-900 bg-paper-200" : ""}`
              }
              title={label}
            >
              <Icon className="w-4 h-4 stroke-[1.5]" />
            </NavLink>
          ))
        )}
        {/* Collapsed persona dot */}
        {activePersona && (
          <div className="mt-auto w-full flex items-center justify-center h-9"
            title={`Persona: ${activePersona.name}`}>
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                backgroundColor: activePersona.imageHue >= 0
                  ? `hsl(${activePersona.imageHue}, 65%, 75%)`
                  : '#a1a1aa',
              }}
            />
          </div>
        )}
        <button
          onClick={() => setCollapsed(false)}
          className="mb-3 w-full flex items-center justify-center h-9 text-ink-400 hover:text-ink-900"
          title="Expand sidebar"
        >
          <PanelRightOpen className="w-4 h-4 stroke-[1.5]" />
        </button>
      </aside>
    );
  }

  return (
    <>
      {/* Mobile-only backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-ink-900/30 backdrop-blur-[1px] z-30"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={
          mobileOpen
            ? "lg:relative lg:translate-x-0 fixed inset-y-0 left-0 z-40 w-[260px] max-w-[85vw] shrink-0 border-r border-line bg-paper-50 flex flex-col shadow-xl transition-transform"
            : "w-[220px] shrink-0 border-r border-line bg-paper-50 flex flex-col max-lg:hidden"
        }
      >
      {/* Brand header — Zo-style */}
      <div className="px-4 h-12 flex items-center justify-between border-b border-line shrink-0">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => handleNav("/")}
        >
          <div className="w-7 h-7 grid place-items-center bg-ink-900 text-paper-50 font-serif text-base font-bold tracking-tight">
            L
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-900 tracking-tight">Lab</div>
            <div className="text-2xs text-ink-400 uppercase tracking-[0.15em]">Automation</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {mobileOpen && (
            <button
              onClick={onClose}
              className="btn btn-ghost btn-icon lg:hidden"
              title="Close menu"
            >
              <X className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
          )}
          {!mobileOpen && (
            <button
              onClick={() => setCollapsed(true)}
              className="btn btn-ghost btn-icon max-lg:hidden"
              title="Collapse sidebar"
            >
              <PanelRightOpen className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-2.5 pb-1 pt-0.5">
              <div className="eyebrow text-2xs tracking-[0.15em]">{section.label}</div>
            </div>
            <div className="space-y-px">
              {section.items.map(({ to, label, icon: Icon }) => (
                mobileOpen ? (
                  <button
                    key={to}
                    onClick={() => handleNav(to)}
                    className={`nav-item w-full text-left`}
                  >
                    <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                    <span>{label}</span>
                  </button>
                ) : (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                  >
                    <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                    <span>{label}</span>
                  </NavLink>
                )
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — user + quick actions */}
      <div className="border-t border-line p-2 space-y-1 shrink-0">
        <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {activePersona && (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: activePersona.imageHue >= 0
                      ? `hsl(${activePersona.imageHue}, 65%, 75%)`
                      : '#a1a1aa',
                  }}
                />
                <span className="text-2xs text-ink-500 font-medium truncate">
                  {activePersona.name}
                </span>
              </>
            )}
            <span className="text-2xs text-ink-400 font-mono truncate">{email}</span>
          </div>
          <button onClick={() => { logout(); onClose?.(); }} className="btn btn-ghost btn-icon shrink-0" title="Sign out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-[1.5]">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
        <button
          onClick={() => handleNav("/agents?new=1")}
          className="btn btn-sm w-full justify-start gap-2"
        >
          <Plus className="w-3.5 h-3.5 stroke-[1.75]" />
          <span>New Agent</span>
        </button>
      </div>
    </aside>
    </>
  );
}
