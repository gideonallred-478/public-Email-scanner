/**
 * Layer 7 — Dashboard record creation (local demo only).
 * Future integration point: push alerts to SIEM, ticketing, or email/webhook.
 */

import { getDefaultSiteLists, getDomainCategory } from "./trustedLinksStore.js";
import { buildScanSummary, getRiskBand, splitReasons } from "./scanResultSummary.js";
import {
  buildEmailDedupeKey,
  filterAlertsByRetention,
  getDefaultAlertExpiresAt,
} from "./scanRetention.js";
import { getAppSettings } from "./scoringSettings.js";

export const ALERT_STATUS = {
  OPEN: "Open",
  UNDER_REVIEW: "Under Review",
  RESOLVED: "Resolved",
  SAFE: "Safe",
};

export function isResolvedAlert(alert) {
  return alert?.status === ALERT_STATUS.RESOLVED;
}

export function isSafeRecord(alert) {
  return alert?.status === ALERT_STATUS.SAFE;
}

export function isActionableAlert(alert) {
  return (
    alert?.status === ALERT_STATUS.OPEN ||
    alert?.status === ALERT_STATUS.UNDER_REVIEW
  );
}

function activeAlerts(alerts) {
  return safeArray(alerts).filter(isActionableAlert);
}

export function isReviewQueueAlert(alert) {
  return isActionableAlert(alert) && alert.score >= 5 && alert.score <= 7;
}

