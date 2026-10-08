import { useIncomingMail } from "../context/IncomingMailContext.jsx";
import { useMailbox } from "../context/MailboxContext.jsx";

function getMailboxLabel(isLiveConnected, isWebDemo, connectionState, mailboxAddress) {
  if (isLiveConnected) {
    return mailboxAddress ? `Live · ${mailboxAddress}` : "Live mail linked";
  }
  if (isWebDemo) return "Web demo";
  if (connectionState === "bridge-down") return "Mail bridge offline";
  if (connectionState === "demo") return "Demo mode";
  if (connectionState === "checking") return "Connecting…";
  if (connectionState === "unconfigured") return "Mailbox not linked";
  return "Local dev";
}

function getScanStatus({
  isLiveConnected,
  isWebDemo,
  pollingPaused,
  currentlyScanningId,
  pollError,
  lastArrival,
}) {
  if (pollError) {
    return {
      label: "Poll issue",
      tone: "error",
      title: pollError,
    };
  }
  if (currentlyScanningId) {
    return {
      label: "Scanning…",
      tone: "active",
      title: "Scanning an incoming message",
    };
  }
  if (isLiveConnected && pollingPaused) {
    return {
      label: "Polling paused",
      tone: "paused",
      title: "Resume polling in Settings if the mail panel is enabled",
    };
  }
  if (lastArrival && !lastArrival.safe) {
    return {
      label: "Flagged",
      tone: "warn",
      title: `${lastArrival.subject} · added to Active alerts`,
    };
  }
  if (lastArrival?.safe) {
    return {
      label: "Latest cleared",
      tone: "ok",
      title: `${lastArrival.subject} · auto-cleared to Safe`,
    };
  }
  if (isLiveConnected) {
    return {
      label: "Watching inbox",
      tone: "active",
      title: "Inbox and spam are polled automatically",
    };
  }
  if (isWebDemo) {
    return {
      label: "Demo ready",
      tone: "paused",
      title: "Run scenarios on the Demo tab to populate alerts",
    };
  }
  return {
    label: "Not scanning",
    tone: "paused",
    title: "Link a mailbox in .env.local to scan live mail",
  };
}

export function HeaderMailStatus() {
  const { isLiveConnected, isWebDemo, mailboxAddress, connectionState } =
    useMailbox();
  const {
    pollingPaused,
    currentlyScanningId,
    lastArrival,
    processedCount,
    pollError,
  } = useIncomingMail();

  const mailboxLabel = getMailboxLabel(
    isLiveConnected,
    isWebDemo,
    connectionState,
    mailboxAddress
  );
  const scanStatus = getScanStatus({
    isLiveConnected,
    isWebDemo,
    pollingPaused,
    currentlyScanningId,
    pollError,
    lastArrival,
  });

  const badgeClass = isLiveConnected
    ? "app-header__badge app-header__badge--live"
    : "app-header__badge";

  return (
    <div className="app-header__mail-status">
      <span className={badgeClass} title={mailboxLabel}>
        <span className="app-header__mailbox-label">{mailboxLabel}</span>
        <span className="app-header__scan-count">
          {processedCount} scanned
        </span>
      </span>
      <span
        className={`app-header__scan-status app-header__scan-status--${scanStatus.tone}`}
        title={scanStatus.title}
      >
        {scanStatus.label}
      </span>
    </div>
  );
}
