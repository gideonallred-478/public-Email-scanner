import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNotificationJob } from "./notificationPolicy.js";
import { getWebPushAllowedHosts } from "./config.js";
import { writeJsonAtomically } from "./durableJsonFile.js";
import {
  ALERT_STATUS,
  isDuplicateAlert,
  isResolvedAlert,
  isSafeRecord,
} from "../src/scanner/alertEngine.js";
import {
  buildEmailDedupeKey,
  filterAlertsByRetention,
  getDefaultAlertExpiresAt,
  isAlertExpired,
} from "../src/scanner/scanRetention.js";
import {
  clearServerScanRegistry,
  getActiveServerScanDedupeKeys,
  keepServerScannedEmailReference,
  loadServerScanRegistry,
  registerServerScannedEmail,
  releaseServerScannedEmailReference,
  removeServerScanRegistryEntriesForAlertIds,
  replaceServerScanRegistry,
} from "./scanRegistryStore.js";

const DEFAULT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "alerts.json"
);

const MAX_ALERTS = 1000;
const MAX_NOTIFICATION_JOBS = 5000;
const MAX_PUSH_SUBSCRIPTIONS = 100;
const MAX_PUSH_SUBSCRIPTIONS_PER_OWNER = 10;
const MAX_DELIVERY_STATE_DESTINATIONS = 1000;
const ALERT_STATE_VERSION = 2;

function getAlertsPath() {
  return process.env.ALERTS_DATA_PATH ?? DEFAULT_PATH;
}

function createEmptyAlertState() {
  return {
    version: ALERT_STATE_VERSION,
    alerts: [],
    notificationJobs: [],
    pushSubscriptions: [],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isIsoDateOrNull(value) {
  return value === null || isIsoDate(value);
}

function isHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validateHashArray(value) {
  return (
    Array.isArray(value) &&
    value.length <= MAX_DELIVERY_STATE_DESTINATIONS &&
    new Set(value).size === value.length &&
    value.every(isHash)
  );
}

function validateDeliveryState(value, channel, status) {
  if (value === null) return true;
  if (!isPlainObject(value) || ["pending", "sent"].includes(status)) return false;
  const fields =
    channel === "email"
      ? [
          "pendingRecipientHashes",
          "permanentFailureRecipientHashes",
          "intendedRecipientHashes",
        ]
      : [
          "pendingSubscriptionHashes",
          "permanentFailureSubscriptionHashes",
          "intendedSubscriptionHashes",
        ];
  if (
    Object.keys(value).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(value, field) && validateHashArray(value[field]))
  ) {
    return false;
  }
  const [pending, permanent, intended] = fields.map((field) => value[field]);
  const intendedSet = new Set(intended);
  return (
    intended.length > 0 &&
    pending.every((hash) => intendedSet.has(hash)) &&
    permanent.every((hash) => intendedSet.has(hash)) &&
    pending.every((hash) => !permanent.includes(hash)) &&
    (status !== "retry_scheduled" || pending.length > 0)
  );
}

function validateNotificationJob(job) {
  const validStatus = ["pending", "retry_scheduled", "processing", "sent", "dead"];
  const allowedFields = new Set([
    "id",
    "idempotencyKey",
    "recordId",
    "notificationClass",
    "channel",
    "score",
    "riskRevision",
    "payload",
    "status",
    "attempts",
    "nextAttemptAt",
    "createdAt",
    "claimedAt",
    "sentAt",
    "lastErrorCode",
    "claimToken",
    "deliveryState",
  ]);
  const allowedPayloadFields = new Set([
    "notificationClass",
    "recordId",
    "score",
    "scannedAt",
  ]);
  const policyMatches =
    (job?.notificationClass === "review" &&
      job?.channel === "email" &&
      Number.isInteger(job?.score) &&
      job.score >= 5 &&
      job.score <= 7) ||
    (job?.notificationClass === "urgent" &&
      job?.channel === "web-push" &&
      Number.isInteger(job?.score) &&
      job.score >= 8 &&
      job.score <= 10);
  const noClaim = job?.claimToken === null && job?.claimedAt === null;
  const hasError =
    typeof job?.lastErrorCode === "string" && job.lastErrorCode.length > 0;
  const lifecycleMatches =
    (job?.status === "pending" &&
      job.attempts === 0 &&
      noClaim &&
      job.sentAt === null &&
      job.lastErrorCode === null &&
      job.deliveryState === null &&
      isIsoDate(job.nextAttemptAt)) ||
    (job?.status === "retry_scheduled" &&
      job.attempts >= 1 &&
      noClaim &&
      job.sentAt === null &&
      hasError &&
      isIsoDate(job.nextAttemptAt)) ||
    (job?.status === "processing" &&
      job.attempts >= 1 &&
      typeof job.claimToken === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        job.claimToken
      ) &&
      isIsoDate(job.claimedAt) &&
      job.sentAt === null &&
      isIsoDate(job.nextAttemptAt)) ||
    (job?.status === "sent" &&
      job.attempts >= 1 &&
      noClaim &&
      isIsoDate(job.sentAt) &&
      job.nextAttemptAt === null &&
      job.lastErrorCode === null &&
      job.deliveryState === null) ||
    (job?.status === "dead" &&
      job.attempts >= 1 &&
      noClaim &&
      job.sentAt === null &&
      job.nextAttemptAt === null &&
      hasError);
  if (
    !isPlainObject(job) ||
    Object.keys(job).length !== allowedFields.size ||
    !Object.keys(job).every((field) => allowedFields.has(field)) ||
    typeof job.id !== "string" ||
    !job.id ||
    job.id.length > 100 ||
    typeof job.idempotencyKey !== "string" ||
    !job.idempotencyKey ||
    job.idempotencyKey.length > 500 ||
    typeof job.recordId !== "string" ||
    job.recordId.length > 200 ||
    !policyMatches ||
    !isHash(job.riskRevision) ||
    !isPlainObject(job.payload) ||
    Object.keys(job.payload).length !== allowedPayloadFields.size ||
    !Object.keys(job.payload).every((field) => allowedPayloadFields.has(field)) ||
    job.payload.notificationClass !== job.notificationClass ||
    job.payload.score !== job.score ||
    typeof job.payload.recordId !== "string" ||
    !/^[a-f0-9]{24}$/.test(job.payload.recordId) ||
    typeof job.payload.scannedAt !== "string" ||
    !isIsoDate(job.payload.scannedAt) ||
    !validStatus.includes(job.status) ||
    !Number.isInteger(job.attempts) ||
    job.attempts < 0 ||
    !isIsoDateOrNull(job.nextAttemptAt) ||
    !isIsoDate(job.createdAt) ||
    !isIsoDateOrNull(job.claimedAt) ||
    !isIsoDateOrNull(job.sentAt) ||
    (job.claimToken != null && typeof job.claimToken !== "string") ||
    (job.lastErrorCode != null && typeof job.lastErrorCode !== "string") ||
    !lifecycleMatches ||
    !validateDeliveryState(job.deliveryState, job.channel, job.status)
  ) {
    throw new TypeError("Alert state contains an invalid notification job.");
  }
}

