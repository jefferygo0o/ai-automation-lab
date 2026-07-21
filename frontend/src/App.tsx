import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useAuth } from "./state/auth";
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
  const { chatId } = useChatPanel();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

  /** Sidebar width in px */
  const sidebarW = sidebarCollapsed ? 44 : 260;

  // Mobile: single column, sidebar as drawer
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0">
        <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden">
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="flex-1 min-h-0 overflow-auto bg-background">
            {children}
          </main>
          {/* Mobile chat sheet */}
          {chatId && (
            <div className="fixed inset-0 z-50 flex">
              <div className="flex-1 bg-foreground/20" />
              <div className="w-full max-w-md bg-background h-full shadow-2xl flex flex-col min-h-0 overflow-hidden">
                <ChatPanel />
              </div>
            </div>
          )}
        </div>
        <Sidebar
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          collapsed={false}
        />
      </div>
    );
  }

  // Desktop: Zo-style layout — sidebar overlay + panel group
  return (
    <div className="flex h-screen w-full">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — absolutely positioned overlay, Zo-style */}
        <div
          className="absolute left-0 top-0 bottom-0 z-30 flex flex-col"
          style={{ width: sidebarW }}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          />
        </div>

        {/* Resizable panel group: main content | chat panel */}
        <Group direction="horizontal" className="h-full w-full">
          <Panel defaultSize={58} minSize={30} id="main-content">
            <div className="flex flex-col h-full min-h-0">
              <Topbar onToggleSidebar={() => setSidebarCollapsed(v => !v)} />
              <main className="flex-1 min-h-0 overflow-auto bg-background">
                {children}
              </main>
            </div>
          </Panel>
          <Separator className="group/resizer relative flex items-center justify-center w-[7px] cursor-col-resize">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/40 transition-colors group-hover/resizer:bg-border/80" />
          </Separator>
          <Panel defaultSize={42} minSize={25} maxSize={55} id="chat-sidebar">
            <div className="h-full flex flex-col min-h-0 border-l border-border">
              <ChatPanel />
            </div>
          </Panel>
        </Group>
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
