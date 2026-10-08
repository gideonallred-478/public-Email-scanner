import {
  claimNextNotificationJob,
  completeNotificationJob,
  failNotificationJob,
} from "./alertsService.js";

const DEFAULT_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

async function deliverWithTimeout(deliver, job, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => deliver(job)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Notification provider delivery timed out.");
          error.code = "delivery_timeout";
          error.retryable = true;
          reject(error);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function safeErrorCode(error) {
  const value = error?.code ?? error?.name ?? "delivery_failed";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 80);
}

export async function runNotificationWorkerOnce({
  deliver,
  nowMs = Date.now(),
  maxAttempts = 5,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  staleClaimMs = 5 * 60_000,
  deliveryTimeoutMs = 30_000,
} = {}) {
  if (typeof deliver !== "function") {
    throw new TypeError("Notification worker requires a delivery function.");
  }

  const job = await claimNextNotificationJob({ nowMs, staleClaimMs, maxAttempts });
  if (!job) return { ok: true, status: "idle" };

  try {
    await deliverWithTimeout(deliver, job, Math.max(1, deliveryTimeoutMs));
    const completion = await completeNotificationJob(job.id, job.claimToken, nowMs);
    if (!completion.ok) {
      return { ok: false, status: "stale_claim", jobId: job.id };
    }
    return { ok: true, status: "sent", jobId: job.id };
  } catch (error) {
    const delayIndex = Math.max(0, Math.min(job.attempts - 1, retryDelaysMs.length - 1));
    const retryDelayMs = retryDelaysMs[delayIndex] ?? 60_000;
    const result = await failNotificationJob(job.id, {
      nowMs,
      retryable: error?.retryable === true,
      errorCode: safeErrorCode(error),
      maxAttempts,
      retryDelayMs,
      claimToken: job.claimToken,
      deliveryState: error?.deliveryState,
    });
    return {
      ok: false,
      status: result.job?.status ?? "dead",
      jobId: job.id,
      errorCode: result.job?.lastErrorCode ?? "delivery_failed",
    };
  }
}
