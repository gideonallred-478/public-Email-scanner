import { useAlerts } from "../context/AlertsContext.jsx";
import { useDemoMode } from "../context/DemoModeContext.jsx";
import { DemoGuidanceBox } from "./DemoGuidanceBox.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { useResetDemoState } from "../hooks/useResetDemoState.js";
import { getDemoResetCopy } from "../scanner/demoReset.js";
import { useState } from "react";

export function DemoControls() {
  const { demoMode } = useDemoMode();
  const { useSharedData } = useAlerts();
  const resetCopy = getDemoResetCopy({ useSharedData });
  const resetDemoState = useResetDemoState();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState("");

  async function handleConfirmReset() {
    if (resetPending) return;
    setResetPending(true);
    setResetError("");
    try {
      const result = await resetDemoState();
      if (!result?.ok) {
        setResetError(result?.error ?? "Could not reset the demo.");
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Could not reset the demo.");
      setConfirmOpen(false);
    } finally {
      setResetPending(false);
    }
  }

  return (
    <>
      <section className="card demo-controls">
        <div className="demo-controls__row">
          <div className="demo-controls__copy">
            <h3>Demo controls</h3>
            <p className="muted">{resetCopy.description}</p>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setConfirmOpen(true)}
          >
            Reset demo
          </button>
        </div>
        {demoMode ? <DemoGuidanceBox compact /> : null}
        {resetError ? <p className="form-error" role="alert">{resetError}</p> : null}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset demo?"
        message={resetCopy.message}
        confirmLabel="Reset demo"
        cancelLabel="Keep data"
        destructive
        confirmDisabled={resetPending}
        cancelDisabled={resetPending}
        onConfirm={handleConfirmReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
