import test from "node:test";
import assert from "node:assert/strict";

import {
  getCompactMailboxControlState,
  getCompactMailboxDiagnostics,
  shouldBrowserPollMailbox,
  shouldContinueMailboxDelivery,
} from "../../src/mail/mailboxPresentation.js";

test("compact mailbox diagnostics preserve setup and bridge guidance", () => {
  const unconfigured = getCompactMailboxDiagnostics({
    connectionState: "unconfigured",
    statusMessage: "Mailbox provider is not configured.",
  });
  assert.match(unconfigured.guidance, /\.env\.local/);
  assert.equal(unconfigured.statusMessage, "Mailbox provider is not configured.");

  const bridgeDown = getCompactMailboxDiagnostics({
    connectionState: "bridge-down",
    statusMessage: "Could not reach the mail bridge.",
  });
  assert.match(bridgeDown.guidance, /bridge is offline/i);
});

test("compact mailbox diagnostics preserve authentication and poll errors", () => {
  const result = getCompactMailboxDiagnostics({
    connectionState: "disconnected",
    statusMessage: "AUTHENTICATIONFAILED: Gmail rejected the login",
    pollError: "Polling failed after authentication.",
  });

  assert.match(result.guidance, /authentication failed/i);
  assert.equal(result.pollError, "Polling failed after authentication.");
  assert.match(result.statusMessage, /AUTHENTICATIONFAILED/);
});

test("compact mailbox diagnostics retain linked mailbox identity", () => {
  const result = getCompactMailboxDiagnostics({
    connectionState: "connected",
    statusMessage: "Watching inbox and spam.",
    mailboxAddress: "security@example.invalid",
  });

  assert.equal(result.guidance, "Linked mailbox: security@example.invalid");
  assert.equal(result.pollError, "");
});

test("compact mailbox controls never expose a silent Check now action", () => {
  const paused = getCompactMailboxControlState({
    isLiveConnected: true,
    pollingPaused: true,
  });
  assert.equal(paused.checkDisabled, true);
  assert.match(paused.checkTitle, /resume polling/i);

  const active = getCompactMailboxControlState({
    isLiveConnected: true,
    pollingPaused: false,
  });
  assert.equal(active.checkDisabled, false);

  const scanning = getCompactMailboxControlState({
    isLiveConnected: true,
    pollingPaused: false,
    currentlyScanningId: "message-1",
  });
  assert.equal(scanning.checkDisabled, true);

  const dashboardBusy = getCompactMailboxControlState({
    isLiveConnected: true,
    pollingPaused: false,
    dashboardMutationPending: true,
  });
  assert.equal(dashboardBusy.checkDisabled, true);
  assert.match(dashboardBusy.checkTitle, /dashboard update/i);

  const serverManaged = getCompactMailboxControlState({
    useSharedData: true,
    isLiveConnected: true,
  });
  assert.equal(serverManaged.pauseDisabled, true);
  assert.equal(serverManaged.checkDisabled, true);
  assert.match(serverManaged.checkTitle, /server scans automatically/i);
});

test("shared mode leaves mailbox polling to the server", () => {
  assert.equal(
    shouldBrowserPollMailbox({
      useSharedData: true,
      isAuthenticated: true,
      isLiveConnected: true,
      pollingPaused: false,
      scanning: false,
      dashboardMutationPending: false,
    }),
    false
  );

  assert.equal(
    shouldBrowserPollMailbox({
      useSharedData: false,
      isAuthenticated: true,
      isLiveConnected: true,
      pollingPaused: false,
      scanning: false,
      dashboardMutationPending: false,
    }),
    true
  );
});

test("mailbox delivery continues only for explicit successful outcomes", () => {
  assert.equal(shouldContinueMailboxDelivery({ ok: true }), true);
  assert.equal(shouldContinueMailboxDelivery({ ok: true, duplicate: true }), true);
  assert.equal(shouldContinueMailboxDelivery(null), false);
  assert.equal(shouldContinueMailboxDelivery({ ok: false }), false);
});
