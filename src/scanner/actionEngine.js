/**
 * Layer 3 — Action Engine (local simulation only)
 * Maps score results to a simulated action plan. No real blocking or IT integration.
 */

import {
  getActionBadgeLabel,
  getRiskBand,
} from "./scanResultSummary.js";

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, Math.round(n)));
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function resolveScore(scoreResult) {
  return clampScore(scoreResult?.score);
}

function subjectHint(parsedEmail) {
  const subject = safeString(parsedEmail?.subject).trim();
  return subject ? `"${subject}"` : "this message";
}

/** Score-band action configuration keyed for lookup in pickBand(). */
const ACTION_BY_SCORE = {
  0: buildBand(0, 2),
  3: buildBand(3, 4),
  5: buildBand(5, 5),
  6: buildBand(6, 6),
  7: buildBand(7, 7),
  8: buildBand(8, 8),
  9: buildBand(9, 9),
  10: buildBand(10, 10),
};

function buildBand(minScore, maxScore) {
  const configs = {
    0: {
      actionLevel: "Allow",
      actionType: "allow",
      dashboardAlert: false,
      urgentPopup: false,
      restrictLinks: false,
      restrictAttachments: false,
      quarantine: false,
      incidentRequired: false,
      badgeLabel: "Allow — Low Risk",
      studentMessage:
        "This email appears low risk. You may read it normally, but always stay alert for unexpected requests.",
      teacherMessage:
        "No special handling needed. Routine school communication patterns detected.",
      adminMessage: "",
      nextSteps: [
        "Proceed with normal reading and reply habits.",
        "Use everyday caution with links and attachments.",
        "Report anything that feels off to IT or a teacher.",
      ],
    },
    3: {
      actionLevel: "Caution",
      actionType: "caution",
      dashboardAlert: false,
      urgentPopup: false,
      restrictLinks: false,
      restrictAttachments: false,
      quarantine: false,
      incidentRequired: false,
      badgeLabel: "Caution — Review Sender",
      studentMessage:
        "This email deserves a small caution notice. Double-check the sender and any links before you click.",
      teacherMessage:
        "Ask students to verify the sender if anything looks unusual before acting on the message.",
      adminMessage: "",
      nextSteps: [
        "Confirm the sender address matches someone you expect.",
        "Hover over links before clicking and look for mismatched domains.",
        "Do not share passwords or personal information by email.",
      ],
    },
    5: {
      actionLevel: "Moderate Warning",
      actionType: "moderate_warning",
      dashboardAlert: true,
      urgentPopup: false,
      restrictLinks: false,
      restrictAttachments: false,
      quarantine: false,
      incidentRequired: false,
      badgeLabel: "Moderate Warning",
      studentMessage:
        "A warning banner would appear for this email. Review the sender and links carefully before clicking anything.",
      teacherMessage:
        "Consider pausing classroom action on this message until the sender is verified.",
      adminMessage:
        "Low-priority review note: flagged message for review based on moderate risk score.",
      nextSteps: [
        "Read the score breakdown and note why points were added.",
        "Verify the sender through a separate trusted channel if unsure.",
        "Avoid clicking links until the message is confirmed legitimate.",
        "IT would see a low-priority review note (simulated).",
      ],
    },
    6: {
      actionLevel: "Strong Warning",
      actionType: "strong_warning",
      dashboardAlert: true,
      urgentPopup: false,
      restrictLinks: false,
      restrictAttachments: false,
      quarantine: false,
      incidentRequired: false,
      badgeLabel: "Strong Warning",
      studentMessage:
        "Strong warning: verify the sender before opening links or attachments. You would be asked to confirm before opening each one.",
      teacherMessage:
        "Do not ask students to click links or open attachments until the sender is verified.",
      adminMessage:
        "Medium-priority review alert: multiple suspicious signals detected. Review recommended.",
      nextSteps: [
        "Stop and verify the sender with a teacher, staff member, or IT.",
        "Confirm before opening any link or attachment.",
        "Do not reply with passwords, codes, or personal information.",
        "IT would receive a medium-priority review alert (simulated).",
      ],
    },
    7: {
      actionLevel: "High Risk",
      actionType: "high_risk",
      dashboardAlert: true,
      urgentPopup: false,
      restrictLinks: true,
      restrictAttachments: true,
      quarantine: false,
      incidentRequired: false,
      badgeLabel: "High Risk",
      studentMessage:
        "This email is high risk. In a real deployment, risky links and attachments would be disabled by default until reviewed.",
      teacherMessage:
        "Treat this message as suspicious. Do not distribute links or attachments from it.",
      adminMessage:
        "High-priority review alert: risky links and attachments would be disabled by default.",
      nextSteps: [
        "Do not click links or open attachments from this message.",
        "Report the email to IT or a trusted staff member.",
        "Wait for IT review before taking further action.",
        "IT would receive a high-priority review alert (simulated).",
      ],
    },
    8: {
      actionLevel: "Very High Risk",
      actionType: "very_high_risk",
      dashboardAlert: true,
      urgentPopup: true,
      restrictLinks: true,
      restrictAttachments: true,
      quarantine: true,
      incidentRequired: true,
      badgeLabel: "Very High Risk",
      studentMessage:
        "This email would be quarantined or heavily restricted in a real system. Do not interact with links or attachments.",
      teacherMessage:
        "Do not forward or act on this message. Escalate to IT immediately in a real environment.",
      adminMessage:
        "Active IT/admin alert simulation: message would be quarantined and flagged for urgent review.",
      nextSteps: [
        "Do not open links or attachments.",
        "Do not reply with personal or account information.",
        "Report to IT immediately (simulated alert below).",
        "Message would be moved to quarantine (simulated).",
        "Incident review would be opened (simulated).",
      ],
    },
    9: {
      actionLevel: "Critical Risk",
      actionType: "critical_risk",
      dashboardAlert: true,
      urgentPopup: true,
      restrictLinks: true,
      restrictAttachments: true,
      quarantine: true,
      incidentRequired: true,
      badgeLabel: "Critical Risk",
      studentMessage:
        "Likely phishing or scam. Links and attachments would be blocked. Do not respond or share information.",
      teacherMessage:
        "Treat as likely phishing. Do not use content from this message in class until IT clears it.",
      adminMessage:
        "Urgent IT/admin popup and incident entry simulation: likely phishing response required.",
      nextSteps: [
        "Do not click links or open attachments.",
        "Do not reply or provide credentials.",
        "Report to IT immediately (simulated urgent alert below).",
        "Incident entry would be created (simulated).",
        "Related messages may be flagged in a future layer (simulated).",
      ],
    },
    10: {
      actionLevel: "Confirmed/Near-Confirmed Threat",
      actionType: "confirmed_threat",
      dashboardAlert: true,
      urgentPopup: true,
      restrictLinks: true,
      restrictAttachments: true,
      quarantine: true,
      incidentRequired: true,
      badgeLabel: "Confirmed/Near-Confirmed Threat",
      studentMessage:
        "Confirmed or near-confirmed threat simulation. This message would be blocked and escalated immediately.",
      teacherMessage:
        "Do not use or share this message. Follow district incident procedures in a real deployment.",
      adminMessage:
        "Immediate IT/admin alert: incident entry required. Related emails would be flagged for review in a later layer.",
      nextSteps: [
        "Do not interact with this message.",
        "Report to IT immediately (simulated alerts below).",
        "Incident entry and threat response workflow would start (simulated).",
        "Related emails from the same campaign would be flagged (future layer).",
        "Preserve the message for IT review only in a real system.",
      ],
    },
  };

  const key = maxScore <= 2 ? 0 : maxScore <= 4 ? 3 : maxScore;
  return { ...configs[key], scoreRange: [minScore, maxScore] };
}

