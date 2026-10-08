import { getAlertNoticeMessage, isSafeRecord } from "../scanner/alertEngine.js";
import { getSpecialtyAlertExplanation } from "../scanner/scanResultSummary.js";

export function AlertCreatedNotice({ alertResult }) {
  if (!alertResult) return null;

  if (alertResult.duplicate) {
    return (
      <p className="scan-alert-notice scan-alert-notice--muted" role="status">
        Duplicate scan skipped — a dashboard record for this email was already
        created within the last few seconds.
      </p>
    );
  }

  const record = alertResult.record ?? alertResult.alert;

  if (!alertResult.created || !record) {
    return (
      <p className="scan-alert-notice scan-alert-notice--muted" role="status">
        No dashboard record created for this scan.
      </p>
    );
  }

  const safeRecord = isSafeRecord(record);
  const urgent = record.flags?.urgentPopup;
  const specialtyExplanation = getSpecialtyAlertExplanation(record);

  return (
    <div className="scan-alert-notice-group">
      {specialtyExplanation ? (
        <p className="scan-alert-notice scan-alert-notice--specialty" role="status">
          {specialtyExplanation}
        </p>
      ) : null}
      <p
        className={`scan-alert-notice${
          safeRecord
            ? " scan-alert-notice--safe"
            : urgent
              ? " scan-alert-notice--urgent"
              : " scan-alert-notice--created"
        }`}
        role="status"
      >
        {getAlertNoticeMessage(record)}
      </p>
    </div>
  );
}
