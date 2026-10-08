import { test } from "node:test";
import assert from "node:assert/strict";
import { sendUrgentWebPush } from "../../server/webPushTransport.js";

const payload = {
  notificationClass: "urgent",
  recordId: "opaque-alert-id",
  score: 9,
  scannedAt: "2026-08-16T12:00:00.000Z",
};

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
  endpointHash: "subscription-one",
  keys: { p256dh: "key", auth: "auth" },
};

test("urgent Web Push sends privacy-minimal payload to every active subscription", async () => {
  const sent = [];
  const result = await sendUrgentWebPush(payload, {
    config: {
      configured: true,
      subject: "mailto:security@example.test",
      publicKey: "public",
      privateKey: "private",
    },
    subscriptions: [
      subscription,
      {
        ...subscription,
        endpoint: `${subscription.endpoint}-2`,
        endpointHash: "subscription-two",
      },
    ],
    webPush: {
      setVapidDetails() {},
      async sendNotification(target, body) {
        sent.push([target.endpoint, JSON.parse(body)]);
      },
    },
    removeSubscription: async () => {},
  });

  assert.equal(result.delivered, 2);
  assert.equal(sent.length, 2);
  assert.deepEqual(Object.keys(sent[0][1]).sort(), ["body", "data", "tag", "title"]);
  assert.deepEqual(sent[0][1].data, { alertId: "opaque-alert-id", url: "/alerts" });
  assert.doesNotMatch(JSON.stringify(sent), /subject|sender|reason|message-id/i);
});

test("expired Web Push subscriptions are removed and the undelivered job fails visibly", async () => {
  const removed = [];
  await assert.rejects(
    () =>
      sendUrgentWebPush(payload, {
        config: {
          configured: true,
          subject: "mailto:security@example.test",
          publicKey: "public",
          privateKey: "private",
        },
        subscriptions: [subscription],
        webPush: {
          setVapidDetails() {},
          async sendNotification() {
            const error = new Error("gone");
            error.statusCode = 410;
            throw error;
          },
        },
        removeSubscription: async (endpoint) => removed.push(endpoint),
      }),
    (error) =>
      error.code === "web_push_permanent_destination_failure" &&
      error.retryable === false &&
      error.deliveryState.permanentFailureSubscriptionHashes.includes(
        "subscription-one"
      )
  );
  assert.deepEqual(removed, [subscription.endpoint]);
});