function pickBand(score) {
  if (score <= 2) return ACTION_BY_SCORE[0];
  if (score <= 4) return ACTION_BY_SCORE[3];
  if (score <= 5) return ACTION_BY_SCORE[5];
  if (score <= 6) return ACTION_BY_SCORE[6];
  if (score <= 7) return ACTION_BY_SCORE[7];
  if (score <= 8) return ACTION_BY_SCORE[8];
  if (score <= 9) return ACTION_BY_SCORE[9];
  return ACTION_BY_SCORE[10];
}

function dashboardPriority(score) {
  if (score <= 5) return "low";
  if (score <= 7) return "medium";
  if (score <= 8) return "high";
  return "critical";
}

/**
 * @param {object|null|undefined} scoreResult
 * @param {object|null|undefined} parsedEmail
 */
export function getActionPlan(scoreResult, parsedEmail) {
  const score = resolveScore(scoreResult);
  const band = pickBand(score);
  const riskBand = getRiskBand(score);
  const hint = subjectHint(parsedEmail);

  return {
    score,
    riskBand: riskBand.label,
    actionLevel: riskBand.label,
    badgeLabel: getActionBadgeLabel(score),
    studentMessage: band.studentMessage,
    teacherMessage: band.teacherMessage,
    adminMessage: band.adminMessage,
    actionType: band.actionType,
    dashboardAlert: band.dashboardAlert,
    urgentPopup: band.urgentPopup,
    restrictLinks: band.restrictLinks,
    restrictAttachments: band.restrictAttachments,
    quarantine: band.quarantine,
    incidentRequired: band.incidentRequired,
    nextSteps: [...band.nextSteps],
    /** Score-specific engine label — debug / raw JSON only. */
    granularActionLevel: band.actionLevel,
    /** Extra context for simulation cards (not required by spec, safe for UI). */
    simulationMeta: {
      subjectHint: hint,
      dashboardPriority: dashboardPriority(score),
      isSimulation: true,
    },
  };
}

/**
 * Safe default when inputs are missing.
 */
export function getDefaultActionPlan() {
  return getActionPlan({ score: 0 }, null);
}
