import { useCallback } from "react";
import { useScannerWorkflow } from "../context/ScannerWorkflowContext.jsx";
import { useAlerts } from "../context/AlertsContext.jsx";
import { useDemoMode } from "../context/DemoModeContext.jsx";
import { useDemoInbox } from "../context/DemoInboxContext.jsx";
import { useIncomingMail } from "../context/IncomingMailContext.jsx";
import { resetDemoStateActions } from "../scanner/demoReset.js";

export function useResetDemoState() {
  const { clearWorkflow } = useScannerWorkflow();
  const { clearAlerts, runDashboardMutation } = useAlerts();
  const { resetPresentationProgress } = useDemoMode();
  const { resetInbox } = useDemoInbox();
  const { resumePolling } = useIncomingMail();

  return useCallback(
    async () => {
      const execution = await runDashboardMutation("reset-demo", () =>
        resetDemoStateActions({
          clearWorkflow,
          clearAlerts,
          resetPresentationProgress,
          resetInbox,
          resumePolling,
        })
      );
      return execution.started
        ? execution.value
        : { ok: false, error: "Another dashboard update is in progress." };
    },
    [
      clearWorkflow,
      clearAlerts,
      resetPresentationProgress,
      resetInbox,
      resumePolling,
      runDashboardMutation,
    ]
  );
}