function validatePushSubscriptionEntry(entry) {
  const allowedFields = new Set([
    "endpoint",
    "expirationTime",
    "keys",
    "endpointHash",
    "userId",
    "createdAt",
    "updatedAt",
  ]);
  let endpoint;
  try {
    endpoint = new URL(String(entry?.endpoint ?? ""));
  } catch {
    throw new TypeError("Alert state contains an invalid Web Push subscription.");
  }
  if (
    !isPlainObject(entry) ||
    Object.keys(entry).length !== allowedFields.size ||
    !Object.keys(entry).every((field) => allowedFields.has(field)) ||
    (entry.expirationTime !== null &&
      (!Number.isSafeInteger(entry.expirationTime) || entry.expirationTime <= 0)) ||
    endpoint.protocol !== "https:" ||
    entry.endpoint !== endpoint.href ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.href.length > 2048 ||
    !isHash(entry.endpointHash) ||
    entry.endpointHash !==
      createHash("sha256").update(endpoint.href).digest("hex") ||
    typeof entry.userId !== "string" ||
    entry.userId !== entry.userId.trim() ||
    !entry.userId ||
    entry.userId.length > 120 ||
    !isPlainObject(entry.keys) ||
    Object.keys(entry.keys).length !== 2 ||
    !Object.hasOwn(entry.keys, "p256dh") ||
    !Object.hasOwn(entry.keys, "auth") ||
    typeof entry.keys.p256dh !== "string" ||
    !entry.keys.p256dh ||
    entry.keys.p256dh.length > 512 ||
    typeof entry.keys.auth !== "string" ||
    !entry.keys.auth ||
    entry.keys.auth.length > 512 ||
    !isIsoDate(entry.createdAt) ||
    !isIsoDate(entry.updatedAt)
  ) {
    throw new TypeError("Alert state contains an invalid Web Push subscription.");
  }
}

