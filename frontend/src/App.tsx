import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "./state/auth";
import LeftRail from "./components/LeftRail";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import ChatPanel from "./components/ChatPanel";
import { ChatPanelProvider, useChatPanel } from "./contexts/ChatPanelContext";
import { useBreakpoint } from "./hooks/useBreakpoint";
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
import IntegrationsPage from "./pages/IntegrationsPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import SitesPage from "./pages/SitesPage";

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const { chatId, closeChat } = useChatPanel();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

  // Mobile: single column with drawer
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0">
        <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden">
          <Topbar
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onToggleSidebar={() => setContextCollapsed(v => !v)}
          />
          <main className="flex-1 min-h-0 overflow-auto bg-background">
            {chatId ? <ChatPanel /> : children}
          </main>
        </div>
        <Sidebar
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          collapsed={false}
        />
      </div>
    );
  }

  // Desktop: Zo-style three-column layout
  return (
    <div className="flex h-screen w-full">
      {/* Left Rail — always-visible icon nav (44px) */}
      <LeftRail
        onExpandPanel={() => setContextCollapsed(false)}
      />

      {/* Context Panel — collapsible side panel with chat list (260px) */}
      <div
        className={`shrink-0 border-r border-border bg-sidebar flex flex-col transition-all duration-150 overflow-hidden ${
          contextCollapsed ? "w-0 border-transparent" : "w-[260px]"
        }`}
      >
        <Sidebar
          contextPanel
          collapsed={false}
          onToggleCollapse={() => setContextCollapsed(v => !v)}
        />
      </div>

      {/* Main Content — pages + chat tabs */}
      <div className="flex flex-col flex-1 min-h-0">
        <Topbar
          onToggleSidebar={() => setContextCollapsed(v => !v)}
        />
        <main className="flex-1 min-h-0 overflow-auto bg-background">
          {chatId ? <ChatPanel /> : children}
        </main>
      </div>
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const loc = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }
  return <>{children}</>;
}

export default function App() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ShellWithProvider>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/sites" element={<SitesPage />} />
                <Route path="/settings/*" element={<SettingsPage />} />
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
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="*" element={<Navigate to="/chats" replace />} />
              </Routes>
            </ShellWithProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
