/**
 * Presentation-friendly scan result summaries (demo UI helper).
 * Does not change scoring — only interprets scoreEmail output for display.
 */

import { APP_NAME } from "../appBrand.js";

/** @typedef {{ key: string, label: string, tone: string, hint: string }} RiskBand */

const REASON_DISPLAY_LABELS = {
  "Lookalike domain detected": "Link uses a lookalike domain",
  "Urgent language": "Message creates urgency",
  "Multiple urgent phrases": "Message creates strong urgency",
  "Sensitive information request": "Login or sensitive information requested",
  "Scam keywords": "Common scam wording detected",
  "Many scam keywords": "Multiple scam phrases detected",
  "Suspicious sender domain": "Sender does not match a trusted organization",
  "Suspicious sender domain (list)": "Sender domain is on the suspicious list",
  "Unknown sender domain": "Sender domain is unknown",
  "Suspicious link domain": "Link domain looks risky",
  "Suspicious link domain (list)": "Link domain is on the suspicious list",
  "Known dangerous link": "Link points to a known dangerous domain",
  "Dangerous sender domain": "Sender domain is on the dangerous list",
  "Insecure HTTP link": "Link uses insecure HTTP",
  "Single link with other suspicious signs": "Link appears alongside other warning signs",
  "Multiple links": "Multiple links in the message",
  "Malformed link": "Malformed or unparsable link detected",
  "Attachment present": "Attachment included (simulated)",
  "Extreme spread (trust decay)": "Extreme message spread (trust decay)",
  "Very high spread (trust decay)": "Very high message spread (trust decay)",
  "High spread (trust decay)": "High message spread (trust decay)",
  "Spread watch flag": "Spread watch flag (monitoring)",
  "Many student reports": "Many student reports",
  "Multiple student reports": "Multiple student reports",
  "Student report with suspicious signs": "Student report with suspicious signs",
  "Trusted link trust decay": "Trusted link trust reduced",
  "Trusted sender trust decay": "Trusted sender trust reduced",
  "Trusted sender under review": "Trusted sender under review",
  "Trusted sender domain": "Sender domain is on the trusted school/site list",
  "Trusted link domain": "Link domain is on the trusted school/site list",
  "Verified school sender": "Sender marked as verified school account (simulated)",
};

const CREDIT_DISPLAY_LABELS = {
  "Trusted sender domain": "Sender domain is on the trusted school/site list",
  "Trusted link domain": "Link domain is on the trusted school/site list",
  "Verified school sender": "Sender marked as a verified school account",
};

/**
 * @param {number} score
 * @returns {RiskBand}
 */
export function getRiskBand(score) {
  const value = Number(score);
  const safeScore = Number.isFinite(value) ? Math.min(10, Math.max(0, Math.round(value))) : 0;

  if (safeScore <= 3) {
    return {
      key: "safe",
      label: "Safe",
      tone: "low",
      hint: "0–3 = Safe",
    };
  }

  if (safeScore <= 7) {
    return {
      key: "suspicious",
      label: "Suspicious",
      tone: "moderate",
      hint: "4–7 = Suspicious",
    };
  }

  return {
    key: "dangerous",
    label: "Dangerous",
    tone: "critical",
    hint: "8–10 = Dangerous",
  };
}

export function getScoreBandLegend() {
  return "0–3 Safe · 4–7 Suspicious · 8–10 Dangerous";
}

/**
 * Fine-grained risk levels and recommended actions live here alongside
 * `getRiskBand` so all score → label / action mappings share one file.
 */

const GRANULAR_RISK_LEVELS = [
  { max: 2, label: "Low Risk" },
  { max: 4, label: "Caution" },
  { max: 5, label: "Moderate Warning" },
  { max: 6, label: "Strong Warning" },
  { max: 7, label: "High Risk" },
  { max: 8, label: "Very High Risk" },
  { max: 9, label: "Critical Risk" },
  { max: 10, label: "Confirmed/Near-Confirmed Threat" },
];

const RECOMMENDED_ACTIONS = [
  { max: 2, action: "Allow normally." },
  { max: 4, action: "Show a small caution notice." },
  { max: 5, action: "Show warning banner and add dashboard note later." },
  {
    max: 6,
    action: "Show strong warning and require extra caution before links/attachments.",
  },
  {
    max: 7,
    action: "Disable risky links/attachments by default in a later layer.",
  },
  {
    max: 8,
    action: "Simulate quarantine and urgent IT/admin alert in a later layer.",
  },
  {
    max: 9,
    action: "Simulate likely phishing response and urgent IT/admin alert in a later layer.",
  },
  {
    max: 10,
    action: "Simulate confirmed threat response and incident entry in a later layer.",
  },
];

