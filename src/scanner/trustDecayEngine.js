/**
 * Layer 5 — Trust Decay / Spread Tracking (per-scan, demo only).
 */

import { getDomainCategory } from "./trustedLinksStore.js";
import { getDefaultScoringSettings } from "./scoringSettings.js";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeLinks(parsed) {
  return safeArray(parsed?.links);
}

function normalizeCount(value, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.floor(n));
}

function domainContainsWord(domain, words) {
  const lower = String(domain ?? "").toLowerCase();
  if (!lower || lower === "unknown") return false;
  return words.some((word) => lower.includes(word));
}

const SUSPICIOUS_LINK_WORDS = [
  "claim",
  "verify",
  "login",
  "secure",
  "prize",
  "grant",
  "free",
  "reset",
];

function hasOtherSuspiciousSigns(parsed, links, lists) {
  const urgent = safeArray(parsed?.detectedUrgentPhrases);
  const sensitive = safeArray(parsed?.detectedSensitiveRequests);
  const scam = safeArray(parsed?.detectedKeywords);

  const suspiciousLinks = links.some((link) => {
    const domain = String(link?.domain ?? "").trim();
    if (!domain || domain === "unknown") return false;
    const cat = getDomainCategory(domain, lists);
    return (
      link?.hasUserinfo ||
      cat === "suspicious" ||
      cat === "dangerous" ||
      domainContainsWord(domain, SUSPICIOUS_LINK_WORDS) ||
      link?.isValidUrl === false
    );
  });

  return (
    urgent.length > 0 ||
    sensitive.length > 0 ||
    scam.length > 0 ||
    suspiciousLinks
  );
}

function hasSuspiciousOrDangerousListLinks(links, lists) {
  return links.some((link) => {
    const domain = String(link?.domain ?? "").trim();
    if (!domain || domain === "unknown") return false;
    const cat = getDomainCategory(domain, lists);
    return cat === "suspicious" || cat === "dangerous";
  });
}

function isSenderTrusted(parsed, lists) {
  if (parsed?.verifiedSchoolAccount) return true;
  const domain = String(parsed?.senderDomain ?? "").trim();
  if (!domain || domain === "unknown") return false;
  return getDomainCategory(domain, lists) === "trusted";
}

function getTrustedLinkDomains(links, lists) {
  const domains = new Set();
  for (const link of links) {
    const domain = String(link?.domain ?? "").trim();
    if (!domain || domain === "unknown") continue;
    if (link?.hasUserinfo) continue;
    if (getDomainCategory(domain, lists) === "trusted") {
      domains.add(domain);
    }
  }
  return [...domains];
}

function addReason(reasons, label, points, detail) {
  if (points === 0) return;
  reasons.push({ label, points, detail });
}

function pickDecayLevel({ reviewNeeded, trustReduced, watch }) {
  if (reviewNeeded) return "Review needed";
  if (trustReduced) return "Trust reduced";
  if (watch) return "Watch";
  return "Normal behavior";
}

/**
 * @param {object} parsedEmail
 * @param {{ trustedSites?: string[], suspiciousSites?: string[], dangerousSites?: string[] }} siteLists
 * @param {ReturnType<getDefaultScoringSettings>} [scoringSettings]
 */
