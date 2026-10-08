import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/opaque-token",
  expirationTime: null,
  keys: {
    p256dh: "public-key-material",
    auth: "auth-secret-material",
  },
};

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-push-subscription-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");
}

test("push subscriptions are durably upserted without exposing secrets in status", async (t) => {
  await setup(t);
  const {
    getNotificationStatus,
    listPushSubscriptions,
    upsertPushSubscription,
  } = await import("../../server/alertsService.js");

  const first = await upsertPushSubscription(subscription, { userId: "it-user" });
  const second = await upsertPushSubscription(subscription, { userId: "it-user" });
  assert.equal(first.created, true);
  assert.equal(second.created, false);

  const stored = await listPushSubscriptions();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].endpoint, subscription.endpoint);

  const status = await getNotificationStatus();
  assert.equal(status.pushSubscriptions, 1);
  assert.doesNotMatch(JSON.stringify(status), /opaque-token|auth-secret|public-key/);

  const state = JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
  assert.equal(state.pushSubscriptions.length, 1);
});

test("push subscriptions reject unsafe or malformed endpoints", async (t) => {
  await setup(t);
  const { upsertPushSubscription } = await import("../../server/alertsService.js");
  for (const value of [
    null,
    {},
    { ...subscription, endpoint: "http://push.example.test/plaintext" },
    { ...subscription, endpoint: "file:///tmp/push" },
    { ...subscription, endpoint: "https://127.0.0.1/push" },
    { ...subscription, endpoint: "https://localhost/push" },
    { ...subscription, endpoint: "https://unapproved.example.test/push" },
    { ...subscription, keys: {} },
  ]) {
    await assert.rejects(
      () => upsertPushSubscription(value, { userId: "it-user" }),
      /valid web push subscription/i
    );
  }
});

test("push subscription ownership cannot be reassigned or deleted by another IT user", async (t) => {
  await setup(t);
  const {
    listPushSubscriptions,
    removePushSubscription,
    upsertPushSubscription,
  } = await import("../../server/alertsService.js");
  await upsertPushSubscription(subscription, { userId: "it-user" });
  await assert.rejects(
    () => upsertPushSubscription(subscription, { userId: "other-it-user" }),
    /owned by another user/i
  );
  assert.equal(
    (await removePushSubscription(subscription.endpoint, { userId: "other-it-user" })).removed,
    0
  );
  assert.equal((await listPushSubscriptions()).length, 1);
  assert.equal(
    (await removePushSubscription(subscription.endpoint, { userId: "it-user" })).removed,
    1
  );
  assert.equal((await listPushSubscriptions()).length, 0);
});

test("one owner cannot exhaust all push-subscription capacity", async (t) => {
  await setup(t);
  const { upsertPushSubscription } = await import("../../server/alertsService.js");
  for (let index = 0; index < 10; index += 1) {
    await upsertPushSubscription(
      { ...subscription, endpoint: `https://fcm.googleapis.com/fcm/send/owner-${index}` },
      { userId: "it-user" }
    );
  }
  await assert.rejects(
    () =>
      upsertPushSubscription(
        { ...subscription, endpoint: "https://fcm.googleapis.com/fcm/send/owner-overflow" },
        { userId: "it-user" }
      ),
    /owner.*capacity/i
  );
});

test("push subscription storage has a bounded device count", async (t) => {
  await setup(t);
  const { upsertPushSubscription } = await import("../../server/alertsService.js");
  await writeFile(
    process.env.ALERTS_DATA_PATH,
    JSON.stringify({
      version: 2,
      alerts: [],
      notificationJobs: [],
      pushSubscriptions: Array.from({ length: 100 }, (_, index) => {
        const endpoint = `https://fcm.googleapis.com/fcm/send/existing-${index}`;
        return {
          ...subscription,
          endpoint,
          endpointHash: createHash("sha256").update(endpoint).digest("hex"),
          userId: `it-user-${Math.floor(index / 10)}`,
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        };
      }),
    }),
    "utf8"
  );
  await assert.rejects(
    () =>
      upsertPushSubscription(
        { ...subscription, endpoint: "https://fcm.googleapis.com/fcm/send/overflow" },
        { userId: "it-user" }
      ),
    /subscription.*capacity/i
  );
});
