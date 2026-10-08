import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

function record(id, score) {
  return {
    id,
    emailDedupeKey: `${id}-message`,
    sender: `${id}@example.test`,
    subject: `Message ${id}`,
    score,
    alertType: "Suspicious email",
    mainReasons: ["Synthetic test"],
    status: "open",
    flags: { dashboardAlert: true },
    timestamp: "2026-08-16T12:00:00.000Z",
  };
}

function storedPendingJob(index) {
  const createdAt = "2026-08-16T12:00:00.000Z";
  return {
    id: `pending-${index}`,
    idempotencyKey: `pending-key-${index}`,
    recordId: `record-${index}`,
    notificationClass: "review",
    channel: "email",
    score: 6,
    riskRevision: index.toString(16).padStart(64, "0"),
    payload: {
      notificationClass: "review",
      recordId: index.toString(16).padStart(24, "0"),
      score: 6,
      scannedAt: createdAt,
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: createdAt,
    createdAt,
    claimedAt: null,
    sentAt: null,
    lastErrorCode: null,
    deliveryState: null,
    claimToken: null,
  };
}

function addNotificationAlert(addSharedAlert, value) {
  return addSharedAlert(value, { notificationRecord: value });
}

test("alert creation atomically persists fixed-policy notification jobs", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-state-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const alertsPath = join(dir, "alerts.json");
  process.env.ALERTS_DATA_PATH = alertsPath;
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");

  const { addSharedAlert } = await import("../../server/alertsService.js");
  assert.equal((await addNotificationAlert(addSharedAlert, record("safe", 4))).ok, true);
  assert.equal((await addNotificationAlert(addSharedAlert, record("review", 5))).ok, true);
  assert.equal((await addNotificationAlert(addSharedAlert, record("urgent", 8))).ok, true);

  const state = JSON.parse(await readFile(alertsPath, "utf8"));
  assert.equal(state.version, 2);
  assert.equal(state.alerts.length, 3);
  assert.deepEqual(
    state.notificationJobs.map((job) => [job.recordId, job.channel, job.status]).sort(),
    [
      ["review", "email", "pending"],
      ["urgent", "web-push", "pending"],
    ]
  );
});

test("legacy alert arrays migrate without losing records", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-migration-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const alertsPath = join(dir, "alerts.json");
  process.env.ALERTS_DATA_PATH = alertsPath;
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");
  await writeFile(alertsPath, JSON.stringify([record("legacy", 4)]), "utf8");

  const { addSharedAlert } = await import("../../server/alertsService.js");
  assert.equal((await addNotificationAlert(addSharedAlert, record("new", 5))).ok, true);

  const state = JSON.parse(await readFile(alertsPath, "utf8"));
  assert.equal(state.version, 2);
  assert.deepEqual(new Set(state.alerts.map((entry) => entry.id)), new Set(["legacy", "new"]));
  assert.equal(state.notificationJobs.length, 1);
});

test("malformed version-2 state fails closed instead of erasing alerts or jobs", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-corrupt-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const alertsPath = join(dir, "alerts.json");
  process.env.ALERTS_DATA_PATH = alertsPath;
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");
  await writeFile(alertsPath, "{not valid json", "utf8");

  const { getNotificationStatus } = await import("../../server/alertsService.js");
  await assert.rejects(() => getNotificationStatus(), SyntaxError);
  assert.equal(await readFile(alertsPath, "utf8"), "{not valid json");
});

