import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ALERT_STATUS,
  createDashboardRecordFromScan,
  isDuplicateAlert,
  isResolvedAlert,
  isSafeRecord,
} from "../scanner/alertEngine.js";
import { clearUserReportedAlerts } from "../scanner/userReports.js";
import {
  buildEmailDedupeKey,
  clearScanRegistry,
  filterAlertsByRetention,
  getDefaultAlertExpiresAt,
  isAlertExpired,
  keepScannedEmailReference,
  loadScanRegistry,
  registerScannedEmail,
  releaseScannedEmailReference,
  removeScanRegistryEntriesForAlertIds,
} from "../scanner/scanRetention.js";
import { useAuth } from "./AuthContext.jsx";
import {
  classifySharedAlertCreation,
  createDashboardMutationLock,
  runDashboardMutationExclusive,
} from "../scanner/dashboardPresentation.js";
import {
  clearAllSharedAlerts,
  clearExpiredSharedSafeAlerts,
  createSharedAlert,
  fetchSharedAlerts,
  keepSharedAlertReference,
  patchSharedAlert,
  releaseSharedAlertReference,
  removeSharedAlerts,
  resolveSharedAlerts,
} from "../api/sharedDataApi.js";

const STORAGE_KEY = "senior-email-scanner-alerts";
const SHARED_SYNC_INTERVAL_MS = 15_000;

const AlertsContext = createContext(null);

function loadStoredAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    loadScanRegistry();
    return filterAlertsByRetention(parsed);
  } catch {
    return [];
  }
}

function persistAlerts(alerts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Demo-only storage; ignore quota or privacy mode failures.
  }
}

function applyServerAlertsPayload(payload, setAlerts, setScanDedupeKeys) {
  if (Array.isArray(payload?.alerts)) {
    setAlerts(payload.alerts);
  }
  if (Array.isArray(payload?.scanKeys)) {
    setScanDedupeKeys(payload.scanKeys);
  }
}

