export function getDemoResetCopy({ useSharedData = false } = {}) {
  if (useSharedData) {
    return {
      description:
        "Reset clears all shared alert history for every user, plus this browser's current scan, demo inbox state, and walkthrough progress. Site lists and scoring settings are kept.",
      message:
        "This deletes all shared alert history for every user. It also clears scanner input, demo inbox progress, and walkthrough checkmarks in this browser. Site lists and settings stay as they are.",
    };
  }

  return {
    description:
      "Reset clears the current scan, demo-loaded email, alert list, inbox processed state, and walkthrough progress in this browser. Site lists and scoring settings are kept.",
    message:
      "This clears alerts, scanner input, demo inbox progress, and walkthrough checkmarks in this browser. Site lists and settings stay as they are.",
  };
}

export async function resetDemoStateActions({
  clearWorkflow,
  clearAlerts,
  resetPresentationProgress,
  resetInbox,
  resumePolling,
}) {
  const clearResult = await clearAlerts();
  if (!clearResult?.ok) {
    return {
      ok: false,
      error: clearResult?.error ?? "Could not clear alerts for the demo reset.",
    };
  }

  clearWorkflow();
  resetPresentationProgress();
  resetInbox();
  resumePolling();
  return { ok: true };
}
