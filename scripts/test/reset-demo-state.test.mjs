import test from "node:test";
import assert from "node:assert/strict";

import { resetDemoStateActions, getDemoResetCopy } from "../../src/scanner/demoReset.js";

test("demo reset copy discloses shared destructive scope", () => {
  assert.match(getDemoResetCopy({ useSharedData: true }).message, /all shared alert history/i);
  assert.doesNotMatch(
    getDemoResetCopy({ useSharedData: true }).message,
    /alerts[^.]*in this browser/i
  );
  assert.match(getDemoResetCopy({ useSharedData: false }).message, /in this browser/i);
});

test("complete demo reset awaits alert clearing and resumes polling", async () => {
  const calls = [];
  const result = await resetDemoStateActions({
    clearWorkflow: () => calls.push("workflow"),
    clearAlerts: async () => {
      calls.push("alerts-start");
      await Promise.resolve();
      calls.push("alerts-done");
      return { ok: true };
    },
    resetPresentationProgress: () => calls.push("presentation"),
    resetInbox: () => calls.push("inbox"),
    resumePolling: () => calls.push("resume"),
  });

  assert.deepEqual(calls, [
    "alerts-start",
    "alerts-done",
    "workflow",
    "presentation",
    "inbox",
    "resume",
  ]);
  assert.deepEqual(result, { ok: true });
});

test("demo reset aborts without partial destructive changes when alert clearing fails", async () => {
  const calls = [];
  const result = await resetDemoStateActions({
    clearWorkflow: () => calls.push("workflow"),
    clearAlerts: async () => ({ ok: false, error: "Shared clear failed." }),
    resetPresentationProgress: () => calls.push("presentation"),
    resetInbox: () => calls.push("inbox"),
    resumePolling: () => calls.push("resume"),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result, { ok: false, error: "Shared clear failed." });
});