/**
 * @param {number} score
 */
export function getGranularRiskLevel(score) {
  return (
    GRANULAR_RISK_LEVELS.find((level) => score <= level.max)?.label ?? "Low Risk"
  );
}

/**
 * @param {number} score
 */
export function getRecommendedAction(score) {
  return (
    RECOMMENDED_ACTIONS.find((entry) => score <= entry.max)?.action ??
    "Allow normally."
  );
}

/**
 * Short response guidance paired with the risk band in action-plan UI.
 * @param {number} score
 */
export function getActionResponseHint(score) {
  const band = getRiskBand(score);

  if (band.key === "safe") {
    return score <= 2
      ? "Allow with normal caution"
      : "Review sender if anything feels off";
  }

  if (band.key === "suspicious") {
    if (score <= 5) return "Verify before clicking links";
    if (score <= 6) return "Extra caution before links or attachments";
    return "Do not click links or attachments";
  }

  if (score <= 8) return "Quarantine and report to IT";
  if (score <= 9) return "Likely phishing — escalate immediately";
  return "Confirmed threat response";
}

/**
 * @param {number} score
 */
export function getActionBadgeLabel(score) {
  const band = getRiskBand(score);
  return `${band.label} — ${getActionResponseHint(score)}`;
}

/**
 * @param {string} label
 */
export function formatReasonLabel(label) {
  const key = String(label ?? "").trim();
  return REASON_DISPLAY_LABELS[key] ?? (key || "Risk signal detected");
}

/**
 * @param {{ label?: string, points?: number, detail?: string }[]} reasons
 */
export function splitReasons(reasons) {
  const safeReasons = Array.isArray(reasons) ? reasons : [];
  const increases = [];
  const credits = [];

  for (const reason of safeReasons) {
    const points = Number(reason?.points ?? 0);
    if (points > 0) {
      increases.push(reason);
    } else if (points < 0) {
      credits.push(reason);
    }
  }

  return { increases, credits };
}

/**
 * @param {object|null|undefined} parsed
 * @param {{ reasons?: { label?: string, points?: number, detail?: string }[] }} scoreResult
 */
export function derivePositiveSigns(parsed, scoreResult) {
  /** @type {{ label: string, detail: string }[]} */
  const signs = [];
  const seen = new Set();

  function addSign(label, detail) {
    if (!label || seen.has(label)) return;
    seen.add(label);
    signs.push({ label, detail });
  }

  const score = Number(scoreResult?.score ?? 0);
  const band = getRiskBand(score);

  // Do not show reassuring credits on Suspicious or Dangerous scans. They can
  // be mathematically real while still distracting from the overall verdict.
  if (band.key !== "safe") {
    return signs;
  }

  const { credits } = splitReasons(scoreResult?.reasons);
  for (const credit of credits) {
    const label =
      CREDIT_DISPLAY_LABELS[credit.label ?? ""] ??
      formatReasonLabel(credit.label ?? "Trusted signal");
    addSign(label, credit.detail ?? "This reduced the overall risk score.");
  }

  if (!parsed || typeof parsed !== "object") {
    return signs;
  }

  const links = Array.isArray(parsed.links) ? parsed.links : [];
  const urgent = Array.isArray(parsed.detectedUrgentPhrases)
    ? parsed.detectedUrgentPhrases
    : [];
  const sensitive = Array.isArray(parsed.detectedSensitiveRequests)
    ? parsed.detectedSensitiveRequests
    : [];
  const scam = Array.isArray(parsed.detectedKeywords) ? parsed.detectedKeywords : [];

  if (links.length === 0) {
    addSign(
      "No links detected",
      "The message body did not include clickable URLs to review."
    );
  }

  if (urgent.length === 0) {
    addSign(
      "No urgent language found",
      "Phrases like “act now” or “account locked” were not detected."
    );
  }

  if (sensitive.length === 0) {
    addSign(
      "No password or payment requests found",
      "The message did not ask for passwords, login codes, or payment details."
    );
  }

  if (scam.length === 0) {
    addSign(
      "No common scam keywords found",
      "Typical scholarship or prize scam wording was not detected."
    );
  }

  if (!parsed.hasAttachment) {
    addSign(
      "No attachment flagged",
      "No attachment was marked for this scan."
    );
  }

  return signs;
}

