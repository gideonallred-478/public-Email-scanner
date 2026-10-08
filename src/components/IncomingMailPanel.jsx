import { useIncomingMail } from "../context/IncomingMailContext.jsx";
import { useMailbox } from "../context/MailboxContext.jsx";
import {
  getCompactMailboxControlState,
  getCompactMailboxDiagnostics,
} from "../mail/mailboxPresentation.js";

function formatArrivalTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function statusTone(connectionState, pollingPaused, isLiveConnected) {
  if (isLiveConnected && !pollingPaused) return "active";
  if (connectionState === "connected" && pollingPaused) return "paused";
  if (connectionState === "unconfigured") return "paused";
  return "paused";
}

export function IncomingMailPanel({ show = true, compact = false }) {
  const { isWebDemo } = useMailbox();
  const {
    connectionState,
    statusMessage,
    mailboxAddress,
    pollingPaused,
    isLiveConnected,
    serverManagedScanning,
    currentlyScanningId,
    lastArrival,
    processedCount,
    pollError,
    dashboardMutationPending,
    pollLiveMailbox,
    togglePollingPause,
  } = useIncomingMail();

  const statusLabel = isWebDemo
    ? "Web preview mode"
    : !isLiveConnected
      ? connectionState === "unconfigured"
        ? "Mailbox not configured"
        : connectionState === "bridge-down"
          ? "Mail bridge offline"
          : connectionState === "demo"
            ? "Demo mode"
            : "Connecting to mailbox"
      : serverManagedScanning
        ? "Server scanning inbox"
        : pollingPaused
          ? "Polling paused"
          : currentlyScanningId
            ? "Scanning incoming email"
            : "Watching inbox & spam";

  if (!show) return null;

  const controls = getCompactMailboxControlState({
    useSharedData: serverManagedScanning,
    isLiveConnected,
    pollingPaused,
    currentlyScanningId,
    dashboardMutationPending,
  });

  if (compact) {
    const diagnostics = getCompactMailboxDiagnostics({
      isWebDemo,
      connectionState,
      statusMessage,
      pollError,
      mailboxAddress,
    });

    return (
      <section className="incoming-mail-strip-shell" aria-live="polite">
        <div className="incoming-mail-strip">
          <div className="incoming-mail-strip__state">
            <span
              className={`incoming-mail-strip__dot incoming-mail-strip__dot--${statusTone(
                connectionState,
                pollingPaused,
                isLiveConnected
              )}`}
              aria-hidden="true"
            />
            <div>
              <strong>{statusLabel}</strong>
              <span title={lastArrival?.subject ?? ""}>
                {mailboxAddress ? ` ${mailboxAddress}` : ""}
                {lastArrival?.subject ? ` · Last: ${lastArrival.subject}` : ""}
              </span>
            </div>
          </div>
          <div className="incoming-mail-strip__metrics">
            <span><strong>{processedCount}</strong> scanned</span>
            {pollError ? <span className="incoming-mail-strip__error">Connection issue</span> : null}
            {serverManagedScanning ? (
              <span title="The mail bridge scans this mailbox even when the dashboard is closed.">
                Server managed
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={togglePollingPause}
                  disabled={controls.pauseDisabled}
                >
                  {pollingPaused ? "Resume polling" : "Pause polling"}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={pollLiveMailbox}
                  disabled={controls.checkDisabled}
                  title={controls.checkTitle}
                >
                  {currentlyScanningId ? "Scanning…" : "Check now"}
                </button>
              </>
            )}
          </div>
        </div>
        <details className="incoming-mail-strip__details">
          <summary>Mailbox details</summary>
          <div className="incoming-mail-strip__diagnostics">
            <p>{diagnostics.statusMessage}</p>
            {serverManagedScanning ? (
              <p>The mail bridge scans automatically; this dashboard only syncs results.</p>
            ) : null}
            {diagnostics.guidance ? <p>{diagnostics.guidance}</p> : null}
            {diagnostics.pollError ? (
              <p className="incoming-mail-strip__poll-error">{diagnostics.pollError}</p>
            ) : null}
          </div>
        </details>
      </section>
    );
  }

  return (
    <section className="card incoming-mail-panel" aria-live="polite">
      <div className="incoming-mail-panel__header">
        <div>
          <h3>Incoming mail</h3>
          <p className="muted">
            {isWebDemo
              ? "This public preview does not connect to a real inbox. Use the Demo tab to run sample emails, or paste mail on the Scanner tab."
              : serverManagedScanning
                ? "The mail bridge polls and scans the linked mailbox automatically. The dashboard can be closed without stopping mailbox scanning."
                : "Inbox and spam are polled automatically. Each message is scanned in your browser — nothing is blocked or deleted."}
          </p>
          {isWebDemo ? (
            <p className="incoming-mail-panel__link-note muted">
              <strong>For your teacher:</strong> open <strong>Demo</strong>, run{" "}
              <em>Scholarship Scam</em> and <em>Safe School Announcement</em>, then
              return here to review alerts. Live inbox linking stays on a private
              dev machine until school IT approves it.
            </p>
          ) : connectionState === "unconfigured" ? (
            <p className="incoming-mail-panel__link-note muted">
              <strong>Link your email:</strong> copy <code>.env.example</code> to{" "}
              <code>.env.local</code>, set <code>MAILBOX_PROVIDER=imap</code> or{" "}
              <code>microsoft-graph</code>, add your credentials, then restart{" "}
              <code>npm run dev</code>.
            </p>
          ) : (
            <p className="incoming-mail-panel__link-note muted">
              Linked mailbox: <strong>{mailboxAddress}</strong>
            </p>
          )}
          <p className="incoming-mail-panel__mailbox-status muted">{statusMessage}</p>
          {connectionState === "disconnected" &&
          /AUTHENTICATIONFAILED|Invalid credentials|Gmail rejected/i.test(
            statusMessage ?? ""
          ) ? (
            <p className="incoming-mail-panel__link-note muted">
              <strong>Gmail login failed.</strong> Save <code>.env.local</code> after
              pasting your App Password (16 characters; spaces are OK). Enable IMAP
              under Gmail Settings → Forwarding and POP/IMAP. For OAuth, keep the
              Google Cloud app in <strong>Testing</strong> mode, add yourself as a{" "}
              <strong>Test user</strong>, then run <code>npm run gmail:auth</code> —
              no Google dev approval needed for personal use.
            </p>
          ) : null}
          {pollError ? (
            <p className="incoming-mail-panel__poll-error">{pollError}</p>
          ) : null}
        </div>
        <span
          className={`incoming-mail-panel__status incoming-mail-panel__status--${statusTone(
            connectionState,
            pollingPaused,
            isLiveConnected
          )}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="incoming-mail-panel__metrics">
        <div className="incoming-mail-panel__metric">
          <span className="muted">Scanned from mailbox</span>
          <strong>{processedCount}</strong>
        </div>
        {currentlyScanningId ? (
          <div className="incoming-mail-panel__metric incoming-mail-panel__metric--scanning">
            <span className="muted">Scanning now</span>
            <strong>{lastArrival?.subject ?? "Incoming message"}</strong>
          </div>
        ) : null}
      </div>

      {lastArrival ? (
        <p className="incoming-mail-panel__last-arrival muted">
          Last arrival: <strong>{lastArrival.subject}</strong>
          {lastArrival.safe ? " · auto-cleared to Safe" : " · added to Active alerts"}{" "}
          at {formatArrivalTime(lastArrival.at)}
        </p>
      ) : (
        <p className="incoming-mail-panel__last-arrival muted">
          {isLiveConnected
            ? serverManagedScanning
              ? "Server is watching for new mail…"
              : "Watching for new mail…"
            : isWebDemo
              ? "Run a scenario on the Demo tab to populate this dashboard."
              : "Connect your mailbox in .env.local to start receiving mail."}
        </p>
      )}

      <div className="incoming-mail-panel__actions">
        {serverManagedScanning ? (
          <p className="muted">
            Server-managed scanning is active. Alert results sync into this dashboard automatically.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={togglePollingPause}
              disabled={controls.pauseDisabled}
            >
              {pollingPaused ? "Resume polling" : "Pause polling"}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={pollLiveMailbox}
              disabled={controls.checkDisabled}
              title={controls.checkTitle}
            >
              Check mail now
            </button>
          </>
        )}
      </div>
    </section>
  );
}
