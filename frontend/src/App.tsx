import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./state/auth";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import ChatPanel from "./components/ChatPanel";
import { ChatPanelProvider, useChatPanel } from "./contexts/ChatPanelContext";
import LoginPage from "./pages/LoginPage";
import AgentsPage from "./pages/AgentsPage";
import AgentEditPage from "./pages/AgentEditPage";
import ChatsPage from "./pages/ChatsPage";
import SkillsPage from "./pages/SkillsPage";
import McpPage from "./pages/McpPage";
import SecretsPage from "./pages/SecretsPage";
import RunsPage from "./pages/RunsPage";
import WebSpacePage from "./pages/WebSpacePage";
import FilesPage from "./pages/FilesPage";
import AutomationsPage from "./pages/AutomationsPage";
import BrowserPage from "./pages/BrowserPage";

const HIDE_TOPBAR = ["/browser"];

/**
 * Inner shell that has access to ChatPanel context so it can
 * toggle chat panel visibility.
 */
function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const hideTopbar = HIDE_TOPBAR.some((p) => loc.pathname.startsWith(p));

  return (
    <div className="grid grid-cols-[220px_1fr_420px] h-full">
      <Sidebar />
      <div className="flex flex-col h-full overflow-hidden">
        {!hideTopbar && <Topbar />}
        <main className={`flex-1 overflow-auto ${!hideTopbar ? "bg-paper-50" : ""}`}>
          {children}
        </main>
      </div>
      <ChatPanel />
    </div>
  );
}

function ShellWithProvider({ children }: { children: React.ReactNode }) {
  return (
    <ChatPanelProvider>
      <Shell>{children}</Shell>
    </ChatPanelProvider>
  );
}

export default function App() {
  const { token } = useAuth();
  if (!token) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;
  return (
    <ShellWithProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/chats" replace />} />
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:id" element={<AgentEditPage />} />
        <Route path="/web-space" element={<WebSpacePage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/mcp" element={<McpPage />} />
        <Route path="/secrets" element={<SecretsPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/browser" element={<BrowserPage />} />
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
    </ShellWithProvider>
  );
}
