import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatReviewEmail,
  sendReviewEmailNotification,
} from "../../server/alertNotifier.js";

test("transient email transport setup failures are retryable", async () => {
  await assert.rejects(
    () =>
      sendReviewEmailNotification(
        { score: 6, recordId: "opaque", scannedAt: "2026-08-17T00:00:00.000Z" },
        {
          config: {
            enabled: true,
            configured: true,
            smtpUser: "alerts@example.test",
            recipients: ["it@example.test"],
          },
          buildTransport: async () => {
            const error = new Error("temporary OAuth network failure");
            error.code = "ETIMEDOUT";
            throw error;
          },
        }
      ),
    (error) => error.code === "review_email_transport_setup_failure" && error.retryable === true
  );
});

test("partial review-email rejection retries only unresolved recipients", async () => {
  const recipients = ["first@example.test", "second@example.test"];
  const attempted = [];
  let deliveryState;
  await assert.rejects(
    sendReviewEmailNotification(
      { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
      {
        config: {
          enabled: true,
          configured: true,
          smtpUser: "alerts@example.test",
          recipients,
        },
        buildTransport: async () => ({
          async sendMail(message) {
            attempted.push(message.to);
            return message.to === recipients[0]
              ? { accepted: [message.to], rejected: [], response: "250 accepted" }
              : { accepted: [], rejected: [message.to], response: "450 temporary failure" };
          },
        }),
      }
    ),
    (error) => {
      deliveryState = error.deliveryState;
      return error.code === "review_email_provider_failure" && error.retryable === true;
    }
  );
  assert.deepEqual(attempted, recipients);

  attempted.length = 0;
  const result = await sendReviewEmailNotification(
    { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
    {
      config: {
        enabled: true,
        configured: true,
        smtpUser: "alerts@example.test",
        recipients,
      },
      deliveryState,
      buildTransport: async () => ({
        async sendMail(message) {
          attempted.push(message.to);
          return { accepted: [message.to], rejected: [], response: "250 accepted" };
        },
      }),
    }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(attempted, [recipients[1]]);
});

test("mixed permanent and transient email failures retry transient recipients then remain visibly dead", async () => {
  const recipients = ["permanent@example.test", "transient@example.test"];
  const config = {
    enabled: true,
    configured: true,
    smtpUser: "alerts@example.test",
    recipients,
  };
  let deliveryState;
  await assert.rejects(
    sendReviewEmailNotification(
      { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
      {
        config,
        buildTransport: async () => ({
          async sendMail(message) {
            return message.to === recipients[0]
              ? { accepted: [], rejected: [message.to], response: "550 permanent rejection" }
              : { accepted: [], rejected: [message.to], response: "450 temporary rejection" };
          },
        }),
      }
    ),
    (error) => {
      deliveryState = error.deliveryState;
      return (
        error.retryable === true &&
        deliveryState.pendingRecipientHashes.length === 1 &&
        deliveryState.permanentFailureRecipientHashes.length === 1
      );
    }
  );

  const retried = [];
  await assert.rejects(
    sendReviewEmailNotification(
      { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
      {
        config,
        deliveryState,
        buildTransport: async () => ({
          async sendMail(message) {
            retried.push(message.to);
            return { accepted: [message.to], rejected: [], response: "250 accepted" };
          },
        }),
      }
    ),
    (error) =>
      error.retryable === false &&
      error.deliveryState.permanentFailureRecipientHashes.length === 1
  );
  assert.deepEqual(retried, [recipients[1]]);
});

test("email retry fails visibly when pending recipient configuration no longer matches", async () => {
  await assert.rejects(
    sendReviewEmailNotification(
      { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
      {
        config: {
          enabled: true,
          configured: true,
          smtpUser: "alerts@example.test",
          recipients: ["replacement@example.test"],
        },
        deliveryState: { pendingRecipientHashes: ["a".repeat(64)] },
        buildTransport: async () => ({
          async sendMail() {
            throw new Error("must not send");
          },
        }),
      }
    ),
    (error) =>
      error.code === "review_email_recipient_configuration_changed" &&
      error.retryable === false
  );
});

test("email retry fails visibly when the configured recipient set changes", async () => {
  const originalRecipients = ["delivered@example.test", "pending@example.test"];
  let deliveryState;
  await assert.rejects(
    sendReviewEmailNotification(
      { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
      {
        config: {
          enabled: true,
          configured: true,
          smtpUser: "alerts@example.test",
          recipients: originalRecipients,
        },
        buildTransport: async () => ({
          async sendMail(message) {
            return message.to === originalRecipients[0]
              ? { accepted: [message.to], rejected: [], response: "250 accepted" }
              : { accepted: [], rejected: [message.to], response: "450 temporary rejection" };
          },
        }),
      }
    ),
    (error) => {
      deliveryState = error.deliveryState;
      return error.retryable === true;
    }
  );

  await assert.rejects(
    sendReviewEmailNotification(
      { score: 6, recordId: "opaque", scannedAt: "2026-08-20T00:00:00.000Z" },
      {
        config: {
          enabled: true,
          configured: true,
          smtpUser: "alerts@example.test",
          recipients: [...originalRecipients, "new@example.test"],
        },
        deliveryState,
        buildTransport: async () => ({
          async sendMail() {
            throw new Error("must not send after recipient-set drift");
          },
        }),
      }
    ),
    (error) =>
      error.code === "review_email_recipient_configuration_changed" &&
      error.retryable === false
  );
});

test("review email is privacy-minimal", () => {
  const { subject, text } = formatReviewEmail({
    notificationClass: "review",
    recordId: "opaque-alert-id",
    score: 6,
    scannedAt: "2026-08-16T12:00:00.000Z",
    emailSender: "must-not-appear@example.test",
    emailSubject: "Must not appear",
    mainReasons: ["Must not appear"],
  });

  assert.match(subject, /review.*6\/10/i);
  assert.match(text, /opaque-alert-id/);
  assert.match(text, /authenticated.*dashboard/i);
  assert.doesNotMatch(`${subject}\n${text}`, /must-not-appear|sender|subject|reason/i);
});
