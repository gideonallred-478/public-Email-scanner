export function getNotificationChannelCapabilities() {
  return {
    email: { implemented: true },
    "web-push": { implemented: true },
    sms: { implemented: false, reason: "provider_not_configured" },
    webhook: { implemented: false, reason: "provider_not_configured" },
  };
}

function unsupportedChannel(channel) {
  const error = new Error(`Unsupported notification channel: ${channel}`);
  error.code = "unsupported_notification_channel";
  error.retryable = false;
  return error;
}

export async function deliverNotificationJob(job, dependencies = {}) {
  if (job?.channel === "email") {
    const sendReviewEmail =
      dependencies.sendReviewEmail ??
      (await import("./alertNotifier.js")).sendReviewEmailNotification;
    return sendReviewEmail(job.payload, {
      deliveryState: job.deliveryState ?? null,
    });
  }
  if (job?.channel === "web-push") {
    const sendUrgentWebPush =
      dependencies.sendUrgentWebPush ??
      (await import("./webPushTransport.js")).sendUrgentWebPush;
    return sendUrgentWebPush(job.payload, {
      deliveryState: job.deliveryState ?? null,
    });
  }
  throw unsupportedChannel(job?.channel ?? "missing");
}
