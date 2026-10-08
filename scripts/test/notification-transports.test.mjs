import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliverNotificationJob,
  getNotificationChannelCapabilities,
} from "../../server/notificationTransports.js";

test("notification transport dispatches review and urgent jobs to distinct channels", async () => {
  const calls = [];
  const dependencies = {
    sendReviewEmail: async (payload) => calls.push(["email", payload.recordId]),
    sendUrgentWebPush: async (payload) => calls.push(["web-push", payload.recordId]),
  };

  await deliverNotificationJob(
    { channel: "email", payload: { recordId: "review" } },
    dependencies
  );
  await deliverNotificationJob(
    { channel: "web-push", payload: { recordId: "urgent" } },
    dependencies
  );

  assert.deepEqual(calls, [
    ["email", "review"],
    ["web-push", "urgent"],
  ]);
});

test("SMS and third-party channels are explicit disabled scaffolds", () => {
  assert.deepEqual(getNotificationChannelCapabilities(), {
    email: { implemented: true },
    "web-push": { implemented: true },
    sms: { implemented: false, reason: "provider_not_configured" },
    webhook: { implemented: false, reason: "provider_not_configured" },
  });
});

test("unknown notification channels fail closed", async () => {
  await assert.rejects(
    () => deliverNotificationJob({ channel: "sms", payload: {} }, {}),
    (error) => error.code === "unsupported_notification_channel" && error.retryable === false
  );
});