function validateAlerts(entries) {
  if (
    !Array.isArray(entries) ||
    entries.length > MAX_ALERTS ||
    entries.some((entry) => !isPlainObject(entry))
  ) {
    throw new TypeError("Alert state contains an invalid alerts array.");
  }
}

function sanitizeAlertState(value) {
  if (Array.isArray(value)) {
    validateAlerts(value);
    return { ...createEmptyAlertState(), alerts: value };
  }
  if (value === null || typeof value !== "object") {
    throw new TypeError("Alert state must be a legacy alert array or versioned state object.");
  }
  if (value.version !== ALERT_STATE_VERSION) {
    throw new TypeError(`Alert state version must be ${ALERT_STATE_VERSION}.`);
  }
  const stateFields = new Set([
    "version",
    "alerts",
    "notificationJobs",
    "pushSubscriptions",
  ]);
  if (
    Object.keys(value).length !== stateFields.size ||
    !Object.keys(value).every((field) => stateFields.has(field))
  ) {
    throw new TypeError("Alert state contains unsupported top-level fields.");
  }
  validateAlerts(value.alerts);
  if (!Array.isArray(value.notificationJobs)) {
    throw new TypeError("Alert state notificationJobs must be an array.");
  }
  if (!Array.isArray(value.pushSubscriptions)) {
    throw new TypeError("Alert state pushSubscriptions must be an array.");
  }
  if (value.notificationJobs.length > MAX_NOTIFICATION_JOBS) {
    throw new TypeError("Alert state notificationJobs exceed capacity.");
  }
  if (value.pushSubscriptions.length > MAX_PUSH_SUBSCRIPTIONS) {
    throw new TypeError("Alert state pushSubscriptions exceed capacity.");
  }
  value.notificationJobs.forEach(validateNotificationJob);
  value.pushSubscriptions.forEach(validatePushSubscriptionEntry);
  const jobIds = new Set(value.notificationJobs.map((job) => job.id));
  const jobKeys = new Set(value.notificationJobs.map((job) => job.idempotencyKey));
  if (jobIds.size !== value.notificationJobs.length || jobKeys.size !== value.notificationJobs.length) {
    throw new TypeError("Alert state contains duplicate notification jobs.");
  }
  const endpointHashes = new Set(value.pushSubscriptions.map((entry) => entry.endpointHash));
  const endpointUrls = new Set(value.pushSubscriptions.map((entry) => entry.endpoint));
  const ownerCounts = new Map();
  for (const entry of value.pushSubscriptions) {
    ownerCounts.set(entry.userId, (ownerCounts.get(entry.userId) ?? 0) + 1);
  }
  if (
    endpointHashes.size !== value.pushSubscriptions.length ||
    endpointUrls.size !== value.pushSubscriptions.length ||
    [...ownerCounts.values()].some((count) => count > MAX_PUSH_SUBSCRIPTIONS_PER_OWNER)
  ) {
    throw new TypeError("Alert state contains conflicting Web Push subscriptions.");
  }
  return {
    version: ALERT_STATE_VERSION,
    alerts: value.alerts,
    notificationJobs: value.notificationJobs,
    pushSubscriptions: value.pushSubscriptions,
  };
}