test("partial Web Push retries only failed subscriptions", async () => {
  const second = {
    ...subscription,
    endpoint: `${subscription.endpoint}-2`,
    endpointHash: "subscription-two",
  };
  const firstPass = [];
  let failure;
  try {
    await sendUrgentWebPush(payload, {
      config: {
        configured: true,
        subject: "mailto:security@example.test",
        publicKey: "public",
        privateKey: "private",
      },
      subscriptions: [subscription, second],
      webPush: {
        setVapidDetails() {},
        async sendNotification(target) {
          firstPass.push(target.endpoint);
          if (target.endpoint === second.endpoint) throw new Error("temporary");
        },
      },
      removeSubscription: async () => {},
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.retryable, true);
  assert.deepEqual(failure?.deliveryState, {
    pendingSubscriptionHashes: ["subscription-two"],
    permanentFailureSubscriptionHashes: [],
    intendedSubscriptionHashes: ["subscription-one", "subscription-two"],
  });

  const retryPass = [];
  const result = await sendUrgentWebPush(payload, {
    config: {
      configured: true,
      subject: "mailto:security@example.test",
      publicKey: "public",
      privateKey: "private",
    },
    subscriptions: [subscription, second],
    deliveryState: failure.deliveryState,
    webPush: {
      setVapidDetails() {},
      async sendNotification(target) {
        retryPass.push(target.endpoint);
      },
    },
    removeSubscription: async () => {},
  });
  assert.equal(result.delivered, 1);
  assert.deepEqual(retryPass, [second.endpoint]);
});

test("Web Push retry delivers remaining destinations but fails visibly when one disappears", async () => {
  let contacted = false;
  await assert.rejects(
    () =>
      sendUrgentWebPush(payload, {
        config: {
          configured: true,
          subject: "mailto:security@example.test",
          publicKey: "public",
          privateKey: "private",
        },
        subscriptions: [subscription],
        deliveryState: {
          pendingSubscriptionHashes: ["subscription-one", "subscription-two"],
          permanentFailureSubscriptionHashes: [],
          intendedSubscriptionHashes: ["subscription-one", "subscription-two"],
        },
        webPush: {
          setVapidDetails() {},
          async sendNotification() {
            contacted = true;
          },
        },
        removeSubscription: async () => {},
      }),
    (error) =>
      error.code === "web_push_permanent_destination_failure" &&
      error.retryable === false &&
      error.deliveryState.permanentFailureSubscriptionHashes.includes(
        "subscription-two"
      )
  );
  assert.equal(contacted, true);
});

test("delivery-time validation rejects persisted destinations outside the current allowlist", async () => {
  const removed = [];
  let contacted = false;
  await assert.rejects(
    () =>
      sendUrgentWebPush(payload, {
        config: {
          configured: true,
          subject: "mailto:security@example.test",
          publicKey: "public",
          privateKey: "private",
        },
        subscriptions: [
          {
            ...subscription,
            endpoint: "https://127.0.0.1/internal",
            endpointHash: "unsafe",
          },
        ],
        webPush: {
          setVapidDetails() {},
          async sendNotification() {
            contacted = true;
          },
        },
        removeSubscription: async (endpoint) => removed.push(endpoint),
      }),
    (error) => error.code === "no_push_subscriptions"
  );
  assert.equal(contacted, false);
  assert.deepEqual(removed, ["https://127.0.0.1/internal"]);
});

test("urgent Web Push bounds concurrent provider calls", async () => {
  const subscriptions = Array.from({ length: 25 }, (_, index) => ({
    ...subscription,
    endpoint: `${subscription.endpoint}-${index}`,
    endpointHash: `subscription-${index}`,
  }));
  let active = 0;
  let maximumActive = 0;

  const result = await sendUrgentWebPush(
    { score: 9, recordId: "opaque", scannedAt: "2026-08-17T00:00:00.000Z" },
    {
      config: {
        configured: true,
        subject: "mailto:security@example.test",
        publicKey: "public",
        privateKey: "private",
      },
      subscriptions,
      webPush: {
        setVapidDetails() {},
        async sendNotification() {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return { statusCode: 201 };
        },
      },
      maxConcurrency: 4,
    }
  );

  assert.equal(result.delivered, subscriptions.length);
  assert.equal(maximumActive <= 4, true);
});

test("urgent Web Push excludes subscriptions whose owner is no longer Admin or IT", async () => {
  let providerCalls = 0;
  await assert.rejects(
    sendUrgentWebPush(payload, {
      config: {
        configured: true,
        subject: "mailto:security@example.test",
        publicKey: "public",
        privateKey: "private",
      },
      subscriptions: [{ ...subscription, userId: "former-it" }],
      isEligibleOwner: () => false,
      webPush: {
        setVapidDetails() {},
        async sendNotification() {
          providerCalls += 1;
        },
      },
      removeSubscription: async () => {},
    }),
    (error) => error.code === "no_push_subscriptions" && error.retryable === false
  );
  assert.equal(providerCalls, 0);
});

test("Web Push fails closed when VAPID or subscriptions are unavailable", async () => {
  await assert.rejects(
    () =>
      sendUrgentWebPush(payload, {
        config: { configured: false },
        subscriptions: [subscription],
      }),
    (error) => error.code === "web_push_not_configured" && error.retryable === false
  );
  await assert.rejects(
    () =>
      sendUrgentWebPush(payload, {
        config: {
          configured: true,
          subject: "mailto:security@example.test",
          publicKey: "public",
          privateKey: "private",
        },
        subscriptions: [],
      }),
    (error) => error.code === "no_push_subscriptions" && error.retryable === false
  );
});
