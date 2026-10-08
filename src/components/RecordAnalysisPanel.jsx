import { useMemo } from "react";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { useScoringSettings } from "../context/ScoringSettingsContext.jsx";
import {
  getRecordScanSnapshot,
} from "../scanner/recordAnalysis.js";
import {
  buildOriginalEmailViewModel,
  ORIGINAL_EMAIL_DEFAULT_OPEN,
} from "../scanner/originalEmailView.js";
import {
  defangUrlsInText,
  isUrgentRecord,
} from "../scanner/linkLock.js";
import { ParseResultsPanel } from "./ParseResultsPanel.jsx";
import { CollapsibleSection } from "./CollapsibleSection.jsx";

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp || "—";
  }
}

function EmailMessageDetails({ record }) {
  const email = buildOriginalEmailViewModel(record);
  const linksLocked = isUrgentRecord(record);

  if (!email) {
    return (
      <p className="record-analysis-panel__email-fallback muted">
        Linked email metadata is not available for this record.
      </p>
    );
  }

  return (
    <>
      <dl className="record-analysis-panel__email-grid">
        <dt>Message-ID</dt>
        <dd>
          <code className="code-inline">{email.messageId}</code>
        </dd>
        <dt>Received</dt>
        <dd>{formatTimestamp(email.receivedAt ?? record.timestamp)}</dd>
        <dt>From</dt>
        <dd>{email.from || record.sender}</dd>
        {email.replyTo ? (
          <>
            <dt>Reply-To</dt>
            <dd>{email.replyTo}</dd>
          </>
        ) : null}
        <dt>To</dt>
        <dd>{email.to || "—"}</dd>
        <dt>Subject</dt>
        <dd>{email.subject || record.subject}</dd>
        <dt>Attachments</dt>
        <dd>{email.hasAttachment ? "Present" : "None"}</dd>
      </dl>
      {linksLocked ? (
        <p className="link-lock-notice" role="note">
          Urgent alert — message links are defanged below and cannot be opened
          from this view.
        </p>
      ) : null}
      {email.body ? (
        <pre
          className={`record-analysis-panel__email-body-text${
            linksLocked ? " record-analysis-panel__email-body-text--locked" : ""
          }`}
        >
          {linksLocked ? defangUrlsInText(email.body) : email.body}
        </pre>
      ) : null}
    </>
  );
}

export function RecordAnalysisPanel({ record, compact = false }) {
  const { lists: siteLists } = useSiteLists();
  const { settings: scoringSettings } = useScoringSettings();

  const snapshot = useMemo(
    () => getRecordScanSnapshot(record, { siteLists, scoringSettings }),
    [record, siteLists, scoringSettings]
  );

  if (!snapshot?.parsed) {
    return (
      <div className="record-analysis-panel record-analysis-panel--error">
        <p className="muted">Full analysis is not available for this record.</p>
      </div>
    );
  }

  return (
    <div className="record-analysis-panel">
      <CollapsibleSection
        className="collapsible-section--nested"
        title="Original email"
        defaultOpen={ORIGINAL_EMAIL_DEFAULT_OPEN}
        preview={record.subject}
      >
        <EmailMessageDetails record={record} />
      </CollapsibleSection>

      <ParseResultsPanel
        parsed={snapshot.parsed}
        scanSnapshot={snapshot}
        alertResult={{ record }}
        embedded
      />
    </div>
  );
}
