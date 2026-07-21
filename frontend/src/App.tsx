import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./state/auth";
import LeftRail from "./components/LeftRail";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import ChatPanel from "./components/ChatPanel";
import TabBar from "./components/TabBar";
import { ChatPanelProvider, useChatPanel } from "./contexts/ChatPanelContext";
import { useTabStore } from "./stores/tabStore";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { Chats } from "./api";
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
  const { closeChatTab } = useChatPanel();
  const pageTabs = useTabStore((s) => s.pageTabs);
  const activePageTabId = useTabStore((s) => s.activePageTabId);
  const closePageTab = useTabStore((s) => s.closePageTab);
  const setActivePageTab = useTabStore((s) => s.setActivePageTab);
  const chatTabs = useTabStore((s) => s.chatTabs);
  const activeChatTabId = useTabStore((s) => s.activeChatTabId);
  const setActiveChatTab = useTabStore((s) => s.setActiveChatTab);
  const closeChatTabAction = useTabStore((s) => s.closeChatTab);
  const openChatTab = useTabStore((s) => s.openChatTab);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

  // Auto-open the most recent chat tab on first load
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (hasAutoOpened.current) return;
    if (chatTabs.length > 0 || activeChatTabId) {
      hasAutoOpened.current = true;
      return;
    }
    hasAutoOpened.current = true;
    (async () => {
      try {
        const { chats } = await Chats.list();
        if (chats.length > 0) {
          const sorted = chats.sort((a, b) => b.updatedAt - a.updatedAt);
          openChatTab(sorted[0].id, sorted[0].title || "Chat");
        }
      } catch {
        // Not logged in or no chats yet
      }
    })();
  }, []);

  function handlePageTabSelect(id: string) {
    setActivePageTab(id);
  }

  function handlePageTabClose(id: string) {
    closePageTab(id);
  }

  function handleChatTabSelect(id: string) {
    setActiveChatTab(id);
  }

  function handleChatTabClose(id: string) {
    closeChatTabAction(id);
  }

  // Mobile: single column with drawer
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0">
        <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden">
          <Topbar
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          <main className="flex-1 min-h-0 overflow-auto bg-background">
            <ChatPanel />
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

  // Desktop: two/three-column layout — [LeftRail 44px | Page Tab(s) | Chat Tab(s)]
  // When no page tabs open, chat column takes full width up to the left rail.
  const hasPageTabs = pageTabs.length > 0;

  return (
    <div className="flex h-screen w-full">
      {/* Left Rail — always-visible icon nav (44px) */}
      <LeftRail />

      {/* Page Tabs Column — only rendered when there are page tabs */}
      {hasPageTabs && (
        <div className="flex flex-col min-w-0 border-r border-border bg-background" style={{ flex: "1 1 0" }}>
          <TabBar
            tabs={pageTabs}
            activeId={activePageTabId}
            onSelect={handlePageTabSelect}
            onClose={handlePageTabClose}
            label="Pages"
          />
          <main className="flex-1 min-h-0 overflow-auto bg-background">
            {children}
          </main>
        </div>
      )}

      {/* Chat Tabs Column — always visible, fills remaining space */}
      <div className="flex flex-col min-w-0 bg-background" style={{ flex: hasPageTabs ? "1 1 0" : "1 1 100%" }}>
        <TabBar
          tabs={chatTabs}
          activeId={activeChatTabId}
          onSelect={handleChatTabSelect}
          onClose={handleChatTabClose}
          label="Chats"
        />
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          <ChatPanel />
        </div>
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
