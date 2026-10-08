import test from "node:test";
import assert from "node:assert/strict";

import {
  classifySharedAlertCreation,
  createDashboardMutationLock,
  getClearAlertHistoryCopy,
  runDashboardMutationExclusive,
  getDashboardQueueCards,
  getDashboardFilters,
  shouldShowExpiredSafeCleanup,
} from "../../src/scanner/dashboardPresentation.js";

test("staff dashboard prioritizes the four operational queues", () => {
  const cards = getDashboardQueueCards({
    urgent: 2,
    dashboard: 4,
    open: 5,
    resolved: 7,
    safe: 20,
    lookalike: 3,
    trustReview: 1,
  });

  assert.deepEqual(
    cards.map(({ id, label, value }) => ({ id, label, value })),
    [
      { id: "urgent", label: "Urgent 8–10", value: 2 },
      { id: "dashboard", label: "Review 5–7", value: 4 },
      { id: "open", label: "Open incidents", value: 5 },
      { id: "resolved", label: "Resolved", value: 7 },
    ]
  );
});

test("staff dashboard keeps specialist and safe views as secondary filters", () => {
  const groups = getDashboardFilters();

  assert.deepEqual(
    groups.primary.map(({ id }) => id),
    ["active", "urgent", "dashboard", "resolved"]
  );
  assert.deepEqual(
    groups.secondary.map(({ id }) => id),
    ["safe", "lookalikes", "trust", "dangerous"]
  );
});

test("expired Safe cleanup remains available even when no Safe rows are visible", () => {
  assert.equal(shouldShowExpiredSafeCleanup("safe"), true);
  assert.equal(shouldShowExpiredSafeCleanup("active"), false);
});

test("dashboard mutation lock rejects cross-operation concurrency", () => {
  const lock = createDashboardMutationLock();

  assert.equal(lock.acquire("resolve"), true);
  assert.equal(lock.acquire("clear-history"), false);
  assert.equal(lock.acquire("clear-expired-safe"), false);
  assert.equal(lock.current(), "resolve");

  lock.release("clear-history");
  assert.equal(lock.isLocked(), true);
  lock.release("resolve");
  assert.equal(lock.isLocked(), false);
  assert.equal(lock.acquire("clear-history"), true);
});

test("shared persistence distinguishes creation, duplicate, and failure", () => {
  assert.equal(
    classifySharedAlertCreation({ ok: true, payload: { ok: true, created: true, record: { id: "a" } } }).kind,
    "created"
  );
  assert.equal(
    classifySharedAlertCreation({ ok: true, payload: { duplicate: true } }).kind,
    "duplicate"
  );
  assert.deepEqual(
    classifySharedAlertCreation({ ok: false, payload: { error: "server unavailable" } }),
    { kind: "failure", error: "server unavailable" }
  );
});

test("clear-history copy discloses global shared scope", () => {
  assert.match(
    getClearAlertHistoryCopy({ useSharedData: true }).message,
    /all shared alert history for every user/i
  );
  assert.match(
    getClearAlertHistoryCopy({ useSharedData: false }).message,
    /in this browser/i
  );
});

test("mailbox persistence cannot start while clear history is in flight", async () => {
  const lock = createDashboardMutationLock();
  let finishClear;
  const clearGate = new Promise((resolve) => {
    finishClear = resolve;
  });

  const clearRun = runDashboardMutationExclusive(lock, "clear-history", async () => {
    await clearGate;
    return { ok: true };
  });
  const incomingRun = await runDashboardMutationExclusive(
    lock,
    "incoming:message-1",
    async () => ({ created: true })
  );

  assert.deepEqual(incomingRun, { started: false, reason: "busy" });
  finishClear();
  assert.deepEqual(await clearRun, {
    started: true,
    value: { ok: true },
  });
  assert.equal(lock.isLocked(), false);
});
