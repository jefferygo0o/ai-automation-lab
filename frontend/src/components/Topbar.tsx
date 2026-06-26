import { useAuth } from "../state/auth";
import { useLocation } from "react-router-dom";
import { MessagesSquare, Menu } from "lucide-react";
import { useChatPanel } from "../contexts/ChatPanelContext";

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  "/dashboard":  { eyebrow: "Workspace", title: "Dashboard" },
  "/rules":      { eyebrow: "Workspace", title: "Rules" },
  "/chats":       { eyebrow: "Workspace", title: "Chat" },
  "/agents":      { eyebrow: "Workspace", title: "Agents" },
  "/web-space":   { eyebrow: "Workspace", title: "Web Space" },
  "/files":       { eyebrow: "Workspace", title: "Files" },
  "/automations": { eyebrow: "Workspace", title: "Automations" },
  "/skills":      { eyebrow: "Library",   title: "Skills" },
  "/mcp":         { eyebrow: "Library",   title: "MCP Servers" },
  "/integrations":{ eyebrow: "Library",   title: "Integrations" },
  "/personas":    { eyebrow: "System",    title: "Personas" },
  "/timeline":    { eyebrow: "System",    title: "Timeline" },
  "/secrets":     { eyebrow: "System",    title: "Secrets" },
  "/runs":        { eyebrow: "System",    title: "Run History" },
  "/browser":     { eyebrow: "System",    title: "Browser" },
};

export default function Topbar({ onOpenMobileNav }: { onOpenMobileNav?: () => void } = {}) {
  const { email } = useAuth();
  const loc = useLocation();
  const match = Object.keys(TITLES).find((k) => loc.pathname.startsWith(k));
  const meta = TITLES[match ?? "/agents"] ?? TITLES["/agents"];
  const { isOpen, toggleChat } = useChatPanel();

  return (
    <header className="h-11 border-b border-line bg-paper-50 flex items-center justify-between px-3 sm:px-5 shrink-0 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            className="btn btn-ghost btn-icon lg:hidden shrink-0"
            title="Open menu"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4 stroke-[1.75]" />
          </button>
        )}
        <span className="text-2xs font-medium text-ink-400 uppercase tracking-[0.15em] hidden sm:inline">{meta.eyebrow}</span>
        <div className="w-px h-3 bg-line-soft hidden sm:block" />
        <h1 className="text-sm font-semibold text-ink-900 tracking-tight truncate">{meta.title}</h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggleChat}
          className={`btn btn-sm btn-icon gap-1.5 ${isOpen ? "text-ink-900 bg-paper-200" : "text-ink-400"} hover:text-ink-900`}
          title={isOpen ? "Close chat panel" : "Open chat panel"}
        >
          <MessagesSquare className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>
        <span className="text-2xs text-ink-400 font-mono hidden sm:inline truncate max-w-[180px]">{email}</span>
      </div>
    </header>
  );
}
