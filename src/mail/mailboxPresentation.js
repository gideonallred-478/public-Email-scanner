export function getCompactMailboxDiagnostics({
  isWebDemo = false,
  connectionState = "disconnected",
  statusMessage = "",
  pollError = "",
  mailboxAddress = "",
} = {}) {
  let guidance = "";

  if (isWebDemo) {
    guidance =
      "This web preview does not connect to a real inbox. Use Demo or Scanner to create records.";
  } else if (connectionState === "unconfigured") {
    guidance =
      "Configure the mailbox provider and credentials in .env.local, then restart the development services.";
  } else if (
    connectionState === "disconnected" &&
    /AUTHENTICATIONFAILED|Invalid credentials|Gmail rejected/i.test(statusMessage)
  ) {
    guidance =
      "Mailbox authentication failed. Verify the provider credentials or App Password, then reconnect.";
  } else if (connectionState === "bridge-down") {
    guidance =
      "The mail bridge is offline. Restart the scanner development services and check the bridge connection.";
  } else if (mailboxAddress) {
    guidance = `Linked mailbox: ${mailboxAddress}`;
  }

  return {
    statusMessage: statusMessage || "No additional mailbox status is available.",
    pollError: pollError || "",
    guidance,
  };
}

export function shouldBrowserPollMailbox({
  useSharedData = false,
  isAuthenticated = false,
  isLiveConnected = false,
  pollingPaused = false,
  scanning = false,
  dashboardMutationPending = false,
} = {}) {
  return Boolean(
    !useSharedData &&
      isAuthenticated &&
      isLiveConnected &&
      !pollingPaused &&
      !scanning &&
      !dashboardMutationPending
  );
}

export function shouldContinueMailboxDelivery(result) {
  return result?.ok === true;
}

export function getCompactMailboxControlState({
  useSharedData = false,
  isLiveConnected = false,
  pollingPaused = false,
  currentlyScanningId = null,
  dashboardMutationPending = false,
} = {}) {
  if (useSharedData) {
    return {
      pauseDisabled: true,
      checkDisabled: true,
      checkTitle: "The server scans automatically; this dashboard only syncs results.",
    };
  }

  const checkDisabled =
    !isLiveConnected ||
    pollingPaused ||
    Boolean(currentlyScanningId) ||
    dashboardMutationPending;
  const checkTitle = pollingPaused
    ? "Resume polling before checking for new mail."
    : dashboardMutationPending
      ? "Wait for the current dashboard update to finish."
      : "Check the linked mailbox now.";

  return {
    pauseDisabled: !isLiveConnected,
    checkDisabled,
    checkTitle,
  };
}
