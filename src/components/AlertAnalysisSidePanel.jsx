import { useEffect, useRef } from "react";
import { getRecordEmailMessage } from "../scanner/recordAnalysis.js";
import { RecordAnalysisPanel } from "./RecordAnalysisPanel.jsx";

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp || "—";
  }
}

export function AlertAnalysisSidePanel({ record, onClose, closing = false }) {
  const email = getRecordEmailMessage(record);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (closing) return;
    closeButtonRef.current?.focus();
  }, [record?.id, closing]);

  return (
    <aside
      className={`alert-analysis-side card${closing ? " alert-analysis-side--closing" : ""}`}
      aria-label="Full analysis"
    >
      <header className="alert-analysis-side__header">
        <div>
          <h3>Full analysis</h3>
          <p className="alert-analysis-side__subject">
            {email?.subject || record.subject}
          </p>
          <p className="muted alert-analysis-side__meta">
            {email?.sender || record.sender}
            {email?.receivedAt || record.timestamp
              ? ` · ${formatTimestamp(email?.receivedAt ?? record.timestamp)}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small alert-analysis-side__close"
          ref={closeButtonRef}
          onClick={onClose}
        >
          Close
        </button>
      </header>

      <div className="alert-analysis-side__body">
        <RecordAnalysisPanel record={record} compact />
      </div>
    </aside>
  );
}
