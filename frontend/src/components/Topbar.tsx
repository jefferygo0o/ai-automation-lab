import { useAuth } from "../state/auth";
import { useLocation } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { useChatPanel } from "../contexts/ChatPanelContext";

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  "/chats":       { eyebrow: "Workspace", title: "Chat" },
  "/agents":      { eyebrow: "Workspace", title: "Agents" },
  "/web-space":   { eyebrow: "Workspace", title: "Web Space" },
  "/files":       { eyebrow: "Workspace", title: "Files" },
  "/automations": { eyebrow: "Workspace", title: "Automations" },
  "/skills":      { eyebrow: "Library",   title: "Skills" },
  "/mcp":         { eyebrow: "Library",   title: "MCP Servers" },
  "/secrets":     { eyebrow: "System",    title: "Secrets" },
  "/runs":        { eyebrow: "System",    title: "Run History" },
  "/browser":     { eyebrow: "System",    title: "Browser" },
};

export default function Topbar() {
  const { email } = useAuth();
  const loc = useLocation();
  const match = Object.keys(TITLES).find((k) => loc.pathname.startsWith(k));
  const meta = TITLES[match ?? "/agents"] ?? TITLES["/agents"];
  const { isOpen, toggleChat } = useChatPanel();

  return (
    <header className="h-11 border-b border-line bg-paper-50 flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-2xs font-medium text-ink-400 uppercase tracking-[0.15em]">{meta.eyebrow}</span>
        <div className="w-px h-3 bg-line-soft" />
        <h1 className="text-sm font-semibold text-ink-900 tracking-tight">{meta.title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleChat}
          className={`btn btn-sm btn-icon gap-1.5 ${isOpen ? "text-ink-900 bg-paper-200" : "text-ink-400"} hover:text-ink-900`}
          title={isOpen ? "Close chat panel" : "Open chat panel"}
        >
          <MessagesSquare className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>
        <span className="text-2xs text-ink-400 font-mono">{email}</span>
      </div>
    </header>
  );
}