export function isUrgentQueueAlert(alert) {
  return isActionableAlert(alert) && alert.score >= 8;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function collectLinkDomains(parsedEmail) {
  const domains = [];
  const seen = new Set();
  for (const link of safeArray(parsedEmail?.links)) {
    const domain = safeString(link?.domain).trim();
    if (!domain || domain === "unknown" || seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  return domains;
}

function detectDangerousDomain(parsedEmail, siteLists) {
  const lists = siteLists ?? getDefaultSiteLists();
  const senderDomain = safeString(parsedEmail?.senderDomain).trim();
  if (senderDomain && getDomainCategory(senderDomain, lists) === "dangerous") {
    return true;
  }
  return collectLinkDomains(parsedEmail).some(
    (domain) => getDomainCategory(domain, lists) === "dangerous"
  );
}

function scoreBandConfig(score) {
  if (score >= 10) {
    return { priority: "urgent", alertType: "Confirmed/Near-Confirmed Threat" };
  }
  if (score === 9) {
    return { priority: "urgent", alertType: "Critical IT Alert" };
  }
  if (score === 8) {
    return { priority: "urgent", alertType: "Urgent IT Alert" };
  }
  if (score === 7) {
    return { priority: "high", alertType: "High-Priority Review Alert" };
  }
  if (score === 6) {
    return { priority: "medium", alertType: "Review Alert" };
  }
  if (score === 5) {
    return { priority: "low", alertType: "Review Note" };
  }
  return { priority: "low", alertType: "Review Note" };
}

function lowScoreAlertType(
  lookalikeDetected,
  trustReviewNeeded,
  dangerousDomainDetected = false
) {
  if (dangerousDomainDetected && lookalikeDetected && trustReviewNeeded) {
    return "Dangerous Domain, Lookalike & Trust Review";
  }
  if (dangerousDomainDetected && lookalikeDetected) {
    return "Dangerous Domain & Lookalike Review";
  }
  if (dangerousDomainDetected && trustReviewNeeded) {
    return "Dangerous Domain & Trust Review";
  }
  if (dangerousDomainDetected) return "Known Dangerous Domain Review";
  if (lookalikeDetected && trustReviewNeeded) {
    return "Trust & Lookalike Review";
  }
  if (lookalikeDetected) return "Lookalike Review";
  return "Trust Review Note";
}

function lowScoreAlertPriority(dangerousDomainDetected) {
  return dangerousDomainDetected ? "high" : "low";
}

function buildMainReasons({
  lookalikeDetected,
  trustReviewNeeded,
  dangerousDomainDetected,
  scoreResult,
}) {
  const mainReasons = [];

  if (lookalikeDetected) mainReasons.push("Lookalike Domain");
  if (trustReviewNeeded) mainReasons.push("Trust/Spread Review");
  if (dangerousDomainDetected) mainReasons.push("Known Dangerous Domain");

  for (const reason of safeArray(scoreResult?.reasons)) {
    const label = safeString(reason?.label).trim();
    if (label && !mainReasons.includes(label)) {
      mainReasons.push(label);
    }
    if (mainReasons.length >= 5) break;
  }

  return mainReasons;
}

function buildSafeMainReasons(scoreResult) {
  const { credits, increases } = splitReasons(scoreResult?.reasons);
  const mainReasons = [];

  for (const credit of credits) {
    const label = safeString(credit?.label).trim();
    if (label) mainReasons.push(label);
    if (mainReasons.length >= 3) break;
  }

  if (!mainReasons.length && !increases.length) {
    mainReasons.push("No major warning signs detected");
  } else if (!mainReasons.length) {
    mainReasons.push("Minor signals only — within Safe band");
  }

  return mainReasons;
}

function buildActionSummary(actionPlan, scoreResult) {
  const admin = safeString(actionPlan?.adminMessage).trim();
  if (admin) return admin;
  return (
    safeString(scoreResult?.recommendedAction).trim() ||
    "Review recommended based on scan results (simulated)."
  );
}

function buildScanInputSnapshot(parsedEmail) {
  if (!parsedEmail) return null;
  return {
    sender: safeString(parsedEmail.sender),
    replyTo: safeString(parsedEmail.replyTo),
    subject: safeString(parsedEmail.subject),
    body: safeString(parsedEmail.body),
    hasAttachment: Boolean(parsedEmail.hasAttachment),
    spreadCount: parsedEmail.spreadCount ?? 1,
    studentReportCount: parsedEmail.studentReportCount ?? 0,
    verifiedSchoolAccount: Boolean(parsedEmail.verifiedSchoolAccount),
  };
}

function needsAlertPath(
  score,
  lookalikeDetected,
  trustReviewNeeded,
  dangerousDomainDetected
) {
  if (score >= 5) return true;
  return lookalikeDetected || trustReviewNeeded || dangerousDomainDetected;
}

function resolveAlertDedupeKey(alert) {
  if (alert?.emailDedupeKey) return alert.emailDedupeKey;
  return buildEmailDedupeKey(alert?.email ?? alert) || "";
}

/**
 * Skip duplicate records when the same message was already scanned.
 * Resolved and Safe auto-cleared records are ignored so a re-scan can create a new record.
 * @param {object[]} existingAlerts
 * @param {{ emailDedupeKey?: string, email?: object, sender?: string, subject?: string }} candidate
 */
export function isDuplicateAlert(existingAlerts, candidate) {
  const candidateKey = resolveAlertDedupeKey(candidate);

  if (candidateKey) {
    return safeArray(existingAlerts).some((alert) => {
      if (isResolvedAlert(alert) || isSafeRecord(alert)) return false;
      return resolveAlertDedupeKey(alert) === candidateKey;
    });
  }

  return safeArray(existingAlerts).some((alert) => {
    if (isResolvedAlert(alert) || isSafeRecord(alert)) return false;
    return (
      alert.sender === candidate.sender &&
      alert.subject === candidate.subject
    );
  });
}

/**
 * @param {object|null|undefined} parsedEmail
 * @param {object|null|undefined} scoreResult
 * @param {object|null|undefined} actionPlan
 * @param {object|null|undefined} trustDecayResult
 * @param {object|null|undefined} lookalikeResult
 * @param {ReturnType<getDefaultSiteLists>} [siteLists]
 * @param {{ scenarioId?: string|null, email?: object|null, scanSnapshot?: object|null }} [meta]
 * @returns {object|null}
 */
export function createDashboardRecordFromScan(
  parsedEmail,
  scoreResult,
  actionPlan,
  trustDecayResult,
  lookalikeResult,
  siteLists,
  meta = {}
) {
  if (!parsedEmail || !scoreResult) return null;

  const score = Math.min(10, Math.max(0, Math.round(Number(scoreResult.score) || 0)));
  const lookalikeDetected = Boolean(lookalikeResult?.hasLookalikes);
  const trustReviewNeeded = Boolean(
    trustDecayResult?.reviewNeeded || trustDecayResult?.trustReduced
  );
  const dangerousDomainDetected = detectDangerousDomain(parsedEmail, siteLists);
  const sender = safeString(parsedEmail.sender).trim() || "(unknown sender)";
  const subject = safeString(parsedEmail.subject).trim() || "(no subject)";
  const senderDomain =
    safeString(parsedEmail.senderDomain).trim() || "unknown";
  const userRiskBand =
    safeString(scoreResult.riskLevel).trim() || getRiskBand(score).label;
  const scanSummary = buildScanSummary(parsedEmail, scoreResult);
  const scannedAtMs = Date.now();
  const linkLockMinScore = getAppSettings().linkLockMinScore;
  const emailDedupeKey = buildEmailDedupeKey(meta.email ?? parsedEmail);
  const base = {
    id: `alert-${scannedAtMs}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(scannedAtMs).toISOString(),
    expiresAt: getDefaultAlertExpiresAt(scannedAtMs, false),
    keptForReference: false,
    emailDedupeKey: emailDedupeKey || undefined,
    score,
    riskLevel: userRiskBand,
    sender,
    senderDomain,
    subject,
    linkDomains: collectLinkDomains(parsedEmail),
    scanSummary,
    scanInput: buildScanInputSnapshot(parsedEmail),
    scanSnapshot: meta.scanSnapshot ?? null,
    email: meta.email ?? null,
    scenarioId: meta.scenarioId ?? null,
  };

  if (
    !needsAlertPath(
      score,
      lookalikeDetected,
      trustReviewNeeded,
      dangerousDomainDetected
    )
  ) {
    return {
      ...base,
      alertType: "Routine Mail — No Action",
      priority: "none",
      mainReasons: buildSafeMainReasons(scoreResult),
      actionSummary: buildActionSummary(actionPlan, scoreResult),
      status: ALERT_STATUS.SAFE,
      flags: {
        cleared: true,
        dashboardAlert: false,
        urgentPopup: false,
        lookalikeDetected: false,
        trustReviewNeeded: false,
        dangerousDomainDetected: false,
      },
    };
  }

  const band =
    score >= 5
      ? scoreBandConfig(score)
      : {
          priority: lowScoreAlertPriority(dangerousDomainDetected),
          alertType: lowScoreAlertType(
            lookalikeDetected,
            trustReviewNeeded,
            dangerousDomainDetected
          ),
        };

  return {
    ...base,
    alertType: band.alertType,
    priority: band.priority,
    mainReasons: buildMainReasons({
      lookalikeDetected,
      trustReviewNeeded,
      dangerousDomainDetected,
      scoreResult,
    }),
    actionSummary: buildActionSummary(actionPlan, scoreResult),
    status: ALERT_STATUS.OPEN,
    flags: {
      cleared: false,
      dashboardAlert: score >= 5 && score <= 7,
      urgentPopup: score >= 8,
      linksLocked: score >= linkLockMinScore,
      lookalikeDetected,
      trustReviewNeeded,
      dangerousDomainDetected,
    },
  };
}

function resolveStatusAfterRescan(existingRecord, freshRecord) {
  if (!existingRecord || !freshRecord) return freshRecord?.status ?? ALERT_STATUS.OPEN;

  if (isResolvedAlert(existingRecord)) {
    return ALERT_STATUS.UNDER_REVIEW;
  }

  if (!isSafeRecord(freshRecord)) {
    if (existingRecord.status === ALERT_STATUS.UNDER_REVIEW) {
      return ALERT_STATUS.UNDER_REVIEW;
    }
    return ALERT_STATUS.OPEN;
  }

  return ALERT_STATUS.UNDER_REVIEW;
}

/**
 * Re-score an existing dashboard row after inputs change (e.g. student reports).
 */
export function applyDashboardRecordRescan(
  existingRecord,
  {
    parsed,
    scoreResult,
    actionPlan,
    trustDecay,
    lookalikeResult,
    scanSnapshot,
    siteLists,
    email = null,
    scenarioId = null,
    reporterName = null,
  }
) {
  if (!existingRecord) return null;

  const fresh = createDashboardRecordFromScan(
    parsed,
    scoreResult,
    actionPlan,
    trustDecay,
    lookalikeResult,
    siteLists,
    {
      email: email ?? existingRecord.email ?? null,
      scenarioId: scenarioId ?? existingRecord.scenarioId ?? null,
      scanSnapshot,
    }
  );

  if (!fresh) return null;

  const status = resolveStatusAfterRescan(existingRecord, fresh);
  const userReports = [
    ...(Array.isArray(existingRecord.userReports) ? existingRecord.userReports : []),
    {
      at: new Date().toISOString(),
      reporter: reporterName ?? "User",
    },
  ];

  return {
    ...fresh,
    id: existingRecord.id,
    timestamp: existingRecord.timestamp,
    email: existingRecord.email ?? email ?? fresh.email,
    status,
    resolvedAt:
      status === ALERT_STATUS.RESOLVED ? existingRecord.resolvedAt : undefined,
    userReports,
    lastReportedAt: userReports[userReports.length - 1]?.at ?? null,
    flags: {
      ...fresh.flags,
      userReported: true,
    },
  };
}

export function getStudentReportCount(record) {
  return record?.scanInput?.studentReportCount ?? 0;
}

/** @deprecated Use createDashboardRecordFromScan */
export function createAlertFromScan(
  parsedEmail,
  scoreResult,
  actionPlan,
  trustDecayResult,
  lookalikeResult,
  siteLists,
  meta
) {
  return createDashboardRecordFromScan(
    parsedEmail,
    scoreResult,
    actionPlan,
    trustDecayResult,
    lookalikeResult,
    siteLists,
    meta
  );
}

export function getAlertNoticeMessage(alert) {
  if (!alert) return "No alert record created for this scan.";

  if (isSafeRecord(alert)) {
    return `Routine mail auto-cleared — see Safe / Cleared if needed.`;
  }

  if (alert.flags?.urgentPopup) {
    return `Urgent IT alert simulation added to Alerts tab: ${alert.alertType}.`;
  }

  if (alert.flags?.dashboardAlert) {
    return `Demo alert created: ${alert.alertType}.`;
  }

  return `Demo alert created: ${alert.alertType}.`;
}

export function filterAlerts(alerts, filterId, nowMs = Date.now()) {
  const list = filterAlertsByRetention(safeArray(alerts), nowMs);
  const actionable = activeAlerts(list);

  switch (filterId) {
    case "safe":
      return list.filter((alert) => isSafeRecord(alert));
    case "resolved":
      return list.filter((alert) => isResolvedAlert(alert));
    case "dashboard":
      return actionable.filter(isReviewQueueAlert);
    case "urgent":
      return actionable.filter(isUrgentQueueAlert);
    case "lookalikes":
      return actionable.filter((a) => a.flags?.lookalikeDetected);
    case "trust":
      return actionable.filter((a) => a.flags?.trustReviewNeeded);
    case "dangerous":
      return actionable.filter((a) => a.flags?.dangerousDomainDetected);
    case "open":
      return actionable.filter((a) => a.status === ALERT_STATUS.OPEN);
    case "active":
      return actionable;
    case "all":
    default:
      return list;
  }
}

export function summarizeAlerts(alerts, nowMs = Date.now()) {
  const list = filterAlertsByRetention(safeArray(alerts), nowMs);
  const actionable = activeAlerts(list);
  const resolved = list.filter((alert) => isResolvedAlert(alert));
  const safe = list.filter((alert) => isSafeRecord(alert));

  return {
    total: actionable.length,
    safe: safe.length,
    resolved: resolved.length,
    dashboard: actionable.filter(isReviewQueueAlert).length,
    urgent: actionable.filter(isUrgentQueueAlert).length,
    open: actionable.filter((a) => a.status === ALERT_STATUS.OPEN).length,
    lookalike: actionable.filter((a) => a.flags?.lookalikeDetected).length,
    trustReview: actionable.filter((a) => a.flags?.trustReviewNeeded).length,
  };
}
