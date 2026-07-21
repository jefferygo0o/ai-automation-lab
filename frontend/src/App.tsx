import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useRef, useEffect, useCallback, useState } from "react";
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
  const { isOpen, panelWidth, setPanelWidth, closeChat } = useChatPanel();
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const isTablet = bp === "tablet";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      setPanelWidth(dragRef.current.startWidth - dx);
    }
    function onMouseUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    if (dragRef.current) {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [setPanelWidth]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: panelWidth };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  /** Sidebar dimensions */
  const sidebarW = sidebarCollapsed ? 44 : 260;

  // Mobile: single column, sidebar as drawer, chat as full-width sheet
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0">
        <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden">
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="flex-1 min-h-0 overflow-auto bg-background">
            {children}
          </main>
        </div>
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} collapsed={false} />
        {isOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 h-full bg-foreground/20" onClick={closeChat} />
            <div className="w-full max-w-md bg-background h-full shadow-2xl flex flex-col min-h-0 overflow-hidden">
              <ChatPanel />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: Zo-style 3-column layout
  return (
    <div className="flex h-full min-h-0">
      {/* Left sidebar - nav + chat list */}
      <aside
        className="h-full flex-shrink-0 border-r border-border flex flex-col bg-background min-h-0 overflow-hidden"
        style={{ width: sidebarW }}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(v => !v)} />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col h-full min-h-0 overflow-hidden">
        <Topbar onToggleSidebar={() => setSidebarCollapsed(v => !v)} />
        <main className="flex-1 min-h-0 overflow-auto bg-background">
          {children}
        </main>
      </div>

      {/* Right chat panel (optional, resizable) */}
      {isOpen && (
        <div className="flex h-full min-h-0">
          <div
            className="w-[3px] cursor-ew-resize shrink-0 bg-transparent hover:bg-border active:bg-ring transition-colors relative"
            onMouseDown={startDrag}
          />
          <aside
            className="h-full flex-shrink-0 border-l border-border bg-background flex flex-col min-h-0 overflow-hidden"
            style={{ width: Math.min(panelWidth, typeof window !== "undefined" ? window.innerWidth * 0.45 : 420) }}
          >
            <ChatPanel />
          </aside>
        </div>
      )}
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
