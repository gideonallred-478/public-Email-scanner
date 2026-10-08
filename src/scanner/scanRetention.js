/**
 * Tracks which emails were already scanned and when dashboard records expire.
 * Stored in localStorage for local/dev sessions.
 */

import {
  getAppSettings,
  getRetentionDurationMs,
  loadScoringSettings,
} from "./scoringSettings.js";

export const SCAN_REGISTRY_STORAGE_KEY = "senior-email-scanner-scan-registry";

/** Default time before a scan record is forgotten (re-scan allowed). */
export const DEFAULT_SCAN_RETENTION_MS = getRetentionDurationMs(false);

/** Extended retention when IT marks a record "keep for reference". */
export const KEPT_SCAN_RETENTION_MS = getRetentionDurationMs(true);

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getDefaultAlertExpiresAt(
  scannedAtMs = Date.now(),
  keptForReference = false,
  settings = loadScoringSettings()
) {
  const duration = getRetentionDurationMs(keptForReference, settings);
  return new Date(scannedAtMs + duration).toISOString();
}

export function isRetentionExpired(expiresAt, keptForReference, nowMs = Date.now()) {
  if (keptForReference) return false;
  if (!expiresAt) return false;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return nowMs >= expiresMs;
}

export function isAlertExpired(alert, nowMs = Date.now()) {
  if (!alert || alert.keptForReference) return false;
  return isRetentionExpired(alert.expiresAt, false, nowMs);
}

export function filterAlertsByRetention(alerts, nowMs = Date.now()) {
  const list = Array.isArray(alerts) ? alerts : [];
  return list.filter((alert) => !isAlertExpired(alert, nowMs));
}

/**
 * Stable key for "this exact email message" across poll cycles.
 * Pilot mailbox identity scopes the key so the same upstream Message-ID sent
 * to two protected mailboxes is scanned once for each mailbox.
 *
 * @param {object|null|undefined} source
 */
export function buildEmailDedupeKey(source) {
  if (!source || typeof source !== "object") return "";

  const mailboxId = safeString(source.mailboxId ?? source.email?.mailboxId);
  const scoped = (key) => (mailboxId && key ? `${mailboxId}|${key}` : key);

  const messageId = safeString(
    source.messageId ?? source.internetMessageId ?? source.email?.messageId
  );
  if (messageId) return scoped(messageId);

  const externalId = safeString(source.externalId ?? source.id ?? source.uid);
  const mailbox = safeString(source.mailbox ?? source.email?.mailbox);
  if (externalId && mailbox) return scoped(`${mailbox}|${externalId}`);

  const sender = safeString(source.sender ?? source.from ?? source.email?.sender);
  const subject = safeString(source.subject ?? source.email?.subject);
  const receivedAt = safeString(
    source.receivedAt ?? source.receivedDateTime ?? source.email?.receivedAt
  );
  if (sender && subject && receivedAt) {
    return scoped(`${sender}|${subject}|${receivedAt}`);
  }

  return "";
}

function readRegistryRaw() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCAN_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistryRaw(entries) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SCAN_REGISTRY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota failures
  }
}

/**
 * @returns {Array<{ key: string, alertId?: string, scannedAt: string, expiresAt: string, keptForReference?: boolean }>}
 */
export function loadScanRegistry(nowMs = Date.now()) {
  return pruneScanRegistry(readRegistryRaw(), nowMs);
}

export function pruneScanRegistry(entries, nowMs = Date.now()) {
  const list = Array.isArray(entries) ? entries : [];
  const kept = list.filter((entry) => {
    if (!entry?.key) return false;
    if (entry.keptForReference) return true;
    return !isRetentionExpired(entry.expiresAt, false, nowMs);
  });
  if (kept.length !== list.length) {
    writeRegistryRaw(kept);
  }
  return kept;
}

export function isEmailAlreadyScanned(key, nowMs = Date.now()) {
  const normalized = safeString(key);
  if (!normalized) return false;

  const registry = loadScanRegistry(nowMs);
  return registry.some(
    (entry) =>
      entry.key === normalized &&
      (entry.keptForReference || !isRetentionExpired(entry.expiresAt, false, nowMs))
  );
}

export function registerScannedEmail({
  key,
  alertId = null,
  scannedAtMs = Date.now(),
  keptForReference = false,
}) {
  const normalized = safeString(key);
  if (!normalized) return;

  const registry = loadScanRegistry(scannedAtMs);
  const scannedAt = new Date(scannedAtMs).toISOString();
  const expiresAt = getDefaultAlertExpiresAt(scannedAtMs, keptForReference);
  const nextEntry = {
    key: normalized,
    alertId: alertId ?? undefined,
    scannedAt,
    expiresAt,
    keptForReference: Boolean(keptForReference),
  };

  const withoutDuplicate = registry.filter((entry) => entry.key !== normalized);
  writeRegistryRaw([nextEntry, ...withoutDuplicate]);
}

export function keepScannedEmailReference(alertId, nowMs = Date.now()) {
  const id = safeString(alertId);
  if (!id) return false;

  const registry = loadScanRegistry(nowMs);
  let updated = false;
  const next = registry.map((entry) => {
    if (entry.alertId !== id) return entry;
    updated = true;
    return {
      ...entry,
      keptForReference: true,
      expiresAt: getDefaultAlertExpiresAt(nowMs, true),
    };
  });

  if (updated) {
    writeRegistryRaw(next);
  }
  return updated;
}

export function releaseScannedEmailReference(alertId, nowMs = Date.now()) {
  const id = safeString(alertId);
  if (!id) return false;

  const registry = loadScanRegistry(nowMs);
  let updated = false;
  const next = registry.map((entry) => {
    if (entry.alertId !== id) return entry;
    updated = true;
    const scannedMs = Date.parse(entry.scannedAt) || nowMs;
    return {
      ...entry,
      keptForReference: false,
      expiresAt: getDefaultAlertExpiresAt(scannedMs, false),
    };
  });

  if (updated) {
    writeRegistryRaw(next);
  }
  return updated;
}

export function clearScanRegistry() {
  writeRegistryRaw([]);
}

export function getActiveScanDedupeKeys(nowMs = Date.now()) {
  return loadScanRegistry(nowMs).map((entry) => entry.key);
}

export function removeScanRegistryEntriesForAlertIds(alertIds) {
  const ids = new Set(
    (Array.isArray(alertIds) ? alertIds : [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean)
  );
  if (!ids.size) return 0;

  const registry = readRegistryRaw();
  const next = registry.filter((entry) => !entry.alertId || !ids.has(entry.alertId));
  const removed = registry.length - next.length;
  if (removed > 0) {
    writeRegistryRaw(next);
  }
  return removed;
}

export function formatRetentionRemaining(expiresAt, nowMs = Date.now()) {
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return "";
  const diffMs = expiresMs - nowMs;
  if (diffMs <= 0) return "expires soon";

  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 1) return "removed within 1 day";
  return `removed in ${days} days`;
}
