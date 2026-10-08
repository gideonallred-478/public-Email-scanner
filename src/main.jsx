import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SiteListsProvider } from "./context/SiteListsContext.jsx";
import { ScanProvider } from "./context/ScanContext.jsx";
import { AlertsProvider } from "./context/AlertsContext.jsx";
import { ScoringSettingsProvider } from "./context/ScoringSettingsContext.jsx";
import { DemoModeProvider } from "./context/DemoModeContext.jsx";
import { DemoInboxProvider } from "./context/DemoInboxContext.jsx";
import { IncomingMailProvider } from "./context/IncomingMailContext.jsx";
import { MailboxProvider } from "./context/MailboxContext.jsx";
import { UiPreferencesProvider } from "./context/UiPreferencesContext.jsx";
import { ScannerWorkflowProvider } from "./context/ScannerWorkflowContext.jsx";
import "./index.css";
import "./styles/refresh.css";
import "./styles/light-theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
    <UiPreferencesProvider>
    <ScoringSettingsProvider>
      <SiteListsProvider>
        <ScanProvider>
          <AlertsProvider>
            <ScannerWorkflowProvider>
              <DemoInboxProvider>
                <MailboxProvider>
                  <IncomingMailProvider>
                    <DemoModeProvider>
                      <App />
                    </DemoModeProvider>
                  </IncomingMailProvider>
                </MailboxProvider>
              </DemoInboxProvider>
            </ScannerWorkflowProvider>
          </AlertsProvider>
        </ScanProvider>
      </SiteListsProvider>
    </ScoringSettingsProvider>
    </UiPreferencesProvider>
    </AuthProvider>
  </React.StrictMode>
);
