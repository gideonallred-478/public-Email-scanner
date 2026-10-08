import { createHash, randomUUID } from "node:crypto";

const MIN_SCORE = 0;
const MAX_SCORE = 10;

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function requireScore(score) {
  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    throw new TypeError("Notification score must be an integer from 0 to 10.");
  }
  return score;
}

export function classifyNotificationScore(value) {
  const score = requireScore(value);
  if (score <= 4) {
    return { score, notificationClass: "none", channel: null };
  }
  if (score <= 7) {
    return { score, notificationClass: "review", channel: "email" };
  }
  return { score, notificationClass: "urgent", channel: "web-push" };
}

function normalizeIdentity(record) {
  return String(
    record?.emailDedupeKey ??
      record?.email?.internetMessageId ??
      record?.email?.messageId ??
      record?.email?.id ??
      record?.id ??
      ""
  )
    .trim()
    .toLowerCase();
}

function buildRiskRevision(record) {
  const reasons = Array.isArray(record?.mainReasons)
    ? record.mainReasons.map((reason) => String(reason).trim()).filter(Boolean).sort()
    : [];
  return sha256(
    JSON.stringify({
      score: record.score,
      alertType: String(record?.alertType ?? "").trim(),
      reasons,
      scoringModelRevision: String(record?.scoringModelRevision ?? "v1"),
    })
  );
}

export function buildNotificationJob(record, { nowMs = Date.now() } = {}) {
  if (!record || typeof record !== "object") {
    throw new TypeError("Notification record is required.");
  }
  const policy = classifyNotificationScore(record.score);
  if (policy.notificationClass === "none") return null;

  const identityHash = sha256(normalizeIdentity(record));
  const alertReference = identityHash.slice(0, 24);
  const riskRevision = buildRiskRevision(record);
  const idempotencyKey = `notification:v1:${identityHash}:${policy.notificationClass}:${policy.score}:${riskRevision}`;
  const createdAt = new Date(nowMs).toISOString();

  return {
    id: randomUUID(),
    idempotencyKey,
    recordId: String(record.id ?? ""),
    notificationClass: policy.notificationClass,
    channel: policy.channel,
    score: policy.score,
    riskRevision,
    payload: {
      notificationClass: policy.notificationClass,
      recordId: alertReference,
      score: policy.score,
      scannedAt: String(record.timestamp ?? createdAt),
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: createdAt,
    createdAt,
    claimedAt: null,
    sentAt: null,
    lastErrorCode: null,
    claimToken: null,
    deliveryState: null,
  };
}
