import { AlertCard } from "./AlertCard.jsx";

export function AlertList({
  alerts,
  highlightedRecordId,
  highlightRef,
  selectedAnalysisId,
  selectedAlertIds,
  onToggleBulkSelect,
  onSelectAnalysis,
  onStatusChange,
  onResolve,
  onReopen,
  onReopenSafeForReview,
  onReportSuspicious,
  onKeepForReference,
  onReleaseReference,
  mutationsDisabled = false,
  emptyMessage,
}) {
  if (!alerts.length) {
    return (
      <div className="alert-list-empty card">
        <p>{emptyMessage}</p>
        <p className="muted alerts-sim-note">
          Incoming email is scanned automatically and results appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          ref={alert.id === highlightedRecordId ? highlightRef : null}
          className={
            alert.id === highlightedRecordId
              ? "alert-list__item alert-list__item--highlighted"
              : "alert-list__item"
          }
        >
          <AlertCard
            alert={alert}
            bulkSelected={selectedAlertIds?.has(alert.id)}
            onToggleBulkSelect={onToggleBulkSelect}
            selectedAnalysisId={selectedAnalysisId}
            onSelectAnalysis={onSelectAnalysis}
            onStatusChange={onStatusChange}
            onResolve={onResolve}
            onReopen={onReopen}
            onReopenSafeForReview={onReopenSafeForReview}
            onReportSuspicious={onReportSuspicious}
            onKeepForReference={onKeepForReference}
            onReleaseReference={onReleaseReference}
            mutationsDisabled={mutationsDisabled}
          />
        </div>
      ))}
    </div>
  );
}
