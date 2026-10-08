import webPush from "web-push";
import { isActiveNotificationRecipientUser } from "./authSessions.js";
import { getWebPushConfig } from "./config.js";
import {
  listPushSubscriptions,
  normalizePushSubscription,
  removeExpiredPushSubscription,
} from "./alertsService.js";

function deliveryError(code, retryable, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function buildPushPayload(payload) {
  return JSON.stringify({
    title: `Urgent security alert — ${payload.score}/10`,
    body: "A high-risk message needs immediate IT review. Open the secured dashboard.",
    tag: `security-alert-${payload.recordId}`,
    data: {
      alertId: payload.recordId,
      url: "/alerts",
    },
  });
}

async function settleWithConcurrency(items, limit, action) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await action(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, limit));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function sendUrgentWebPush(payload, dependencies = {}) {
  const config = dependencies.config ?? getWebPushConfig();
  if (!config.configured) {
    throw deliveryError(
      "web_push_not_configured",
      false,
      "Web Push VAPID configuration is incomplete."
    );
  }

  const storedSubscriptions =
    dependencies.subscriptions ?? (await listPushSubscriptions());
  const isEligibleOwner =
    dependencies.isEligibleOwner ??
    (dependencies.subscriptions ? () => true : isActiveNotificationRecipientUser);
  const removeSubscription =
    dependencies.removeSubscription ?? removeExpiredPushSubscription;
  const validSubscriptions = [];
  for (const stored of storedSubscriptions) {
    if (!isEligibleOwner(stored?.userId)) continue;
    try {
      validSubscriptions.push({ ...stored, ...normalizePushSubscription(stored) });
    } catch {
      await removeSubscription(stored?.endpoint);
    }
  }
  const byHash = new Map(validSubscriptions.map((entry) => [entry.endpointHash, entry]));
  const priorState = dependencies.deliveryState;
  const intendedSubscriptionHashes = priorState
    ? [...priorState.intendedSubscriptionHashes]
    : [...byHash.keys()];
  const priorPermanentHashes = new Set(
    priorState?.permanentFailureSubscriptionHashes ?? []
  );
  const pendingSubscriptionHashes = priorState
    ? [...priorState.pendingSubscriptionHashes]
    : intendedSubscriptionHashes;
  const missingHashes = pendingSubscriptionHashes.filter((hash) => !byHash.has(hash));
  const remainingPendingHashes = pendingSubscriptionHashes.filter((hash) => byHash.has(hash));
  missingHashes.forEach((hash) => priorPermanentHashes.add(hash));
  const subscriptions = remainingPendingHashes.map((hash) => byHash.get(hash));
  if (!subscriptions.length) {
    if (priorPermanentHashes.size) {
      const error = deliveryError(
        "web_push_destination_unavailable",
        false,
        "One or more intended Web Push destinations are no longer eligible or registered."
      );
      error.deliveryState = {
        pendingSubscriptionHashes: [],
        permanentFailureSubscriptionHashes: [...priorPermanentHashes],
        intendedSubscriptionHashes,
      };
      throw error;
    }
    throw deliveryError(
      "no_push_subscriptions",
      false,
      "No active IT browser is subscribed to this urgent Web Push alert."
    );
  }

  const provider = dependencies.webPush ?? webPush;
  provider.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const body = buildPushPayload(payload);
  const maxConcurrency = Math.min(
    10,
    Math.max(1, Number(dependencies.maxConcurrency) || 8)
  );
  const results = await settleWithConcurrency(
    subscriptions,
    maxConcurrency,
    (subscription) =>
      provider.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: subscription.keys,
        },
        body,
        { TTL: 300, urgency: "high" }
      )
  );

  let delivered = 0;
  let expired = 0;
  const transientFailures = [];
  const permanentFailures = new Set(priorPermanentHashes);
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "fulfilled") {
      delivered += 1;
      continue;
    }
    const statusCode = result.reason?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      expired += 1;
      permanentFailures.add(subscriptions[index].endpointHash);
      await removeSubscription(subscriptions[index].endpoint);
      continue;
    }
    transientFailures.push(subscriptions[index].endpointHash);
  }

  if (transientFailures.length) {
    const error = deliveryError(
      "web_push_provider_failure",
      true,
      "Web Push provider delivery failed for one or more subscriptions."
    );
    error.deliveryState = {
      pendingSubscriptionHashes: transientFailures,
      permanentFailureSubscriptionHashes: [...permanentFailures],
      intendedSubscriptionHashes,
    };
    throw error;
  }
  if (permanentFailures.size) {
    const error = deliveryError(
      "web_push_permanent_destination_failure",
      false,
      "One or more intended Web Push destinations permanently rejected delivery."
    );
    error.deliveryState = {
      pendingSubscriptionHashes: [],
      permanentFailureSubscriptionHashes: [...permanentFailures],
      intendedSubscriptionHashes,
    };
    throw error;
  }
  return { ok: true, delivered, expired };
}
