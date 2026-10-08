import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

function record(id, score) {
  return {
    id,
    emailDedupeKey: `${id}-message`,
    score,
    alertType: "Synthetic",
    mainReasons: ["Synthetic test"],
    timestamp: "2026-08-16T12:00:00.000Z",
  };
}

function addNotificationAlert(addSharedAlert, value) {
  return addSharedAlert(value, { notificationRecord: value });
}

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-worker-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");
  return dir;
}

async function readState() {
  return JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
}

test("worker claims and completes a durable job", async (t) => {
  await setup(t);
  const { addSharedAlert } = await import("../../server/alertsService.js");
  const { runNotificationWorkerOnce } = await import("../../server/notificationWorker.js");
  await addNotificationAlert(addSharedAlert, record("review-success", 5));

  const delivered = [];
  const result = await runNotificationWorkerOnce({
    nowMs: Date.now() + 10_000,
    deliver: async (job) => delivered.push(job.channel),
  });

  assert.equal(result.status, "sent");
  assert.deepEqual(delivered, ["email"]);
  assert.equal((await readState()).notificationJobs[0].status, "sent");
});

test("worker persists bounded retry and dead-letter states", async (t) => {
  await setup(t);
  const { addSharedAlert } = await import("../../server/alertsService.js");
  const { runNotificationWorkerOnce } = await import("../../server/notificationWorker.js");
  await addNotificationAlert(addSharedAlert, record("retry", 8));

  const fail = async () => {
    const error = new Error("temporary provider failure");
    error.code = "provider_unavailable";
    error.retryable = true;
    error.deliveryState = {
      pendingSubscriptionHashes: ["a".repeat(64)],
      permanentFailureSubscriptionHashes: ["b".repeat(64)],
      intendedSubscriptionHashes: ["a".repeat(64), "b".repeat(64)],
    };
    throw error;
  };

  const first = await runNotificationWorkerOnce({
    nowMs: Date.now() + 10_000,
    maxAttempts: 2,
    retryDelaysMs: [1_000],
    deliver: fail,
  });
  assert.equal(first.status, "retry_scheduled");

  const second = await runNotificationWorkerOnce({
    nowMs: Date.now() + 12_000,
    maxAttempts: 2,
    retryDelaysMs: [1_000],
    deliver: fail,
  });
  assert.equal(second.status, "dead");

  const job = (await readState()).notificationJobs[0];
  assert.equal(job.status, "dead");
  assert.equal(job.attempts, 2);
  assert.equal(job.lastErrorCode, "provider_unavailable");
  assert.deepEqual(job.deliveryState, {
    pendingSubscriptionHashes: ["a".repeat(64)],
    permanentFailureSubscriptionHashes: ["b".repeat(64)],
    intendedSubscriptionHashes: ["a".repeat(64), "b".repeat(64)],
  });
  assert.doesNotMatch(JSON.stringify(job), /temporary provider failure/);
});

test("concurrent worker ticks deliver one job once", async (t) => {
  await setup(t);
  const { addSharedAlert } = await import("../../server/alertsService.js");
  const { runNotificationWorkerOnce } = await import("../../server/notificationWorker.js");
  await addNotificationAlert(addSharedAlert, record("concurrent", 5));

  let deliveries = 0;
  const deliver = async () => {
    deliveries += 1;
  };
  const nowMs = Date.now() + 10_000;
  const results = await Promise.all([
    runNotificationWorkerOnce({ nowMs, deliver }),
    runNotificationWorkerOnce({ nowMs, deliver }),
  ]);

  assert.equal(deliveries, 1);
  assert.deepEqual(results.map((result) => result.status).sort(), ["idle", "sent"]);
});

test("stale workers cannot overwrite a newer fenced claim", async (t) => {
  await setup(t);
  const {
    addSharedAlert,
    claimNextNotificationJob,
    completeNotificationJob,
  } = await import("../../server/alertsService.js");
  await addNotificationAlert(addSharedAlert, record("fenced", 5));
  const nowMs = Date.now() + 10_000;
  const first = await claimNextNotificationJob({ nowMs, staleClaimMs: 1_000, maxAttempts: 3 });
  const second = await claimNextNotificationJob({
    nowMs: nowMs + 2_000,
    staleClaimMs: 1_000,
    maxAttempts: 3,
  });
  assert.notEqual(first.claimToken, second.claimToken);

  const stale = await completeNotificationJob(first.id, first.claimToken, nowMs + 2_100);
  assert.equal(stale.staleClaim, true);
  assert.equal((await readState()).notificationJobs[0].status, "processing");

  const current = await completeNotificationJob(second.id, second.claimToken, nowMs + 2_200);
  assert.equal(current.ok, true);
  assert.equal((await readState()).notificationJobs[0].status, "sent");
});

test("stale claims stop at max attempts instead of redelivering forever", async (t) => {
  await setup(t);
  const { addSharedAlert } = await import("../../server/alertsService.js");
  const { runNotificationWorkerOnce } = await import("../../server/notificationWorker.js");
  await addNotificationAlert(addSharedAlert, record("stale-max", 8));
  const path = process.env.ALERTS_DATA_PATH;
  const state = await readState();
  state.notificationJobs[0] = {
    ...state.notificationJobs[0],
    status: "processing",
    attempts: 2,
    claimToken: "123e4567-e89b-42d3-a456-426614174000",
    claimedAt: "2026-01-01T00:00:00.000Z",
  };
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(path, JSON.stringify(state), "utf8")
  );

  let deliveries = 0;
  await runNotificationWorkerOnce({
    nowMs: Date.now() + 10_000,
    staleClaimMs: 1_000,
    maxAttempts: 2,
    deliver: async () => {
      deliveries += 1;
    },
  });
  assert.equal(deliveries, 0);
  const job = (await readState()).notificationJobs[0];
  assert.equal(job.status, "dead");
  assert.equal(job.lastErrorCode, "stale_claim_attempts_exhausted");
});
