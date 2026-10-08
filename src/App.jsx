import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "./components/AppHeader.jsx";
import { TabNavigation } from "./components/TabNavigation.jsx";
import { ScannerPage } from "./pages/ScannerPage.jsx";
import { DemoPage } from "./pages/DemoPage.jsx";
import { SiteListsPage } from "./pages/SiteListsPage.jsx";
import { AlertsPage } from "./pages/AlertsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { TrackerPage } from "./pages/TrackerPage.jsx";
import { useDemoMode } from "./context/DemoModeContext.jsx";
import { useAlerts } from "./context/AlertsContext.jsx";
import { useMailbox } from "./context/MailboxContext.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { useTabDocumentTitle } from "./hooks/useDocumentTitle.js";
import { useReviewerSiteListSuggestionAlerts } from "./hooks/useReviewerSiteListSuggestionAlerts.js";
import {
  canAccessTab,
  getDefaultTabForRole,
} from "./auth/rolePermissions.js";

export default function App() {
  const { isAuthenticated, user, bootstrapping } = useAuth();
  const { registerNavigate } = useDemoMode();
  const { setDashboardFilter } = useAlerts();
  const { isLiveConnected, isWebDemo, mailboxAddress } = useMailbox();
  const [activeTab, setActiveTab] = useState("alerts");
  const role = user?.role;

  const navigateToTab = useCallback(
    (tab, filter) => {
      const targetTab =
        role && !canAccessTab(role, tab) ? getDefaultTabForRole(role) : tab;
      if (typeof filter === "string") {
        setDashboardFilter(filter);
      }
      setActiveTab(targetTab);
    },
    [role, setDashboardFilter]
  );

  useEffect(() => {
    if (!role || canAccessTab(role, activeTab)) return;
    setActiveTab(getDefaultTabForRole(role));
  }, [role, activeTab]);

  useEffect(() => {
    registerNavigate((tab) => navigateToTab(tab));
    return () => registerNavigate(null);
  }, [registerNavigate, navigateToTab]);

  useTabDocumentTitle(activeTab);
  useReviewerSiteListSuggestionAlerts();

  if (bootstrapping) {
    return (
      <div className="login-page">
        <div className="login-page__card card">
          <p className="muted">Connecting to shared data…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="app-main">
        {activeTab === "scanner" && (
          <ScannerPage onNavigateToTab={navigateToTab} />
        )}
        {activeTab === "demo" && canAccessTab(role, "demo") && (
          <DemoPage onNavigateToTab={navigateToTab} />
        )}
        {activeTab === "site-lists" && canAccessTab(role, "site-lists") && (
          <SiteListsPage />
        )}
        {activeTab === "alerts" && <AlertsPage />}
        {activeTab === "settings" && canAccessTab(role, "settings") && (
          <SettingsPage />
        )}
        {activeTab === "tracker" && canAccessTab(role, "tracker") && (
          <TrackerPage />
        )}
      </main>
      <footer className="app-footer">
        {activeTab === "alerts"
          ? "Phishing Detector · Read-only monitoring · No messages are blocked or deleted."
          : isLiveConnected
          ? `Live mail linked (${mailboxAddress}). Monitors inbox and spam in this browser — read-only, no blocking.`
          : isWebDemo
            ? "Web preview — use Demo or Scanner tabs. Live inbox requires a private dev setup, not this public URL."
            : "Education demo — link your inbox on Alerts. All scans stay in this browser."}
      </footer>
    </div>
  );
}