test("valid JSON with the wrong durable-state schema fails closed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-schema-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const alertsPath = join(dir, "alerts.json");
  process.env.ALERTS_DATA_PATH = alertsPath;
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");
  const { addSharedAlert, getNotificationStatus } = await import(
    "../../server/alertsService.js"
  );

  const malformedProcessingJob = {
    ...storedPendingJob(1),
    status: "processing",
    sentAt: "2026-08-16T12:01:00.000Z",
  };
  const malformedDeliveryStateJob = {
    ...storedPendingJob(2),
    status: "retry_scheduled",
    attempts: 1,
    lastErrorCode: "provider_failure",
    deliveryState: {},
  };
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const malformedHashRelationsJob = {
    ...storedPendingJob(3),
    status: "retry_scheduled",
    attempts: 1,
    lastErrorCode: "provider_failure",
    deliveryState: {
      pendingRecipientHashes: [hashA, hashA],
      permanentFailureRecipientHashes: [hashA],
      intendedRecipientHashes: [hashB],
    },
  };

  for (const raw of [
    "null",
    "42",
    '"wrong"',
    "true",
    "{}",
    '{"alerts":[],"notificationJobs":[],"pushSubscriptions":[]}',
    '{"version":99,"alerts":[],"notificationJobs":[],"pushSubscriptions":[]}',
    '{"version":2,"alerts":[],"notificationJobs":[],"pushSubscriptions":[],"providerSecret":"forbidden"}',
    '{"version":2,"alerts":[]}',
    '{"version":2,"alerts":[null],"notificationJobs":[],"pushSubscriptions":[]}',
    '{"version":2,"alerts":[],"notificationJobs":[null],"pushSubscriptions":[]}',
    '{"version":2,"alerts":[],"notificationJobs":[],"pushSubscriptions":[null]}',
    JSON.stringify({
      version: 2,
      alerts: [],
      notificationJobs: [malformedProcessingJob],
      pushSubscriptions: [],
    }),
    JSON.stringify({
      version: 2,
      alerts: [],
      notificationJobs: [malformedDeliveryStateJob],
      pushSubscriptions: [],
    }),
    JSON.stringify({
      version: 2,
      alerts: [],
      notificationJobs: [malformedHashRelationsJob],
      pushSubscriptions: [],
    }),
  ]) {
    await writeFile(alertsPath, raw, "utf8");
    await assert.rejects(() => getNotificationStatus(), /alert state/i);
    await assert.rejects(() => addSharedAlert(record("must-not-write", 4)), /alert state/i);
    assert.equal(await readFile(alertsPath, "utf8"), raw);
  }
});

test("a full active outbox fails alert creation instead of silently dropping a pending job", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-full-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "alerts.json");
  process.env.ALERTS_DATA_PATH = path;
  await writeFile(
    path,
    JSON.stringify({
      version: 2,
      alerts: [],
      notificationJobs: Array.from({ length: 5000 }, (_, index) =>
        storedPendingJob(index)
      ),
      pushSubscriptions: [],
    }),
    "utf8"
  );

  const { addSharedAlert } = await import("../../server/alertsService.js");
  await assert.rejects(
    addNotificationAlert(addSharedAlert, record("review-overflow", 6)),
    /outbox.*capacity/i
  );
  const state = JSON.parse(await readFile(path, "utf8"));
  assert.equal(state.alerts.length, 0);
  assert.equal(state.notificationJobs.length, 5000);
  assert.equal(state.notificationJobs[0].id, "pending-0");
});

test("unchanged notification revisions dedupe while an escalation creates one urgent job", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-escalation-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const alertsPath = join(dir, "alerts.json");
  process.env.ALERTS_DATA_PATH = alertsPath;
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");

  const { addSharedAlert, replaceSharedAlert } = await import("../../server/alertsService.js");
  const review = record("escalation", 6);
  assert.equal((await addNotificationAlert(addSharedAlert, review)).ok, true);
  assert.equal((await replaceSharedAlert(review.id, review, { notificationRecord: review })).ok, true);
  assert.equal((await replaceSharedAlert(review.id, { ...review, score: 8 }, { notificationRecord: { ...review, score: 8 } })).ok, true);
  assert.equal((await replaceSharedAlert(review.id, { ...review, score: 8 }, { notificationRecord: { ...review, score: 8 } })).ok, true);

  const state = JSON.parse(await readFile(alertsPath, "utf8"));
  assert.deepEqual(
    state.notificationJobs.map((job) => job.channel).sort(),
    ["email", "web-push"]
  );
});
