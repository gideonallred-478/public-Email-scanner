import { ALERT_STATUS, isResolvedAlert, isSafeRecord } from "../scanner/alertEngine.js";

const ACTIVE_STATUSES = [ALERT_STATUS.OPEN, ALERT_STATUS.UNDER_REVIEW];

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp || "—";
  }
}

export function AlertStatusControl({
  alert,
  onStatusChange,
  onResolve,
  onReopen,
  onReopenSafeForReview,
  disabled = false,
}) {
  const resolved = isResolvedAlert(alert);
  const safeRecord = isSafeRecord(alert);

  if (resolved) {
    return (
      <div className="alert-status-control alert-status-control--resolved">
        <span className="alert-status-badge alert-status-badge--resolved">
          Resolved
        </span>
        {alert.resolvedAt ? (
          <span className="alert-status-control__meta muted">
            Resolved {formatTimestamp(alert.resolvedAt)}
          </span>
        ) : null}
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => onReopen(alert.id)}
          disabled={disabled}
        >
          Reopen alert
        </button>
      </div>
    );
  }

  if (safeRecord) {
    return (
      <div className="alert-status-control alert-status-control--safe">
        <span className="alert-status-badge alert-status-badge--safe">
          Safe — auto-cleared
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => onReopenSafeForReview(alert.id)}
          disabled={disabled}
        >
          Reopen for review
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => onResolve(alert.id)}
          disabled={disabled}
        >
          Mark resolved
        </button>
      </div>
    );
  }

  return (
    <div className="alert-status-control">
      <label className="alert-status-control__field">
        <span className="alert-status-control__label">Status</span>
        <select
          className="field__control alert-status-control__select"
          value={alert.status}
          onChange={(e) => onStatusChange(alert.id, e.target.value)}
          disabled={disabled}
        >
          {ACTIVE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn--primary btn--small alert-status-control__resolve"
        onClick={() => onResolve(alert.id)}
        disabled={disabled}
      >
        Mark resolved
      </button>
    </div>
  );
}