async function readAlertStateRaw() {
  const path = getAlertsPath();
  await mkdir(dirname(path), { recursive: true });
  try {
    return sanitizeAlertState(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return createEmptyAlertState();
    throw error;
  }
}

async function writeAlertStateRaw(state) {
  const normalized = sanitizeAlertState(state);
  const stored = {
    ...normalized,
    alerts: normalized.alerts.slice(0, MAX_ALERTS),
    notificationJobs: normalized.notificationJobs,
  };
  if (stored.notificationJobs.length > MAX_NOTIFICATION_JOBS) {
    const error = new Error("Notification outbox exceeded its durable capacity.");
    error.code = "notification_outbox_capacity";
    throw error;
  }
  const path = getAlertsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeJsonAtomically(path, stored);
  return stored;
}

async function readAlertsRaw() {
  return (await readAlertStateRaw()).alerts;
}

async function writeAlertsRaw(alerts) {
  const state = await readAlertStateRaw();
  return (await writeAlertStateRaw({ ...state, alerts })).alerts;
}

function appendNotificationJob(state, record) {
  const job = buildNotificationJob(record);
  if (!job) return state;
  if (state.notificationJobs.some((entry) => entry.idempotencyKey === job.idempotencyKey)) {
    return state;
  }
  let notificationJobs = state.notificationJobs;
  if (notificationJobs.length >= MAX_NOTIFICATION_JOBS) {
    const removable = notificationJobs.findIndex(
      (entry) => entry.status === "sent" || entry.status === "dead"
    );
    if (removable >= 0) {
      notificationJobs = notificationJobs.filter((_, index) => index !== removable);
    }
  }
  if (notificationJobs.length >= MAX_NOTIFICATION_JOBS) {
    const error = new Error("Notification outbox reached its durable capacity.");
    error.code = "notification_outbox_capacity";
    throw error;
  }
  return { ...state, notificationJobs: [...notificationJobs, job] };
}

async function captureSharedAlertState() {
  return {
    state: await readAlertStateRaw(),
    registry: await loadServerScanRegistry(),
  };
}

async function restoreSharedAlertState(snapshot, originalError) {
  const rollback = await Promise.allSettled([
    writeAlertStateRaw(snapshot.state),
    replaceServerScanRegistry(snapshot.registry),
  ]);
  const rollbackFailures = rollback
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (rollbackFailures.length) {
    throw new AggregateError(
      [originalError, ...rollbackFailures],
      "Shared alert update failed and rollback was incomplete."
    );
  }
  throw originalError;
}

async function runFailureAtomicSharedUpdate(action) {
  const snapshot = await captureSharedAlertState();
  try {
    return await action();
  } catch (error) {
    return restoreSharedAlertState(snapshot, error);
  }
}

async function getSharedAlertsUnlocked(nowMs = Date.now()) {
  const alerts = filterAlertsByRetention(await readAlertsRaw(), nowMs);
  const scanKeys = await getActiveServerScanDedupeKeys(nowMs);
  return { ok: true, alerts, scanKeys };
}

async function getSharedAlertByIdUnlocked(alertId) {
  const id = String(alertId ?? "");
  if (!id) return null;
  const state = await readAlertStateRaw();
  return state.alerts.find((entry) => String(entry?.id) === id) ?? null;
}

async function addSharedAlertUnlocked(
  record,
  { notificationRecord = null } = {}
) {
  if (!record || typeof record !== "object" || !record.id) {
    return { ok: false, message: "Invalid alert record." };
  }

  const existing = filterAlertsByRetention(await readAlertsRaw());
  if (isDuplicateAlert(existing, record)) {
    return { ok: false, duplicate: true, record: null, created: false };
  }

  const snapshot = await captureSharedAlertState();
  try {
    const next = [record, ...existing];
    const baseState = { ...snapshot.state, alerts: next };
    const nextState = notificationRecord
      ? appendNotificationJob(baseState, notificationRecord)
      : baseState;
    const alerts = (await writeAlertStateRaw(nextState)).alerts;

    const dedupeKey =
      record.emailDedupeKey ??
      buildEmailDedupeKey(record.email ?? record) ??
      "";
    if (dedupeKey) {
      await registerServerScannedEmail({
        key: dedupeKey,
        alertId: record.id,
        scannedAtMs: Date.parse(record.timestamp) || Date.now(),
        keptForReference: Boolean(record.keptForReference),
      });
    }

    const scanKeys = await getActiveServerScanDedupeKeys();

    return {
      ok: true,
      created: true,
      duplicate: false,
      record,
      alerts,
      scanKeys,
    };
  } catch (error) {
    return restoreSharedAlertState(snapshot, error);
  }
}

async function replaceSharedAlertUnlocked(
  alertId,
  record,
  {
    notificationRecord = null,
    expectedNotificationSourceDigest,
  } = {}
) {
  const id = String(alertId ?? "").trim();
  if (!id || !record || typeof record !== "object") {
    return { ok: false, message: "Invalid alert record." };
  }

  const state = await readAlertStateRaw();
  const existing = state.alerts;
  const current = existing.find((alert) => alert.id === id);
  if (!current) {
    return { ok: false, message: "Alert not found." };
  }
  if (
    expectedNotificationSourceDigest !== undefined &&
    current.notificationSourceDigest !== expectedNotificationSourceDigest
  ) {
    return { ok: false, message: "Alert changed during notification verification." };
  }
  let updated = null;
  const next = existing.map((alert) => {
    if (alert.id !== id) return alert;
    updated = { ...record, id };
    return updated;
  });

  if (!updated) {
    return { ok: false, message: "Alert not found." };
  }

  const baseState = { ...state, alerts: next };
  const nextState = notificationRecord
    ? appendNotificationJob(baseState, { ...notificationRecord, id })
    : baseState;
  const alerts = (await writeAlertStateRaw(nextState)).alerts;
  const scanKeys = await getActiveServerScanDedupeKeys();
  return { ok: true, record: updated, alerts, scanKeys };
}

async function patchSharedAlertUnlocked(alertId, patch) {
  const id = String(alertId ?? "").trim();
  if (!id || !patch || typeof patch !== "object") {
    return { ok: false, message: "Invalid alert update." };
  }

  const existing = await readAlertsRaw();
  let updated = null;
  const next = existing.map((alert) => {
    if (alert.id !== id) return alert;
    updated = { ...alert, ...patch };
    return updated;
  });

  if (!updated) {
    return { ok: false, message: "Alert not found." };
  }

  const alerts = await writeAlertsRaw(next);
  return { ok: true, record: updated, alerts };
}

async function updateSharedAlertStatusUnlocked(alertId, status) {
  const existing = await readAlertsRaw();
  const current = existing.find((alert) => alert.id === alertId);
  if (!current) {
    return { ok: false, message: "Alert not found." };
  }

  const isResolved = status === ALERT_STATUS.RESOLVED;
  const result = await patchSharedAlertUnlocked(alertId, {
    status,
    resolvedAt: isResolved
      ? current.resolvedAt ?? new Date().toISOString()
      : undefined,
  });
  if (!result.ok) return result;
  return {
    ...result,
    scanKeys: await getActiveServerScanDedupeKeys(),
  };
}

async function keepSharedAlertForReferenceUnlocked(alertId) {
  const existing = await readAlertsRaw();
  const current = existing.find((alert) => alert.id === alertId);
  if (!current) {
    return { ok: false, error: "Alert not found." };
  }

  return runFailureAtomicSharedUpdate(async () => {
    const updated = {
      ...current,
      keptForReference: true,
      expiresAt: getDefaultAlertExpiresAt(Date.now(), true),
    };
    const result = await patchSharedAlertUnlocked(alertId, {
      keptForReference: updated.keptForReference,
      expiresAt: updated.expiresAt,
    });
    if (result.ok) {
      await keepServerScannedEmailReference(alertId);
      const scanKeys = await getActiveServerScanDedupeKeys();
      return { ok: true, record: result.record, alerts: result.alerts, scanKeys };
    }
    return { ok: false, error: result.message };
  });
}

async function releaseSharedAlertReferenceUnlocked(alertId) {
  const existing = await readAlertsRaw();
  const current = existing.find((alert) => alert.id === alertId);
  if (!current) {
    return { ok: false, error: "Alert not found." };
  }

  return runFailureAtomicSharedUpdate(async () => {
    const scannedMs = Date.parse(current.timestamp) || Date.now();
    const result = await patchSharedAlertUnlocked(alertId, {
      keptForReference: false,
      expiresAt: getDefaultAlertExpiresAt(scannedMs, false),
    });
    if (result.ok) {
      await releaseServerScannedEmailReference(alertId);
      const scanKeys = await getActiveServerScanDedupeKeys();
      return { ok: true, record: result.record, alerts: result.alerts, scanKeys };
    }
    return { ok: false, error: result.message };
  });
}

async function resolveSharedAlertsUnlocked(alertIds) {
  const ids = new Set(Array.isArray(alertIds) ? alertIds : []);
  if (!ids.size) {
    return { ok: false, error: "No alerts selected.", resolved: 0 };
  }

  let resolved = 0;
  const existing = await readAlertsRaw();
  const next = existing.map((alert) => {
    if (!ids.has(alert.id)) return alert;
    if (isResolvedAlert(alert) || isSafeRecord(alert)) return alert;
    resolved += 1;
    return {
      ...alert,
      status: ALERT_STATUS.RESOLVED,
      resolvedAt: alert.resolvedAt ?? new Date().toISOString(),
    };
  });

  const alerts = await writeAlertsRaw(next);
  return { ok: true, resolved, alerts, scanKeys: await getActiveServerScanDedupeKeys() };
}

async function removeSharedAlertsUnlocked(alertIds) {
  const ids = new Set(Array.isArray(alertIds) ? alertIds : []);
  if (!ids.size) {
    return { ok: false, error: "No alerts selected.", removed: 0 };
  }

  let removed = 0;
  const existing = await readAlertsRaw();
  const next = existing.filter((alert) => {
    if (!ids.has(alert.id)) return true;
    removed += 1;
    return false;
  });

  return runFailureAtomicSharedUpdate(async () => {
    await removeServerScanRegistryEntriesForAlertIds([...ids]);
    const alerts = await writeAlertsRaw(next);
    return { ok: true, removed, alerts, scanKeys: await getActiveServerScanDedupeKeys() };
  });
}

async function clearExpiredSharedSafeRecordsUnlocked() {
  let removed = 0;
  const removedIds = [];
  const existing = await readAlertsRaw();
  const next = existing.filter((alert) => {
    if (!isSafeRecord(alert)) return true;
    if (alert.keptForReference) return true;
    if (!isAlertExpired(alert)) return true;
    removed += 1;
    removedIds.push(alert.id);
    return false;
  });

  return runFailureAtomicSharedUpdate(async () => {
    await removeServerScanRegistryEntriesForAlertIds(removedIds);
    const alerts = await writeAlertsRaw(next);
    return { ok: true, removed, alerts, scanKeys: await getActiveServerScanDedupeKeys() };
  });
}

async function clearAllSharedAlertsUnlocked() {
  return runFailureAtomicSharedUpdate(async () => {
    await clearServerScanRegistry();
    await writeAlertsRaw([]);
    return { ok: true, alerts: [], scanKeys: [] };
  });
}

async function claimNextNotificationJobUnlocked({
  nowMs = Date.now(),
  staleClaimMs = 5 * 60_000,
  maxAttempts = 5,
} = {}) {
  const state = await readAlertStateRaw();
  const staleBefore = nowMs - staleClaimMs;
  const index = state.notificationJobs.findIndex((job) => {
    if (job.status === "pending" || job.status === "retry_scheduled") {
      return Date.parse(job.nextAttemptAt ?? job.createdAt) <= nowMs;
    }
    return (
      job.status === "processing" &&
      Number.isFinite(Date.parse(job.claimedAt)) &&
      Date.parse(job.claimedAt) <= staleBefore
    );
  });
  if (index < 0) return null;

  const current = state.notificationJobs[index];
  if (Number(current.attempts ?? 0) >= maxAttempts) {
    const notificationJobs = [...state.notificationJobs];
    notificationJobs[index] = {
      ...current,
      status: "dead",
      claimToken: null,
      claimedAt: null,
      nextAttemptAt: null,
      lastErrorCode: "stale_claim_attempts_exhausted",
    };
    await writeAlertStateRaw({ ...state, notificationJobs });
    return claimNextNotificationJobUnlocked({ nowMs, staleClaimMs, maxAttempts });
  }

  const job = {
    ...current,
    status: "processing",
    attempts: Number(current.attempts ?? 0) + 1,
    claimToken: randomUUID(),
    claimedAt: new Date(nowMs).toISOString(),
  };
  const notificationJobs = [...state.notificationJobs];
  notificationJobs[index] = job;
  await writeAlertStateRaw({ ...state, notificationJobs });
  return job;
}

async function completeNotificationJobUnlocked(jobId, claimToken, nowMs = Date.now()) {
  const state = await readAlertStateRaw();
  const index = state.notificationJobs.findIndex((job) => job.id === jobId);
  if (index < 0) return { ok: false, message: "Notification job not found." };
  const current = state.notificationJobs[index];
  if (current.status !== "processing" || current.claimToken !== claimToken) {
    return { ok: false, staleClaim: true };
  }
  const notificationJobs = [...state.notificationJobs];
  notificationJobs[index] = {
    ...current,
    status: "sent",
    sentAt: new Date(nowMs).toISOString(),
    claimToken: null,
    claimedAt: null,
    nextAttemptAt: null,
    lastErrorCode: null,
    deliveryState: null,
  };
  await writeAlertStateRaw({ ...state, notificationJobs });
  return { ok: true, job: notificationJobs[index] };
}

async function failNotificationJobUnlocked(
  jobId,
  {
    nowMs = Date.now(),
    retryable = false,
    errorCode = "delivery_failed",
    maxAttempts = 5,
    retryDelayMs = 60_000,
    claimToken,
    deliveryState,
  } = {}
) {
  const state = await readAlertStateRaw();
  const index = state.notificationJobs.findIndex((job) => job.id === jobId);
  if (index < 0) return { ok: false, message: "Notification job not found." };
  const current = state.notificationJobs[index];
  if (current.status !== "processing" || current.claimToken !== claimToken) {
    return { ok: false, staleClaim: true };
  }
  const shouldRetry = retryable && current.attempts < maxAttempts;
  const notificationJobs = [...state.notificationJobs];
  notificationJobs[index] = {
    ...current,
    status: shouldRetry ? "retry_scheduled" : "dead",
    claimToken: null,
    claimedAt: null,
    deliveryState: deliveryState ?? current.deliveryState ?? null,
    nextAttemptAt: shouldRetry
      ? new Date(nowMs + Math.max(0, retryDelayMs)).toISOString()
      : null,
    lastErrorCode: String(errorCode || "delivery_failed").slice(0, 80),
  };
  await writeAlertStateRaw({ ...state, notificationJobs });
  return { ok: true, job: notificationJobs[index] };
}

async function getNotificationStatusUnlocked({
  includeDevices = false,
  nowMs = Date.now(),
} = {}) {
  const state = await readAlertStateRaw();
  const counts = {};
  const deadErrorCodes = {};
  let oldestOutstandingMs = null;
  for (const job of state.notificationJobs) {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    if (job.status === "dead") {
      const code = String(job.lastErrorCode || "delivery_failed").slice(0, 80);
      deadErrorCodes[code] = (deadErrorCodes[code] ?? 0) + 1;
    }
    if (["pending", "retry_scheduled", "processing"].includes(job.status)) {
      const createdMs = Date.parse(job.createdAt);
      if (Number.isFinite(createdMs)) {
        oldestOutstandingMs = Math.max(oldestOutstandingMs ?? 0, nowMs - createdMs);
      }
    }
  }
  const result = {
    ok: true,
    counts,
    deadErrorCodes,
    oldestOutstandingAgeMs: oldestOutstandingMs,
    pushSubscriptions: state.pushSubscriptions.length,
  };
  if (includeDevices) {
    result.devices = state.pushSubscriptions.map((entry) => ({
      endpointHash: entry.endpointHash,
      userId: entry.userId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  }
  return result;
}

export function normalizePushSubscription(subscription) {
  let endpoint;
  try {
    endpoint = new URL(String(subscription?.endpoint ?? ""));
  } catch {
    throw new TypeError("A valid Web Push subscription is required.");
  }
  const p256dh = String(subscription?.keys?.p256dh ?? "");
  const auth = String(subscription?.keys?.auth ?? "");
  const hostname = endpoint.hostname.toLowerCase();
  const allowedHosts = getWebPushAllowedHosts();
  const hostAllowed =
    allowedHosts.has(hostname) || hostname.endsWith(".notify.windows.com");
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    !hostAllowed ||
    endpoint.href.length > 2048 ||
    !p256dh ||
    p256dh.length > 512 ||
    !auth ||
    auth.length > 512
  ) {
    throw new TypeError("A valid Web Push subscription is required.");
  }
  return {
    endpoint: endpoint.href,
    expirationTime: Number.isFinite(subscription.expirationTime)
      ? subscription.expirationTime
      : null,
    keys: { p256dh, auth },
  };
}

async function upsertPushSubscriptionUnlocked(subscription, { userId = "" } = {}) {
  const owner = String(userId).trim().slice(0, 120);
  if (!owner) throw new TypeError("A subscription owner is required.");
  const normalized = normalizePushSubscription(subscription);
  const state = await readAlertStateRaw();
  const endpointHash = createHash("sha256").update(normalized.endpoint).digest("hex");
  const index = state.pushSubscriptions.findIndex(
    (entry) => entry.endpointHash === endpointHash
  );
  if (index >= 0 && state.pushSubscriptions[index].userId !== owner) {
    throw new Error("This Web Push subscription is owned by another user.");
  }
  if (
    index < 0 &&
    state.pushSubscriptions.filter((entry) => entry.userId === owner).length >=
      MAX_PUSH_SUBSCRIPTIONS_PER_OWNER
  ) {
    const error = new Error("Web Push subscription owner reached device capacity.");
    error.code = "push_subscription_owner_capacity";
    throw error;
  }
  if (index < 0 && state.pushSubscriptions.length >= MAX_PUSH_SUBSCRIPTIONS) {
    const error = new Error("Web Push subscription storage reached capacity.");
    error.code = "push_subscription_capacity";
    throw error;
  }
  const now = new Date().toISOString();
  const entry = {
    ...normalized,
    endpointHash,
    userId: owner,
    createdAt: index >= 0 ? state.pushSubscriptions[index].createdAt : now,
    updatedAt: now,
  };
  const pushSubscriptions = [...state.pushSubscriptions];
  if (index >= 0) pushSubscriptions[index] = entry;
  else pushSubscriptions.push(entry);
  await writeAlertStateRaw({ ...state, pushSubscriptions });
  return { ok: true, created: index < 0, endpointHash };
}

async function listPushSubscriptionsUnlocked() {
  return (await readAlertStateRaw()).pushSubscriptions;
}

async function removePushSubscriptionUnlocked(
  endpointValue,
  { userId = "", providerCleanup = false } = {}
) {
  const endpoint = String(endpointValue ?? "");
  const owner = String(userId).trim().slice(0, 120);
  const state = await readAlertStateRaw();
  const pushSubscriptions = state.pushSubscriptions.filter((entry) => {
    if (entry.endpoint !== endpoint) return true;
    return !(providerCleanup || (owner && entry.userId === owner));
  });
  const removed = state.pushSubscriptions.length - pushSubscriptions.length;
  if (removed) await writeAlertStateRaw({ ...state, pushSubscriptions });
  return { ok: true, removed };
}

async function removePushSubscriptionByHashUnlocked(endpointHashValue) {
  const endpointHash = String(endpointHashValue ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(endpointHash)) {
    return { ok: false, removed: 0, message: "Invalid subscription reference." };
  }
  const state = await readAlertStateRaw();
  const pushSubscriptions = state.pushSubscriptions.filter(
    (entry) => entry.endpointHash !== endpointHash
  );
  const removed = state.pushSubscriptions.length - pushSubscriptions.length;
  if (removed) await writeAlertStateRaw({ ...state, pushSubscriptions });
  return { ok: true, removed };
}

let alertStoreTail = Promise.resolve();

function runAlertStoreExclusive(action) {
  const run = alertStoreTail.then(action, action);
  alertStoreTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function getSharedAlerts(...args) {
  return runAlertStoreExclusive(() => getSharedAlertsUnlocked(...args));
}

export function getSharedAlertById(...args) {
  return runAlertStoreExclusive(() => getSharedAlertByIdUnlocked(...args));
}

export function addSharedAlert(...args) {
  return runAlertStoreExclusive(() => addSharedAlertUnlocked(...args));
}

export function replaceSharedAlert(...args) {
  return runAlertStoreExclusive(() => replaceSharedAlertUnlocked(...args));
}

export function patchSharedAlert(...args) {
  return runAlertStoreExclusive(() => patchSharedAlertUnlocked(...args));
}

export function updateSharedAlertStatus(...args) {
  return runAlertStoreExclusive(() => updateSharedAlertStatusUnlocked(...args));
}

export function keepSharedAlertForReference(...args) {
  return runAlertStoreExclusive(() => keepSharedAlertForReferenceUnlocked(...args));
}

export function releaseSharedAlertReference(...args) {
  return runAlertStoreExclusive(() => releaseSharedAlertReferenceUnlocked(...args));
}

export function resolveSharedAlerts(...args) {
  return runAlertStoreExclusive(() => resolveSharedAlertsUnlocked(...args));
}

export function removeSharedAlerts(...args) {
  return runAlertStoreExclusive(() => removeSharedAlertsUnlocked(...args));
}

export function clearExpiredSharedSafeRecords(...args) {
  return runAlertStoreExclusive(() => clearExpiredSharedSafeRecordsUnlocked(...args));
}

export function clearAllSharedAlerts(...args) {
  return runAlertStoreExclusive(() => clearAllSharedAlertsUnlocked(...args));
}

export function claimNextNotificationJob(...args) {
  return runAlertStoreExclusive(() => claimNextNotificationJobUnlocked(...args));
}

export function completeNotificationJob(...args) {
  return runAlertStoreExclusive(() => completeNotificationJobUnlocked(...args));
}

export function failNotificationJob(...args) {
  return runAlertStoreExclusive(() => failNotificationJobUnlocked(...args));
}

export function getNotificationStatus(...args) {
  return runAlertStoreExclusive(() => getNotificationStatusUnlocked(...args));
}

export function upsertPushSubscription(...args) {
  return runAlertStoreExclusive(() => upsertPushSubscriptionUnlocked(...args));
}

export function listPushSubscriptions(...args) {
  return runAlertStoreExclusive(() => listPushSubscriptionsUnlocked(...args));
}

export function removeExpiredPushSubscription(endpointValue) {
  return runAlertStoreExclusive(() =>
    removePushSubscriptionUnlocked(endpointValue, { providerCleanup: true })
  );
}

export function removePushSubscription(...args) {
  return runAlertStoreExclusive(() => removePushSubscriptionUnlocked(...args));
}

export function removePushSubscriptionByHash(...args) {
  return runAlertStoreExclusive(() => removePushSubscriptionByHashUnlocked(...args));
}
