import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./durableJsonFile.js";
import {
  getDefaultAlertExpiresAt,
  isRetentionExpired,
} from "../src/scanner/scanRetention.js";

const DEFAULT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "scan-registry.json"
);

function getRegistryPath() {
  return process.env.SCAN_REGISTRY_DATA_PATH ?? DEFAULT_PATH;
}

async function readRegistryRaw() {
  const path = getRegistryPath();
  await mkdir(dirname(path), { recursive: true });
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError("Scan registry must contain a JSON array.");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegistryRaw(entries) {
  const path = getRegistryPath();
  await mkdir(dirname(path), { recursive: true });
  await writeJsonAtomically(path, entries);
}

function pruneEntries(entries, nowMs) {
  return entries.filter((entry) => {
    if (!entry?.key) return false;
    if (entry.keptForReference) return true;
    return !isRetentionExpired(entry.expiresAt, false, nowMs);
  });
}

export async function loadServerScanRegistry(nowMs = Date.now()) {
  const raw = await readRegistryRaw();
  // Prune in memory only. Persisting here would perform a read-modify-write
  // outside the alert-store lock (this is called from the scan worker's
  // dedupe check) and race concurrent register writes. Expired entries are
  // dropped on the next register/keep/release write instead.
  return pruneEntries(raw, nowMs);
}

export async function getActiveServerScanDedupeKeys(nowMs = Date.now()) {
  const registry = await loadServerScanRegistry(nowMs);
  return registry.map((entry) => entry.key).filter(Boolean);
}

export async function isEmailScannedOnServer(key, nowMs = Date.now()) {
  const normalized = String(key ?? "").trim();
  if (!normalized) return false;

  const registry = await loadServerScanRegistry(nowMs);
  return registry.some(
    (entry) =>
      entry.key === normalized &&
      (entry.keptForReference ||
        !isRetentionExpired(entry.expiresAt, false, nowMs))
  );
}

export async function registerServerScannedEmail({
  key,
  alertId = null,
  scannedAtMs = Date.now(),
  keptForReference = false,
}) {
  const normalized = String(key ?? "").trim();
  if (!normalized) return;

  const registry = await loadServerScanRegistry(scannedAtMs);
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
  await writeRegistryRaw([nextEntry, ...withoutDuplicate]);
}

export async function keepServerScannedEmailReference(alertId, nowMs = Date.now()) {
  const id = String(alertId ?? "").trim();
  if (!id) return false;

  const registry = await loadServerScanRegistry(nowMs);
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
    await writeRegistryRaw(next);
  }
  return updated;
}

export async function releaseServerScannedEmailReference(alertId, nowMs = Date.now()) {
  const id = String(alertId ?? "").trim();
  if (!id) return false;

  const registry = await loadServerScanRegistry(nowMs);
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
    await writeRegistryRaw(next);
  }
  return updated;
}

export async function replaceServerScanRegistry(entries) {
  await writeRegistryRaw(Array.isArray(entries) ? entries : []);
}

export async function clearServerScanRegistry() {
  await replaceServerScanRegistry([]);
}

export async function removeServerScanRegistryEntriesForAlertIds(alertIds) {
  const ids = new Set(
    (Array.isArray(alertIds) ? alertIds : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
  );
  if (!ids.size) return 0;

  const registry = await readRegistryRaw();
  const next = registry.filter((entry) => !entry.alertId || !ids.has(entry.alertId));
  const removed = registry.length - next.length;
  if (removed > 0) {
    await writeRegistryRaw(next);
  }
  return removed;
}
