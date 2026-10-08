import { useEffect, useMemo, useRef, useState } from "react";
import { useAlerts } from "../context/AlertsContext.jsx";
import { useScannerWorkflow } from "../context/ScannerWorkflowContext.jsx";

import {
  filterAlerts,
  summarizeAlerts,
  isSafeRecord,
  ALERT_STATUS,
} from "../scanner/alertEngine.js";
import { exportAlertsDownload } from "../scanner/alertExport.js";

import { AlertSummaryCards } from "../components/AlertSummaryCards.jsx";
import { AlertFilters } from "../components/AlertFilters.jsx";
import { AlertList } from "../components/AlertList.jsx";
import { AlertBulkActionsBar } from "../components/AlertBulkActionsBar.jsx";
import { IncomingMailPanel } from "../components/IncomingMailPanel.jsx";
import { AlertAnalysisSidePanel } from "../components/AlertAnalysisSidePanel.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { useUiPreferences } from "../context/UiPreferencesContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { canClearAllAlerts } from "../auth/rolePermissions.js";
import {
  getClearAlertHistoryCopy,
  shouldShowExpiredSafeCleanup,
} from "../scanner/dashboardPresentation.js";

const ANALYSIS_PANEL_CLOSE_MS = 240;

export function AlertsPage() {
  const {
    alerts,
    updateAlertStatus,
    resolveAlert,
    reopenAlert,
    reopenSafeForReview,

    keepAlertForReference,
    releaseAlertReference,
    resolveAlerts,
    clearExpiredSafeRecords,
    clearAlerts,
    highlightedRecordId,
    setHighlightedRecordId,
    dashboardFilter,
    setDashboardFilter,
    dashboardMutation: queueMutation,
    runDashboardMutation,
    useSharedData,
  } = useAlerts();
  const { user } = useAuth();
  const { reportSuspiciousRecord } = useScannerWorkflow();
  const { preferences } = useUiPreferences();
  const [activeFilter, setActiveFilter] = useState("active");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(null);
  const [analysisPanelPhase, setAnalysisPanelPhase] = useState("closed");
  const [selectedAlertIds, setSelectedAlertIds] = useState(() => new Set());
  const [reportNotice, setReportNotice] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const [clearAlertsConfirmOpen, setClearAlertsConfirmOpen] = useState(false);
  const canClearAlertHistory = !useSharedData || canClearAllAlerts(user?.role);
  const clearAlertHistoryCopy = getClearAlertHistoryCopy({ useSharedData });
  const showQueueActions =
    canClearAlertHistory || shouldShowExpiredSafeCleanup(activeFilter);

  const highlightRef = useRef(null);
  const closePanelTimerRef = useRef(null);


  useEffect(() => {
    if (dashboardFilter) {
      setActiveFilter(dashboardFilter);
      setDashboardFilter(null);
    }
  }, [dashboardFilter, setDashboardFilter]);

  useEffect(() => {
    if (!highlightedRecordId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightedRecordId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightedRecordId, alerts, setHighlightedRecordId]);

  useEffect(() => {
    if (!selectedAnalysisId) return;
    const stillVisible = alerts.some((alert) => alert.id === selectedAnalysisId);
    if (!stillVisible) setSelectedAnalysisId(null);
  }, [alerts, selectedAnalysisId]);

  useEffect(() => {
    setSelectedAlertIds((prev) => {
      const next = new Set([...prev].filter((id) => alerts.some((alert) => alert.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [alerts]);

  useEffect(() => {
    if (!selectedAnalysisId) {
      setAnalysisPanelPhase("closed");
    }
  }, [selectedAnalysisId]);

  useEffect(
    () => () => {
      if (closePanelTimerRef.current) {
        window.clearTimeout(closePanelTimerRef.current);
      }
    },
    []
  );

  const summary = useMemo(() => summarizeAlerts(alerts), [alerts]);
  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, activeFilter),
    [alerts, activeFilter]
  );
  const selectedRecord = useMemo(
    () => alerts.find((alert) => alert.id === selectedAnalysisId) ?? null,
    [alerts, selectedAnalysisId]
  );
  const visibleSelectedCount = useMemo(
    () => filteredAlerts.filter((alert) => selectedAlertIds.has(alert.id)).length,
    [filteredAlerts, selectedAlertIds]
  );
  const allVisibleSelected =
    filteredAlerts.length > 0 &&
    filteredAlerts.every((alert) => selectedAlertIds.has(alert.id));

  function showBulkNotice(message) {
    setBulkNotice(message);
    window.setTimeout(() => setBulkNotice(""), 4000);
  }

  async function runQueueMutation(operation, action) {
    try {
      const execution = await runDashboardMutation(operation, action);
      if (!execution.started) {
        showBulkNotice("Another dashboard update is in progress. Try again.");
        return;
      }
      if (execution.value?.ok === false) {
        showBulkNotice(execution.value.error ?? "Could not update alert.");
      }
    } catch (error) {
      showBulkNotice(error instanceof Error ? error.message : "Could not update alert.");
    }
  }

  function handleToggleBulkSelect(alertId, checked) {
    setSelectedAlertIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(alertId);
      else next.delete(alertId);
      return next;
    });
  }

  function handleToggleSelectAll(checked) {
    setSelectedAlertIds((prev) => {
      const next = new Set(prev);
      for (const alert of filteredAlerts) {
        if (checked) next.add(alert.id);
        else next.delete(alert.id);
      }
      return next;
    });
  }

  async function handleResolveSelected() {
    const ids = filteredAlerts
      .filter((alert) => selectedAlertIds.has(alert.id))
      .map((alert) => alert.id);
    try {
      const execution = await runDashboardMutation("resolve", () => resolveAlerts(ids));
      if (!execution.started) return;
      const result = execution.value;
      if (!result?.ok) {
        showBulkNotice(result?.error ?? "Could not resolve selected alerts.");
        return;
      }
      showBulkNotice(
        result.resolved
          ? `Resolved ${result.resolved} alert${result.resolved === 1 ? "" : "s"}.`
          : "No open alerts were selected to resolve."
      );
    } catch (error) {
      showBulkNotice(
        error instanceof Error ? error.message : "Could not resolve selected alerts."
      );
    }
  }

  async function handleClearExpiredSafe() {
    try {
      const execution = await runDashboardMutation("clear-expired-safe", clearExpiredSafeRecords);
      if (!execution.started) return;
      const result = execution.value;
      if (!result?.ok) {
        showBulkNotice(result?.error ?? "Could not clear expired Safe records.");
        return;
      }
      showBulkNotice(
        result.removed
          ? `Removed ${result.removed} expired Safe record${result.removed === 1 ? "" : "s"}.`
          : "No expired Safe records to remove."
      );
    } catch (error) {
      showBulkNotice(
        error instanceof Error
          ? error.message
          : "Could not clear expired Safe records."
      );
    }
  }

  async function handleConfirmClearAlerts() {
    const recordCount = alerts.length;
    try {
      const execution = await runDashboardMutation("clear-history", clearAlerts);
      if (!execution.started) return;
      const result = execution.value;
      if (!result?.ok) {
        setClearAlertsConfirmOpen(false);
        showBulkNotice(result?.error ?? "Could not clear alert history.");
        return;
      }

      setSelectedAlertIds(new Set());
      setSelectedAnalysisId(null);
      setClearAlertsConfirmOpen(false);
      showBulkNotice(
        recordCount
          ? `Cleared ${recordCount} dashboard record${recordCount === 1 ? "" : "s"}.`
          : "The dashboard was already empty."
      );
    } catch (error) {
      setClearAlertsConfirmOpen(false);
      showBulkNotice(
        error instanceof Error ? error.message : "Could not clear alert history."
      );
    }
  }

  function handleExportJson() {
    exportAlertsDownload(filteredAlerts, "json");
    showBulkNotice(`Exported ${filteredAlerts.length} visible alert(s) as JSON.`);
  }

  function handleExportCsv() {
    exportAlertsDownload(filteredAlerts, "csv");
    showBulkNotice(`Exported ${filteredAlerts.length} visible alert(s) as CSV.`);
  }

  function handleSelectAnalysis(recordId) {
    if (closePanelTimerRef.current) {
      window.clearTimeout(closePanelTimerRef.current);
      closePanelTimerRef.current = null;
    }
    setSelectedAnalysisId(recordId);
    setAnalysisPanelPhase("open");
  }

  function closeAnalysisPanel() {
    if (analysisPanelPhase === "closing" || !selectedAnalysisId) return;
    setAnalysisPanelPhase("closing");
    closePanelTimerRef.current = window.setTimeout(() => {
      setSelectedAnalysisId(null);
      setAnalysisPanelPhase("closed");
      closePanelTimerRef.current = null;
    }, ANALYSIS_PANEL_CLOSE_MS);
  }


  async function handleReportSuspicious(alertId) {
    try {
      const execution = await runDashboardMutation(`report:${alertId}`, () =>
        reportSuspiciousRecord(alertId)
      );
      if (!execution.started) return;
      const result = execution.value;
      if (!result?.ok) {
        setReportNotice(result?.error ?? "Could not submit report.");
        return;
      }

      setReportNotice("Report submitted — score updated with your feedback.");
      setHighlightedRecordId(alertId);
      if (
        result.record &&
        (result.record.status === ALERT_STATUS.UNDER_REVIEW ||
          !isSafeRecord(result.record))
      ) {
        setActiveFilter("active");
      }
      window.setTimeout(() => setReportNotice(""), 4000);
    } catch (error) {
      setReportNotice(error instanceof Error ? error.message : "Could not submit report.");
    }
  }

  const analysisPanelVisible =
    Boolean(selectedRecord) &&
    (analysisPanelPhase === "open" || analysisPanelPhase === "closing");
  const analysisLayoutOpen = analysisPanelPhase !== "closed" && Boolean(selectedRecord);

  return (
    <div
      className={`page page--alerts alerts-page${
        analysisLayoutOpen ? " alerts-page--analysis-open" : ""
      }`}
    >
      <div className="alerts-page__main">
        <header className="page-header page-header--alerts staff-dashboard-header">
          <div>
            <p className="staff-dashboard-header__eyebrow">Security operations</p>
            <h2>Suspicious email queue</h2>
            <p className="page-header__sub">
              Investigate high-risk mail first. Scores 8–10 are urgent; scores
              5–7 need review. Routine mail stays out of the active queue.
            </p>
          </div>
          <div className={`staff-dashboard-header__state${summary.urgent ? " staff-dashboard-header__state--urgent" : ""}`}>
            <span className="staff-dashboard-header__state-dot" aria-hidden="true" />
            {summary.urgent ? `${summary.urgent} urgent` : "No urgent alerts"}
          </div>
        </header>

        <IncomingMailPanel show={preferences.showIncomingMailPanelOnAlerts} compact />

        <AlertSummaryCards
          summary={summary}
          activeFilter={activeFilter}
          onSelect={setActiveFilter}
        />

        <section className="staff-queue-toolbar" aria-labelledby="staff-queue-heading">
          <div className="staff-queue-toolbar__heading">
            <div>
              <p className="staff-dashboard-header__eyebrow">Investigation queue</p>
              <h3 id="staff-queue-heading">Messages requiring attention</h3>
            </div>
            <div className="staff-queue-toolbar__actions">
              <span>{filteredAlerts.length} visible</span>
              {showQueueActions ? <details>
                <summary>Queue actions</summary>
                {canClearAlertHistory ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={() => setClearAlertsConfirmOpen(true)}
                    disabled={alerts.length === 0 || Boolean(queueMutation)}
                  >
                    Clear alert history
                  </button>
                ) : null}
                {shouldShowExpiredSafeCleanup(activeFilter) ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={handleClearExpiredSafe}
                    disabled={Boolean(queueMutation)}
                  >
                    Clear expired Safe
                  </button>
                ) : null}
              </details> : null}
            </div>
          </div>
          <AlertFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        </section>

        <AlertBulkActionsBar
          visibleCount={filteredAlerts.length}
          selectedCount={visibleSelectedCount}
          allVisibleSelected={allVisibleSelected}
          onToggleSelectAll={handleToggleSelectAll}
          onResolveSelected={handleResolveSelected}
          onExportJson={handleExportJson}
          onExportCsv={handleExportCsv}
          disabled={Boolean(queueMutation)}
        />

        {bulkNotice ? (
          <p className="alerts-report-notice" role="status">
            {bulkNotice}
          </p>
        ) : null}

        {reportNotice ? (
          <p className="alerts-report-notice" role="status">
            {reportNotice}
          </p>
        ) : null}

        <AlertList
          alerts={filteredAlerts}
          highlightedRecordId={highlightedRecordId}
          highlightRef={highlightRef}
          selectedAnalysisId={selectedAnalysisId}
          selectedAlertIds={selectedAlertIds}
          onToggleBulkSelect={handleToggleBulkSelect}
          onSelectAnalysis={handleSelectAnalysis}
          mutationsDisabled={Boolean(queueMutation)}
          onStatusChange={(alertId, status) =>
            runQueueMutation(`status:${alertId}`, () => updateAlertStatus(alertId, status))
          }
          onResolve={(alertId) =>
            runQueueMutation(`resolve:${alertId}`, () => resolveAlert(alertId))
          }
          onReopen={(alertId) =>
            runQueueMutation(`reopen:${alertId}`, () => reopenAlert(alertId))
          }
          onReopenSafeForReview={(alertId) =>
            runQueueMutation(`review:${alertId}`, () => reopenSafeForReview(alertId))
          }
          onReportSuspicious={handleReportSuspicious}
          onKeepForReference={(alertId) =>
            runQueueMutation(`keep:${alertId}`, () => keepAlertForReference(alertId))
          }
          onReleaseReference={(alertId) =>
            runQueueMutation(`release:${alertId}`, () => releaseAlertReference(alertId))
          }
          emptyMessage={
            activeFilter === "resolved"
              ? "No resolved alerts yet. Mark an active alert as resolved to move it here."
              : activeFilter === "safe"
                ? "No auto-cleared Safe records yet. Wait for the next incoming email."
                : alerts.length === 0
                  ? "Waiting for incoming email — the scanner runs when each message arrives."
                  : "No active alerts match this filter. Try another filter or wait for new mail."
          }
        />
      </div>

      {analysisPanelVisible ? (
        <div
          className={`alerts-page__analysis alerts-page__analysis--${analysisPanelPhase}`}
        >
          <AlertAnalysisSidePanel
            record={selectedRecord}
            closing={analysisPanelPhase === "closing"}
            onClose={closeAnalysisPanel}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={clearAlertsConfirmOpen}
        title="Clear alert history?"
        message={clearAlertHistoryCopy.message}
        confirmLabel="Clear alert history"
        cancelLabel="Keep records"
        destructive
        confirmDisabled={Boolean(queueMutation)}
        cancelDisabled={queueMutation === "clear-history"}
        onConfirm={handleConfirmClearAlerts}
        onCancel={() => setClearAlertsConfirmOpen(false)}
      />


    </div>
  );
}