export function applyTrustDecay(parsedEmail, siteLists, scoringSettings) {
  const settings = scoringSettings ?? getDefaultScoringSettings();
  if (!parsedEmail || typeof parsedEmail !== "object") {
    return emptyTrustDecay();
  }

  const links = safeLinks(parsedEmail);
  const spread = normalizeCount(parsedEmail.spreadCount, 1);
  const reports = normalizeCount(parsedEmail.studentReportCount, 0);
  const suspiciousSigns = hasOtherSuspiciousSigns(parsedEmail, links, siteLists);

  /** @type {{ label: string, points: number, detail: string }[]} */
  const reasons = [];
  /** @type {{ domain: string, originalCategory: string, adjustedTrust: string, reason: string }[]} */
  const affectedDomains = [];

  let decayPoints = 0;
  let senderTrustRevoke = 0;
  let linkTrustRevoke = 0;
  let watch = false;
  let trustReduced = false;
  let reviewNeeded = false;

  const highSpread = spread >= settings.thresholds.highSpreadStart;

  if (spread > settings.thresholds.extremeSpreadStart) {
    addReason(
      reasons,
      "Extreme spread (trust decay)",
      settings.spread.spreadOver75,
      `Simulated spread count is ${spread}, far above normal circulation.`
    );
    decayPoints += settings.spread.spreadOver75;
  } else if (spread >= settings.thresholds.veryHighSpreadStart) {
    addReason(
      reasons,
      "Very high spread (trust decay)",
      settings.spread.spread31to75,
      `Simulated spread count is ${spread}, suggesting unusual forwarding.`
    );
    decayPoints += settings.spread.spread31to75;
  } else if (spread >= settings.thresholds.highSpreadStart) {
    addReason(
      reasons,
      "High spread (trust decay)",
      settings.spread.spread11to30,
      `Simulated spread count is ${spread}, above typical single-recipient mail.`
    );
    decayPoints += settings.spread.spread11to30;
  } else if (spread >= 11 && suspiciousSigns) {
    watch = true;
    addReason(
      reasons,
      "Spread watch flag",
      settings.spread.spread11to30,
      `Spread count ${spread} with other suspicious signals — monitoring recommended.`
    );
    decayPoints += settings.spread.spread11to30;
  } else if (spread >= 11) {
    watch = true;
  }

  if (reports >= settings.thresholds.reportsUrgentStart) {
    reviewNeeded = true;
    addReason(
      reasons,
      "Many student reports",
      settings.spread.reports5plus,
      `${reports} simulated student reports — review needed before trusting content.`
    );
    decayPoints += settings.spread.reports5plus;
  } else if (reports >= settings.thresholds.reportsReviewStart) {
    addReason(
      reasons,
      "Multiple student reports",
      settings.spread.reports2to4,
      `${reports} simulated student reports raised concern for this message.`
    );
    decayPoints += settings.spread.reports2to4;
  } else if (reports >= 1 && suspiciousSigns) {
    addReason(
      reasons,
      "Student report with suspicious signs",
      settings.spread.reports1WithContext,
      "One simulated student report combined with other suspicious signals."
    );
    decayPoints += settings.spread.reports1WithContext;
  }

  const trustedLinkDomains = getTrustedLinkDomains(links, siteLists);
  if (trustedLinkDomains.length > 0) {
    let linkAdjusted = "Stable";
    let linkReason = "Trusted link bonus applies for normal behavior.";

    if (highSpread && reports >= settings.thresholds.reportsReviewStart) {
      linkTrustRevoke = 2;
      linkAdjusted = "Review needed";
      linkReason =
        "High spread and multiple reports — trusted link bonus removed for this scan.";
      reviewNeeded = true;
      trustReduced = true;
      // TODO: trust-revoke composite points remain fixed until a dedicated settings group exists.
      addReason(
        reasons,
        "Trusted link trust decay",
        4,
        `Trusted link(s) lost their bonus (+2) and gained review risk (+2) due to spread ${spread} and ${reports} reports.`
      );
    } else if (reports >= settings.thresholds.reportsReviewStart) {
      linkTrustRevoke = 2;
      linkAdjusted = "Trust reduced";
      linkReason = "Multiple student reports weakened trust for trusted link(s).";
      trustReduced = true;
      addReason(
        reasons,
        "Trusted link trust decay",
        2,
        "Multiple student reports canceled the trusted link bonus for this scan."
      );
    } else if (highSpread) {
      linkTrustRevoke = 1;
      linkAdjusted = "Trust reduced";
      linkReason = "High spread reduced the trusted link bonus for this scan.";
      trustReduced = true;
      addReason(
        reasons,
        "Trusted link trust decay",
        2,
        "High spread reduced the trusted link bonus by 1 and added +1 review risk."
      );
    }

    if (linkAdjusted !== "Stable") {
      for (const domain of trustedLinkDomains) {
        affectedDomains.push({
          domain,
          originalCategory: "trusted",
          adjustedTrust: linkAdjusted,
          reason: linkReason,
        });
      }
    }
  }

  if (isSenderTrusted(parsedEmail, siteLists)) {
    const senderDomain = parsedEmail.verifiedSchoolAccount
      ? String(parsedEmail.sender ?? parsedEmail.senderDomain ?? "verified-school-account")
      : String(parsedEmail.senderDomain ?? "");
    const sensitive = safeArray(parsedEmail.detectedSensitiveRequests).length > 0;
    const badLinks = hasSuspiciousOrDangerousListLinks(links, siteLists);

    let senderAdjusted = "Stable";
    let senderReason = "Trusted sender bonus applies for normal behavior.";

    if (sensitive) {
      senderTrustRevoke = 2;
      senderAdjusted = "Trust reduced";
      senderReason =
        "Sensitive information requests weakened trusted sender bonus for this scan.";
      trustReduced = true;
      addReason(
        reasons,
        "Trusted sender trust decay",
        2,
        "Trusted sender asked for sensitive details — trust bonus reduced for this scan."
      );
    } else if (badLinks) {
      senderTrustRevoke = 2;
      senderAdjusted = "Trust reduced";
      senderReason =
        "Suspicious or dangerous links weakened trusted sender bonus for this scan.";
      trustReduced = true;
      addReason(
        reasons,
        "Trusted sender trust decay",
        2,
        "Trusted sender included suspicious/dangerous links — trust bonus reduced."
      );
    } else if (highSpread && reports >= 1) {
      senderTrustRevoke = 1;
      senderAdjusted = "Review needed";
      senderReason =
        "High spread with reports — trusted sender marked for review this scan.";
      reviewNeeded = true;
      trustReduced = true;
      addReason(
        reasons,
        "Trusted sender under review",
        2,
        "Trusted sender lost partial bonus (+1) and gained review risk (+1) due to spread and reports."
      );
    }

    if (senderAdjusted !== "Stable") {
      affectedDomains.push({
        domain: senderDomain,
        originalCategory: parsedEmail.verifiedSchoolAccount
          ? "verified-school"
          : "trusted",
        adjustedTrust: senderAdjusted,
        reason: senderReason,
      });
    }
  }

  const totalScoreAdjustment = reasons.reduce((sum, r) => sum + r.points, 0);
  const decayLevel = pickDecayLevel({ reviewNeeded, trustReduced, watch });
  const trustDecayApplied =
    totalScoreAdjustment > 0 || trustReduced || reviewNeeded || watch;

  return {
    trustDecayApplied,
    decayLevel,
    decayPoints: totalScoreAdjustment,
    reasons,
    affectedDomains,
    reviewNeeded,
    watch,
    trustReduced,
    senderTrustRevoke,
    linkTrustRevoke,
    spreadCount: spread,
    studentReportCount: reports,
    verifiedSchoolAccount: Boolean(parsedEmail.verifiedSchoolAccount),
  };
}

export function emptyTrustDecay() {
  return {
    trustDecayApplied: false,
    decayLevel: "Normal behavior",
    decayPoints: 0,
    reasons: [],
    affectedDomains: [],
    reviewNeeded: false,
    watch: false,
    trustReduced: false,
    senderTrustRevoke: 0,
    linkTrustRevoke: 0,
    spreadCount: 1,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  };
}