/**
 * @param {object|null|undefined} parsed
 * @param {{ score?: number, reasons?: { label?: string, points?: number, detail?: string }[] }} scoreResult
 */
export function buildScanSummary(parsed, scoreResult) {
  const score = Number(scoreResult?.score ?? 0);
  const band = getRiskBand(score);
  const { increases } = splitReasons(scoreResult?.reasons);

  if (band.key === "safe") {
    if (increases.length === 0) {
      return "This message looks routine for school email. No major warning signs were detected, but users should still use everyday caution.";
    }
    return "This message looks mostly safe. A few minor signals were noted, but nothing that strongly suggests phishing on its own.";
  }

  const issueLabels = increases
    .slice(0, 3)
    .map((reason) => formatReasonLabel(reason.label ?? "").toLowerCase());

  if (band.key === "dangerous") {
    const issueText =
      issueLabels.length > 0
        ? issueLabels.join(", ")
        : "multiple high-risk warning signs";
    return `This message looks dangerous because ${issueText}. Treat it as a likely phishing attempt and do not click links or share login information.`;
  }

  const issueText =
    issueLabels.length > 0
      ? issueLabels.join(", ")
      : "several warning signs";
  return `This message looks suspicious because ${issueText}. Be careful before opening links, attachments, or replying with personal information.`;
}

/**
 * @param {object|null|undefined} parsed
 * @param {{ score?: number, reasons?: { label?: string, points?: number, detail?: string }[] }} scoreResult
 * @returns {string[]}
 */
export function buildWhyThisMatters(parsed, scoreResult) {
  const { increases } = splitReasons(scoreResult?.reasons);
  const labels = increases.map((reason) => String(reason.label ?? ""));
  /** @type {string[]} */
  const sentences = [];

  if (labels.some((label) => /urgent/i.test(label))) {
    sentences.push(
      "This message may be trying to rush the user into clicking before thinking."
    );
  }

  if (labels.some((label) => /lookalike/i.test(label))) {
    sentences.push(
      "The link looks similar to a trusted company, but the domain is not the real one."
    );
  }

  if (labels.some((label) => /sensitive/i.test(label))) {
    sentences.push(
      "The message asks for sensitive information, which is a common phishing tactic."
    );
  }

  if (
    labels.some((label) =>
      /dangerous|known dangerous/i.test(label)
    )
  ) {
    sentences.push(
      "The message points to a domain flagged as dangerous in this demo environment."
    );
  }

  if (
    labels.some((label) =>
      /trust decay|spread|report|under review/i.test(label)
    )
  ) {
    sentences.push(
      "Even trusted-looking mail can become risky when it spreads fast or gets reported by students."
    );
  }

  if (
    labels.some((label) =>
      /scam|suspicious link|suspicious sender|http|malformed/i.test(label)
    ) &&
    !sentences.length
  ) {
    sentences.push(
      "The sender or links do not look fully trustworthy, which is how many school phishing attempts start."
    );
  }

  const band = getRiskBand(scoreResult?.score ?? 0);
  if (sentences.length === 0) {
    if (band.key === "safe") {
      return [
        "This looks like normal school communication with no strong phishing patterns.",
      ];
    }
    return [
      "Several small warning signs together may still be worth a second look before acting.",
    ];
  }

  return sentences.slice(0, 3);
}

/**
 * @param {"safe" | "suspicious" | "dangerous"} bandKey
 * @returns {string[]}
 */
export function buildWhatToDoNext(bandKey) {
  if (bandKey === "safe") {
    return [
      "Still double-check the sender before replying.",
      "Use everyday caution with unexpected links or attachments.",
    ];
  }

  if (bandKey === "suspicious") {
    return [
      "Do not click the link until you verify the sender another way.",
      "Ask a teacher, parent, or IT staff if you are unsure.",
      "Do not share passwords or personal information by email.",
    ];
  }

  return [
    "Do not click links, download attachments, or enter passwords.",
    "Report the message to IT or a teacher immediately.",
    "Delete or quarantine the message if your school policy allows.",
  ];
}

/**
 * @param {object|null|undefined} parsed
 * @param {{ score?: number, reasons?: { label?: string, points?: number, detail?: string }[] }} scoreResult
 */