export function AlertsProvider({ children }) {
  const { isAuthenticated, useSharedData } = useAuth();
  const [alerts, setAlerts] = useState(() => loadStoredAlerts());
  const [scanDedupeKeys, setScanDedupeKeys] = useState([]);
  const [highlightedRecordId, setHighlightedRecordId] = useState(null);
  const [dashboardFilter, setDashboardFilter] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const syncVersionRef = useRef(0);
  const [dashboardMutation, setDashboardMutation] = useState(null);
  const dashboardMutationLockRef = useRef(null);
  if (!dashboardMutationLockRef.current) {
    dashboardMutationLockRef.current = createDashboardMutationLock();
  }

  const runDashboardMutation = useCallback(
    (operation, action) =>
      runDashboardMutationExclusive(
        dashboardMutationLockRef.current,
        operation,
        action,
        {
          onStart: setDashboardMutation,
          onFinish: setDashboardMutation,
        }
      ),
    []
  );

  const refreshFromServer = useCallback(async () => {
    if (!useSharedData || !isAuthenticated) return { ok: false };

    const execution = await runDashboardMutation("server-sync", async () => {
      const version = ++syncVersionRef.current;
      setSyncing(true);

      try {
        const result = await fetchSharedAlerts();
        if (version !== syncVersionRef.current) {
          return { ok: false, reason: "stale" };
        }
        if (!result.ok || !result.payload?.ok) {
          setSyncError("Could not sync alerts from the server.");
          return { ok: false };
        }

        applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
        setSyncError("");
        return { ok: true };
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Alert sync failed.");
        return { ok: false };
      } finally {
        if (version === syncVersionRef.current) {
          setSyncing(false);
        }
      }
    });

    return execution.started ? execution.value : { ok: false, reason: "busy" };
  }, [useSharedData, isAuthenticated, runDashboardMutation]);

  useEffect(() => {
    if (!useSharedData || !isAuthenticated) return;
    void refreshFromServer();
    const intervalId = window.setInterval(() => {
      void refreshFromServer();
    }, SHARED_SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [useSharedData, isAuthenticated, refreshFromServer]);

  useEffect(() => {
    if (useSharedData) return;
    persistAlerts(alerts);
  }, [alerts, useSharedData]);

  useEffect(() => {
    if (useSharedData) return;

    const pruneExpired = () => {
      setAlerts((prev) => {
        const next = filterAlertsByRetention(prev);
        return next.length === prev.length ? prev : next;
      });
    };

    pruneExpired();
    const intervalId = window.setInterval(pruneExpired, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [useSharedData]);

  const addDashboardRecordFromScan = useCallback(
    async ({
      parsed,
      scoreResult,
      actionPlan,
      trustDecay,
      lookalikeResult,
      siteLists,
      scenarioId = null,
      email = null,
      scanSnapshot = null,
    }) => {
      const record = createDashboardRecordFromScan(
        parsed,
        scoreResult,
        actionPlan,
        trustDecay,
        lookalikeResult,
        siteLists,
        { scenarioId, email, scanSnapshot }
      );

      if (!record) {
        return { created: false, record: null, duplicate: false };
      }

      if (useSharedData) {
        const result = await createSharedAlert(record);
        const creation = classifySharedAlertCreation(result);

        if (creation.kind === "duplicate") {
          return { created: false, record: null, alert: null, duplicate: true };
        }

        if (creation.kind === "created") {
          applyServerAlertsPayload(creation.payload, setAlerts, setScanDedupeKeys);
          return {
            created: true,
            record: creation.record,
            alert: creation.record,
            duplicate: false,
          };
        }

        return {
          ok: false,
          created: false,
          record: null,
          alert: null,
          duplicate: false,
          error: creation.error,
        };
      }

      let outcome = { created: false, record: null, duplicate: false };

      setAlerts((prev) => {
        if (isDuplicateAlert(prev, record)) {
          outcome = { created: false, record: null, alert: null, duplicate: true };
          return prev;
        }
        outcome = { created: true, record, alert: record, duplicate: false };
        const dedupeKey =
          record.emailDedupeKey ??
          buildEmailDedupeKey(email ?? record.email ?? parsed);
        if (dedupeKey) {
          registerScannedEmail({
            key: dedupeKey,
            alertId: record.id,
            scannedAtMs: Date.parse(record.timestamp) || Date.now(),
            keptForReference: Boolean(record.keptForReference),
          });
        }
        return [record, ...prev];
      });

      return outcome;
    },
    [useSharedData]
  );

  const updateAlertStatus = useCallback(
    async (alertId, status) => {
      if (useSharedData) {
        const result = await patchSharedAlert(alertId, { status });
        if (result.ok && result.payload?.ok) {
          applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
          return { ok: true };
        }
        return {
          ok: false,
          error:
            result.payload?.error ??
            result.payload?.message ??
            "Could not update alert status.",
        };
      }

      setAlerts((prev) =>
        prev.map((alert) => {
          if (alert.id !== alertId) return alert;

          const isResolved = status === ALERT_STATUS.RESOLVED;
          return {
            ...alert,
            status,
            resolvedAt: isResolved
              ? alert.resolvedAt ?? new Date().toISOString()
              : undefined,
          };
        })
      );
      return { ok: true };
    },
    [useSharedData]
  );

  const resolveAlert = useCallback(
    (alertId) => updateAlertStatus(alertId, ALERT_STATUS.RESOLVED),
    [updateAlertStatus]
  );

  const reopenAlert = useCallback(
    (alertId) => updateAlertStatus(alertId, ALERT_STATUS.OPEN),
    [updateAlertStatus]
  );

  const reopenSafeForReview = useCallback(
    (alertId) => updateAlertStatus(alertId, ALERT_STATUS.UNDER_REVIEW),
    [updateAlertStatus]
  );

  const clearAlerts = useCallback(async () => {
    if (useSharedData) {
      const result = await clearAllSharedAlerts();
      if (!result.ok || !result.payload?.ok) {
        return {
          ok: false,
          error:
            result.payload?.error ??
            result.payload?.message ??
            "Could not clear shared alert history.",
        };
      }

      setAlerts([]);
      setScanDedupeKeys([]);
      setHighlightedRecordId(null);
      clearUserReportedAlerts();
      return { ok: true };
    }

    setAlerts([]);
    setHighlightedRecordId(null);
    clearUserReportedAlerts();
    clearScanRegistry();
    return { ok: true };
  }, [useSharedData]);

  const keepAlertForReference = useCallback(
    async (alertId) => {
      if (useSharedData) {
        const result = await keepSharedAlertReference(alertId);
        if (result.ok && result.payload?.ok) {
          applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
          return { ok: true, record: result.payload.record };
        }
        return { ok: false, error: result.payload?.error ?? "Alert not found." };
      }

      let updatedRecord = null;
      setAlerts((prev) =>
        prev.map((alert) => {
          if (alert.id !== alertId) return alert;
          updatedRecord = {
            ...alert,
            keptForReference: true,
            expiresAt: getDefaultAlertExpiresAt(Date.now(), true),
          };
          return updatedRecord;
        })
      );

      if (updatedRecord) {
        keepScannedEmailReference(alertId);
        return { ok: true, record: updatedRecord };
      }
      return { ok: false, error: "Alert not found." };
    },
    [useSharedData]
  );

  const releaseAlertReference = useCallback(
    async (alertId) => {
      if (useSharedData) {
        const result = await releaseSharedAlertReference(alertId);
        if (result.ok && result.payload?.ok) {
          applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
          return { ok: true, record: result.payload.record };
        }
        return { ok: false, error: result.payload?.error ?? "Alert not found." };
      }

      let updatedRecord = null;
      setAlerts((prev) =>
        prev.map((alert) => {
          if (alert.id !== alertId) return alert;
          const scannedMs = Date.parse(alert.timestamp) || Date.now();
          updatedRecord = {
            ...alert,
            keptForReference: false,
            expiresAt: getDefaultAlertExpiresAt(scannedMs, false),
          };
          return updatedRecord;
        })
      );

      if (updatedRecord) {
        releaseScannedEmailReference(alertId);
        return { ok: true, record: updatedRecord };
      }
      return { ok: false, error: "Alert not found." };
    },
    [useSharedData]
  );

  const resolveAlerts = useCallback(
    async (alertIds) => {
      if (useSharedData) {
        const result = await resolveSharedAlerts(alertIds);
        if (result.ok && result.payload?.ok) {
          applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
          return { ok: true, resolved: result.payload.resolved ?? 0 };
        }
        return result.payload ?? { ok: false, error: "Could not resolve alerts." };
      }

      const ids = new Set(Array.isArray(alertIds) ? alertIds : []);
      if (!ids.size) {
        return { ok: false, error: "No alerts selected.", resolved: 0 };
      }

      let resolved = 0;
      setAlerts((prev) =>
        prev.map((alert) => {
          if (!ids.has(alert.id)) return alert;
          if (isResolvedAlert(alert) || isSafeRecord(alert)) return alert;
          resolved += 1;
          return {
            ...alert,
            status: ALERT_STATUS.RESOLVED,
            resolvedAt: alert.resolvedAt ?? new Date().toISOString(),
          };
        })
      );

      return { ok: true, resolved };
    },
    [useSharedData]
  );

  const removeAlertsByIds = useCallback(
    async (alertIds) => {
      if (useSharedData) {
        const result = await removeSharedAlerts(alertIds);
        if (result.ok && result.payload?.ok) {
          applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
          return { ok: true, removed: result.payload.removed ?? 0 };
        }
        return result.payload ?? { ok: false, error: "Could not remove alerts." };
      }

      const ids = new Set(Array.isArray(alertIds) ? alertIds : []);
      if (!ids.size) {
        return { ok: false, error: "No alerts selected.", removed: 0 };
      }

      let removed = 0;
      setAlerts((prev) => {
        const next = prev.filter((alert) => {
          if (!ids.has(alert.id)) return true;
          removed += 1;
          return false;
        });
        return next;
      });
      removeScanRegistryEntriesForAlertIds([...ids]);

      return { ok: true, removed };
    },
    [useSharedData]
  );

  const clearExpiredSafeRecords = useCallback(async () => {
    if (useSharedData) {
      const result = await clearExpiredSharedSafeAlerts();
      if (result.ok && result.payload?.ok) {
        applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
        return { ok: true, removed: result.payload.removed ?? 0 };
      }
      return {
        ok: false,
        removed: 0,
        error: result.payload?.error ?? "Could not clear expired Safe records.",
      };
    }

    let removed = 0;
    const removedIds = [];

    setAlerts((prev) => {
      const next = prev.filter((alert) => {
        if (!isSafeRecord(alert)) return true;
        if (alert.keptForReference) return true;
        if (!isAlertExpired(alert)) return true;
        removed += 1;
        removedIds.push(alert.id);
        return false;
      });
      return next;
    });

    removeScanRegistryEntriesForAlertIds(removedIds);
    return { ok: true, removed };
  }, [useSharedData]);

  const updateDashboardRecord = useCallback(
    async (alertId, nextRecord) => {
      if (!alertId || !nextRecord) {
        return { ok: false, error: "Missing alert update." };
      }

      if (useSharedData) {
        const result = await patchSharedAlert(alertId, { record: nextRecord });
        if (result.ok && result.payload?.ok) {
          applyServerAlertsPayload(result.payload, setAlerts, setScanDedupeKeys);
          return { ok: true, record: result.payload.record };
        }
        return { ok: false, error: result.payload?.message ?? "Alert not found." };
      }

      let updated = null;
      setAlerts((prev) =>
        prev.map((alert) => {
          if (alert.id !== alertId) return alert;
          updated = nextRecord;
          return nextRecord;
        })
      );

      if (!updated) {
        return { ok: false, error: "Alert not found." };
      }

      return { ok: true, record: updated };
    },
    [useSharedData]
  );

  const value = useMemo(
    () => ({
      alerts,
      scanDedupeKeys,
      highlightedRecordId,
      setHighlightedRecordId,
      dashboardFilter,
      setDashboardFilter,
      addDashboardRecordFromScan,
      addAlertFromScan: addDashboardRecordFromScan,
      updateAlertStatus,
      updateDashboardRecord,
      resolveAlert,
      reopenAlert,
      reopenSafeForReview,
      clearAlerts,
      keepAlertForReference,
      releaseAlertReference,
      resolveAlerts,
      removeAlertsByIds,
      clearExpiredSafeRecords,
      syncError,
      syncing,
      useSharedData,
      refreshFromServer,
      dashboardMutation,
      dashboardMutationPending: Boolean(dashboardMutation),
      runDashboardMutation,
    }),
    [
      alerts,
      scanDedupeKeys,
      highlightedRecordId,
      dashboardFilter,
      addDashboardRecordFromScan,
      updateAlertStatus,
      updateDashboardRecord,
      resolveAlert,
      reopenAlert,
      reopenSafeForReview,
      clearAlerts,
      keepAlertForReference,
      releaseAlertReference,
      resolveAlerts,
      removeAlertsByIds,
      clearExpiredSafeRecords,
      syncError,
      syncing,
      useSharedData,
      refreshFromServer,
      dashboardMutation,
      runDashboardMutation,
    ]
  );

  return (
    <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) {
    throw new Error("useAlerts must be used within AlertsProvider");
  }
  return ctx;
}
