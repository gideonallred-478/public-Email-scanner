import { isResolvedAlert, isSafeRecord, getStudentReportCount } from "../scanner/alertEngine.js";
import { hasUserReportedAlert } from "../scanner/userReports.js";
import { getRecordEmailMessage } from "../scanner/recordAnalysis.js";
import { formatRetentionRemaining } from "../scanner/scanRetention.js";
import { isUrgentRecord } from "../scanner/linkLock.js";
import { AlertStatusControl } from "./AlertStatusControl.jsx";

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return timestamp || "—";
  }
}

function getQueueLabel(alert, safeRecord, resolved) {
  if (safeRecord) return "Cleared";
  if (resolved) return "Resolved";
  if (alert.score >= 8) return "Urgent";
  return "Review";
}

export function AlertCard({
  alert,
  selectedAnalysisId,
  bulkSelected = false,
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
}) {
  const flags = alert.flags ?? {};
  const resolved = isResolvedAlert(alert);
  const safeRecord = isSafeRecord(alert);
  const email = getRecordEmailMessage(alert);
  const analysisSelected = selectedAnalysisId === alert.id;
  const reportCount = getStudentReportCount(alert);
  const userReported = hasUserReportedAlert(alert.id);
  const keptForReference = Boolean(alert.keptForReference);
  const linksLocked = isUrgentRecord(alert);
  const queueLabel = getQueueLabel(alert, safeRecord, resolved);
  const topReasons = (alert.mainReasons ?? []).slice(0, 3);
  const remainingReasons = Math.max(0, (alert.mainReasons ?? []).length - topReasons.length);
  const retentionHint = keptForReference
    ? "Reference · 90 days"
    : alert.expiresAt
      ? formatRetentionRemaining(alert.expiresAt)
      : "";

  return (
    <article
      className={`alert-record alert-record--compact${
        safeRecord
          ? " alert-record--safe"
          : resolved
            ? " alert-record--resolved"
            : flags.urgentPopup
              ? " alert-record--urgent"
              : flags.dashboardAlert
                ? " alert-record--dashboard"
                : ""
      }${analysisSelected ? " alert-record--selected" : ""}${
        bulkSelected ? " alert-record--bulk-selected" : ""
      }`}
    >
      <div className="alert-record__compact-head">
        {onToggleBulkSelect ? (
          <label className="alert-record__bulk-check">
            <input
              type="checkbox"
              checked={bulkSelected}
              onChange={(event) => onToggleBulkSelect(alert.id, event.target.checked)}
              aria-label={`Select alert ${alert.subject || alert.id}`}
            />
          </label>
        ) : null}

        <div className="alert-record__identity">
          <div className="alert-record__queue-line">
            <span className={`alert-record__queue alert-record__queue--${queueLabel.toLowerCase()}`}>
              {queueLabel}
            </span>
            <span className="alert-record__time">
              {formatTimestamp(email?.receivedAt ?? alert.timestamp)}
            </span>
          </div>
          <h3 className="alert-record__subject">{alert.subject || "(no subject)"}</h3>
          <p className="alert-record__sender">{alert.sender || "Unknown sender"}</p>
        </div>

        <div className="alert-record__score-block" aria-label={`Risk score ${alert.score} out of 10`}>
          <strong>{alert.score}</strong>
          <span>/10</span>
          <small>{alert.riskLevel}</small>
        </div>
      </div>

      <div className="alert-record__compact-body">
        <div>
          <p className="alert-record__section-label">Why it was flagged</p>
          {topReasons.length ? (
            <ul className="alert-record__reasons alert-record__reasons--compact">
              {topReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No elevated warning signs.</p>
          )}
          {remainingReasons ? (
            <p className="alert-record__more-reasons">+{remainingReasons} more in full analysis</p>
          ) : null}
        </div>

        <div className="alert-record__response">
          <p className="alert-record__section-label">Recommended response</p>
          <p>{alert.actionSummary || "Review this message before taking action."}</p>
        </div>
      </div>

      <div className="alert-record__flags">
        {flags.lookalikeDetected ? <span className="alert-flag alert-flag--lookalike">Lookalike</span> : null}
        {flags.dangerousDomainDetected ? (
          <span className="alert-flag alert-flag--dangerous">Dangerous domain</span>
        ) : null}
        {flags.trustReviewNeeded ? <span className="alert-flag alert-flag--trust">Trust review</span> : null}
        {flags.userReported ? <span className="alert-flag alert-flag--reported">User reported</span> : null}
        {linksLocked ? <span className="alert-flag alert-flag--locked">Links locked</span> : null}
        {reportCount > 0 ? <span className="alert-flag">{reportCount} student report{reportCount === 1 ? "" : "s"}</span> : null}
        {retentionHint ? <span className="alert-record__retention-hint">{retentionHint}</span> : null}
      </div>

      <div className="alert-record__footer">
        <div className="alert-record__actions">
          {onSelectAnalysis ? (
            <button
              type="button"
              className={`btn btn--primary btn--small${analysisSelected ? " btn--active" : ""}`}
              aria-pressed={analysisSelected}
              onClick={() => onSelectAnalysis(alert.id)}
            >
              {analysisSelected ? "Analysis open" : "View full analysis"}
            </button>
          ) : null}
          {onReportSuspicious ? (
            <button
              type="button"
              className={`btn btn--secondary btn--small${userReported ? " btn--active" : ""}`}
              disabled={userReported || mutationsDisabled}
              onClick={() => onReportSuspicious(alert.id)}
            >
              {userReported ? "Reported" : "Report suspicious"}
            </button>
          ) : null}
          {keptForReference
            ? onReleaseReference && (
                <button type="button" className="btn btn--ghost btn--small" disabled={mutationsDisabled} onClick={() => onReleaseReference(alert.id)}>
                  Normal retention
                </button>
              )
            : onKeepForReference && (
                <button type="button" className="btn btn--ghost btn--small" disabled={mutationsDisabled} onClick={() => onKeepForReference(alert.id)}>
                  Keep reference
                </button>
              )}
        </div>

        <AlertStatusControl
          alert={alert}
          onStatusChange={onStatusChange}
          onResolve={onResolve}
          onReopen={onReopen}
          onReopenSafeForReview={onReopenSafeForReview}
          disabled={mutationsDisabled}
        />
      </div>
    </article>
  );
}