export function buildCopyableSummary(parsed, scoreResult) {
  const score = Number(scoreResult?.score ?? 0);
  const band = getRiskBand(score);
  const { increases } = splitReasons(scoreResult?.reasons);
  const bandShort =
    band.key === "safe"
      ? "Safe"
      : band.key === "suspicious"
        ? "Suspicious"
        : "Dangerous";

  const because = increases
    .slice(0, 3)
    .map((reason) => formatReasonLabel(reason.label ?? "").toLowerCase())
    .join(", ");

  if (band.key === "safe" && !because) {
    return `Risk: ${bandShort}, ${score}/10. This message appears routine with no major warning signs detected.`;
  }

  const riskWord =
    band.key === "safe"
      ? "mostly low risk"
      : band.key === "suspicious"
        ? "suspicious"
        : "risky";

  return `Risk: ${bandShort}, ${score}/10. This message is ${riskWord}${because ? ` because ${because}` : ""}.`;
}

/**
 * @param {object|null|undefined} alert
 * @returns {string|null}
 */
export function getSpecialtyAlertExplanation(alert) {
  if (!alert || Number(alert.score) > 4) return null;
  const flags = alert.flags ?? {};
  if (flags.dangerousDomainDetected) {
    return "Alert created despite a Safe band score because a known dangerous domain requires IT review.";
  }
  if (flags.lookalikeDetected && flags.trustReviewNeeded) {
    return "Alert created despite a Safe band score because lookalike domains and trust spread both need IT review.";
  }
  if (flags.lookalikeDetected) {
    return "Alert created despite a Safe band score because a lookalike domain requires IT review.";
  }
  if (flags.trustReviewNeeded) {
    return "Alert created despite a Safe band score because trust spread and reports require IT review.";
  }
  return null;
}

/**
 * @param {object|null|undefined} parsed
 * @param {{ score?: number, reasons?: object[], lookalikeResult?: object, trustDecay?: object }} scoreResult
 * @param {object|null|undefined} actionPlan
 * @param {{ created?: boolean, alert?: object }|null|undefined} alertResult
 */
export function getResultsHighlights(parsed, scoreResult, actionPlan, alertResult) {
  const score = Number(scoreResult?.score ?? 0);
  const band = getRiskBand(score);
  const { increases } = splitReasons(scoreResult?.reasons ?? []);
  const trustDecay = scoreResult?.trustDecay;
  const lookalike = scoreResult?.lookalikeResult;
  const alert = alertResult?.created ? alertResult.alert : null;
  const flags = alert?.flags ?? {};

  const hasLookalike = Boolean(lookalike?.hasLookalikes);
  const hasTrustReview = Boolean(
    trustDecay?.reviewNeeded || trustDecay?.trustReduced || trustDecay?.watch
  );
  const hasDangerousDomain = Boolean(flags.dangerousDomainDetected);
  const hasActionPlan =
    Boolean(actionPlan) &&
    (score >= 5 ||
      alertResult?.created ||
      actionPlan?.dashboardAlert ||
      actionPlan?.urgentPopup);

  return {
    headline: buildScanSummary(parsed, scoreResult),
    topReasons: increases.slice(0, 3),
    remainingReasonCount: Math.max(0, increases.length - 3),
    nextStep: buildWhatToDoNext(band.key)[0] ?? "",
    defaultOpenSections: {
      actionPlan: false,
      domainTrust: false,
    },
    promoteLines: {
      trustDecay: hasTrustReview
        ? "Even trusted links can need review when spread and student reports spike."
        : null,
      lookalike: hasLookalike ? "Fake sites, not just bad words — lookalike detection caught this domain." : null,
      dangerousDomain: hasDangerousDomain
        ? "Blocklist hits alert even at low scores — IT review is still required."
        : null,
      actionPlan:
        hasActionPlan && score >= 5
          ? "Here is what students, teachers, and IT would see in a simulated response."
          : null,
    },
  };
}

/**
 * Principal-friendly staff notice for Suspicious/Dangerous scans.
 * @param {object|null|undefined} parsed
 * @param {{ score?: number, reasons?: object[] }} scoreResult
 * @returns {string|null}
 */
export function buildStaffEmailTemplate(parsed, scoreResult) {
  const band = getRiskBand(scoreResult?.score ?? 0);
  if (band.key === "safe") return null;

  const subjectLine = parsed?.subject
    ? `Security notice: review requested for "${parsed.subject}"`
    : "Security notice: suspicious email flagged for review";

  const summary = buildCopyableSummary(parsed, scoreResult);
  const nextStep = buildWhatToDoNext(band.key)[0] ?? "Verify the sender before acting.";

  return `${subjectLine}

Team,

Our ${APP_NAME} flagged a message for review during a demonstration:

${summary}

Recommended next step: ${nextStep}

This is a local simulation only — no real mail was scanned or blocked.

— IT (demo notice)`;
}
