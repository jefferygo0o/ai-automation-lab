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

const HIDE_TOPBAR = ["/browser"];

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const hideTopbar = HIDE_TOPBAR.some((p) => loc.pathname.startsWith(p));
  const { isOpen, panelWidth, setPanelWidth, closeChat } = useChatPanel();
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      setPanelWidth(dragRef.current.startWidth + dx);
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

  // Mobile layout: single column, sidebar drawer, chat as full-width sheet
  if (isMobile) {
    return (
      <div className="grid h-full min-h-0" style={{ gridTemplateColumns: "1fr" }}>
        <div className="flex flex-col h-full min-h-0 overflow-hidden min-w-0">
          {!hideTopbar && (
            <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          )}
          <main className={`flex-1 min-h-0 overflow-auto ${!hideTopbar ? "bg-paper-50" : ""}`}>
            {children}
          </main>
        </div>
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        {isOpen && (
          <div 
            className="fixed inset-0 z-50 flex"
            style={{ pointerEvents: "none" }}
          >
            <div 
              className="flex-1 h-full bg-ink-900/20" 
              style={{ pointerEvents: "auto" }}
              onClick={closeChat} 
            />
            <div 
              className="w-full max-w-md bg-paper-50 h-full shadow-2xl flex flex-col min-h-0 overflow-hidden"
              style={{ pointerEvents: "auto" }}
            >
              <ChatPanel />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tablet + Desktop layout: original grid
  return (
    <div
      className="grid h-full min-h-0"
      style={{
        gridTemplateColumns: isOpen
          ? `auto 1fr ${panelWidth}px`
          : "auto 1fr",
        gridTemplateRows: "minmax(0, 1fr)",
      }}
    >
      <Sidebar />
      <div className="flex flex-col h-full min-h-0 overflow-hidden min-w-0">
        {!hideTopbar && <Topbar />}
        <main className={`flex-1 min-h-0 overflow-auto ${!hideTopbar ? "bg-paper-50" : ""}`}>
          {children}
        </main>
      </div>
      {isOpen && (
        <div className="flex min-h-0">
          <div
            className="w-[3px] cursor-ew-resize shrink-0 bg-transparent hover:bg-ink-300/40 active:bg-ink-300/60 transition-colors relative"
            onMouseDown={startDrag}
          />
          <ChatPanel />
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
    <ShellWithProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={<Navigate to={token ? "/chats" : "/login"} replace />}
        />
        <Route
          path="/chats"
          element={<RequireAuth><ChatsPage /></RequireAuth>}
        />
        <Route
          path="/agents"
          element={<RequireAuth><AgentsPage /></RequireAuth>}
        />
        <Route
          path="/agents/:id"
          element={<RequireAuth><AgentEditPage /></RequireAuth>}
        />
        <Route
          path="/web-space"
          element={<RequireAuth><WebSpacePage /></RequireAuth>}
        />
        <Route
          path="/files"
          element={<RequireAuth><FilesPage /></RequireAuth>}
        />
        <Route
          path="/automations"
          element={<RequireAuth><AutomationsPage /></RequireAuth>}
        />
        <Route
          path="/skills"
          element={<RequireAuth><SkillsPage /></RequireAuth>}
        />
        <Route
          path="/mcp"
          element={<RequireAuth><McpPage /></RequireAuth>}
        />
        <Route
          path="/secrets"
          element={<RequireAuth><SecretsPage /></RequireAuth>}
        />
        <Route
          path="/runs"
          element={<RequireAuth><RunsPage /></RequireAuth>}
        />
        <Route
          path="/browser"
          element={<RequireAuth><BrowserPage /></RequireAuth>}
        />
        <Route
          path="/integrations"
          element={<RequireAuth><IntegrationsPage /></RequireAuth>}
        />
        <Route
          path="*"
          element={<Navigate to={token ? "/chats" : "/login"} replace />}
        />
      </Routes>
    </ShellWithProvider>
  );
}
