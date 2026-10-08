/**
 * Layer 2 — Basic Risk Scoring Engine
 * Consumes parsed email output from Layer 1. Pure functions, no network.
 * Layer 4: optional site list reputation adjustments.
 * Layer 8: configurable scoring weights via scoringSettings.
 */

import {
  getDefaultSiteLists,
  getDomainCategory,
} from "./trustedLinksStore.js";
import { applyTrustDecay, emptyTrustDecay } from "./trustDecayEngine.js";
import {
  analyzeDomainLookalikes,
  dedupeLookalikeMatches,
  emptyLookalikeResult,
} from "./lookalikeDomainDetector.js";
import {
  getDefaultScoringSettings,
  LOOKALIKE_SEVERITY_POINTS,
} from "./scoringSettings.js";
import { getRootDomain, normalizeDomain } from "./domainUtils.js";
import { getRiskBand, getGranularRiskLevel, getRecommendedAction } from "./scanResultSummary.js";

const SUSPICIOUS_SENDER_DOMAIN_WORDS = [
  "support",
  "claim",
  "verify",
  "login",
  "grant",
  "prize",
  "secure",
];

const SUSPICIOUS_LINK_DOMAIN_WORDS = [
  "claim",
  "verify",
  "login",
  "secure",
  "prize",
  "grant",
  "free",
  "reset",
];

function clampScore(value) {
  return Math.min(10, Math.max(0, Math.round(value)));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeLinks(parsed) {
  return safeArray(parsed?.links);
}

function domainContainsWord(domain, words) {
  const lower = String(domain ?? "").toLowerCase();
  if (!lower || lower === "unknown") return false;
  // Match whole labels, not substrings: "supporting-docs.example.com" must not
  // trip "support", "insecure-login-page.com" must not trip "secure", etc.
  const tokens = lower.split(/[.\-_]+/).filter(Boolean);
  return words.some((word) => tokens.includes(word));
}

function isSenderDomainMissing(senderDomain) {
  const domain = String(senderDomain ?? "").trim().toLowerCase();
  return !domain || domain === "unknown";
}

function isSuspiciousSenderDomain(senderDomain) {
  return domainContainsWord(senderDomain, SUSPICIOUS_SENDER_DOMAIN_WORDS);
}

function hasSuspiciousLinkDomain(links) {
  return links.some((link) =>
    domainContainsWord(link?.domain, SUSPICIOUS_LINK_DOMAIN_WORDS)
  );
}

function hasHttpLink(links) {
  return links.some(
    (link) =>
      link?.isValidUrl && String(link?.protocol ?? "").toLowerCase() === "http"
  );
}

function hasInvalidLink(links) {
  return links.some((link) => link && link.isValidUrl === false);
}

function domainsDiffer(left, right) {
  const leftRoot = getRootDomain(left);
  const rightRoot = getRootDomain(right);
  return Boolean(leftRoot && rightRoot && leftRoot !== rightRoot);
}

function hasExternalAuthenticationDestination(authenticationLinkDomains, senderDomain) {
  return authenticationLinkDomains.some((domain) => domainsDiffer(domain, senderDomain));
}

function hasMisleadingUserinfoLink(links) {
  return links.some((link) => link?.isValidUrl && link?.hasUserinfo);
}

function isScholarshipScamPattern(parsedEmail) {
  const text = `${parsedEmail?.subject ?? ""}\n${parsedEmail?.body ?? ""}`.toLowerCase();
  if (!text.includes("scholarship")) return false;

  return (
    /\bfree\b/.test(text) ||
    /\bclaim\b/.test(text) ||
    /\bhurry\b/.test(text) ||
    /\bsecure (website|site)\b/.test(text) ||
    /\bact now\b/.test(text) ||
    /\blimited time\b/.test(text)
  );
}

function linkReputationDomain(link) {
  return String(link?.domain ?? "").trim();
}

function addReason(reasons, label, points, detail) {
  if (points === 0) return;
  reasons.push({ label, points, detail });
}

function applySenderReputation(reasons, senderDomain, lists, settings) {
  if (isSenderDomainMissing(senderDomain)) return 0;

  const category = getDomainCategory(senderDomain, lists);
  let delta = 0;

  if (category === "trusted") {
    addReason(
      reasons,
      "Trusted sender domain",
      settings.sender.trustedSenderBonus,
      "Sender domain is on the trusted school/site list."
    );
    delta += settings.sender.trustedSenderBonus;
  } else if (category === "suspicious") {
    addReason(
      reasons,
      "Suspicious sender domain (list)",
      settings.sender.suspiciousSenderDomain,
      `Sender domain "${senderDomain}" is on the suspicious site list.`
    );
    delta += settings.sender.suspiciousSenderDomain;
  } else if (category === "dangerous") {
    addReason(
      reasons,
      "Dangerous sender domain",
      settings.sender.dangerousSenderDomain,
      `Sender domain "${senderDomain}" is on the dangerous site list.`
    );
    delta += settings.sender.dangerousSenderDomain;
  }

  return delta;
}

function applyLinkReputation(reasons, links, lists, settings) {
  let delta = 0;
  const trustedDomains = new Set();
  const suspiciousDomains = new Set();
  const dangerousDomains = new Set();
  const misleadingUserinfoHosts = new Set();

  for (const link of links) {
    const domain = linkReputationDomain(link);
    if (!domain || domain === "unknown") continue;

    if (link?.hasUserinfo) {
      misleadingUserinfoHosts.add(domain);
    }

    const category = getDomainCategory(domain, lists);
    if (category === "trusted" && !link?.hasUserinfo) {
      trustedDomains.add(domain);
    }
    if (category === "suspicious") suspiciousDomains.add(domain);
    if (category === "dangerous") dangerousDomains.add(domain);
  }

  if (misleadingUserinfoHosts.size > 0) {
    addReason(
      reasons,
      "Misleading URL userinfo",
      settings.links.suspiciousLinkDomain,
      `Link(s) hide a destination behind userinfo and may impersonate a trusted host: ${[...misleadingUserinfoHosts].join(", ")}.`
    );
    delta += settings.links.suspiciousLinkDomain;
  }

  if (trustedDomains.size > 0) {
    addReason(
      reasons,
      "Trusted link domain",
      settings.links.trustedLinkBonus,
      `Link domain(s) on trusted list: ${[...trustedDomains].join(", ")}.`
    );
    delta += settings.links.trustedLinkBonus;
  }

  if (suspiciousDomains.size > 0) {
    addReason(
      reasons,
      "Suspicious link domain (list)",
      settings.links.suspiciousLinkDomain,
      `Link domain(s) on suspicious list: ${[...suspiciousDomains].join(", ")}.`
    );
    delta += settings.links.suspiciousLinkDomain;
  }

  if (dangerousDomains.size > 0) {
    addReason(
      reasons,
      "Known dangerous link",
      settings.links.dangerousLinkDomain,
      `Link domain(s) listed as dangerous: ${[...dangerousDomains].join(", ")}.`
    );
    delta += settings.links.dangerousLinkDomain;
  }

  return delta;
}

function linkDomainOnListCategory(links, lists, category) {
  return links.some((link) => {
    const domain = String(link?.domain ?? "").trim();
    if (!domain || domain === "unknown") return false;
    return getDomainCategory(domain, lists) === category;
  });
}

function hasOtherSuspiciousSigns(parsed, links) {
  const urgent = safeArray(parsed?.detectedUrgentPhrases);
  const sensitive = safeArray(parsed?.detectedSensitiveRequests);
  const scam = safeArray(parsed?.detectedKeywords);

  return (
    isSenderDomainMissing(parsed?.senderDomain) ||
    isSuspiciousSenderDomain(parsed?.senderDomain) ||
    urgent.length > 0 ||
    sensitive.length > 0 ||
    scam.length > 0 ||
    hasHttpLink(links) ||
    hasMisleadingUserinfoLink(links) ||
    hasSuspiciousLinkDomain(links) ||
    hasInvalidLink(links)
  );
}

function applyLookalikeSettings(lookalikeResult, settings) {
  const adjusted = safeArray(lookalikeResult?.matches).map((match) => {
    const key = LOOKALIKE_SEVERITY_POINTS[match.severity];
    const points = key ? settings.lookalikes[key] : match.points;
    return { ...match, points };
  });

  const matches = dedupeLookalikeMatches(adjusted);

  return {
    hasLookalikes: matches.length > 0,
    matches,
  };
}

/**
 * @param {object|null|undefined} parsedEmail
 * @param {{ trustedSites?: string[], referenceDomains?: string[], suspiciousSites?: string[], dangerousSites?: string[] }} [siteLists]
 * @param {ReturnType<getDefaultScoringSettings>} [scoringSettings]
 */
export function scoreEmail(parsedEmail, siteLists, scoringSettings) {
  const lists = siteLists ?? getDefaultSiteLists();
  const settings = scoringSettings ?? getDefaultScoringSettings();

  if (!parsedEmail || typeof parsedEmail !== "object") {
    return {
      score: 0,
      riskLevel: "Safe",
      granularRiskLevel: "Low Risk",
      reasons: [],
      recommendedAction: "Allow normally.",
      trustDecay: emptyTrustDecay(),
      lookalikeResult: emptyLookalikeResult(),
    };
  }

  /** @type {{ label: string, points: number, detail: string }[]} */
  const reasons = [];
  let total = 0;

  const links = safeLinks(parsedEmail);
  const urgentPhrases = safeArray(parsedEmail.detectedUrgentPhrases);
  const softContextPhrases = safeArray(parsedEmail.detectedSoftContextPhrases);
  const sensitiveRequests = safeArray(parsedEmail.detectedSensitiveRequests);
  const scamKeywords = safeArray(parsedEmail.detectedKeywords);
  const effectiveScamKeywords = parsedEmail.requestsAuthentication
    ? scamKeywords.filter((keyword) => keyword !== "verify")
    : scamKeywords;
  const senderDomain = parsedEmail.senderDomain;
  const senderListCategory = isSenderDomainMissing(senderDomain)
    ? "unknown"
    : getDomainCategory(senderDomain, lists);

  total += applySenderReputation(reasons, senderDomain, lists, settings);
  total += applyLinkReputation(reasons, links, lists, settings);

  if (parsedEmail.verifiedSchoolAccount) {
    addReason(
      reasons,
      "Verified school sender",
      settings.sender.verifiedSchoolSenderBonus,
      "Sender is marked as a verified school account (simulated)."
    );
    total += settings.sender.verifiedSchoolSenderBonus;
  }

  if (isSenderDomainMissing(senderDomain)) {
    addReason(
      reasons,
      "Unknown sender domain",
      settings.sender.unknownSenderDomain,
      "The sender domain is missing or could not be determined."
    );
    total += settings.sender.unknownSenderDomain;
  }

  if (isSuspiciousSenderDomain(senderDomain) && senderListCategory === "unknown") {
    // TODO: word-based sender heuristic uses the list suspicious penalty minus 1
    // to preserve legacy +1 behavior when suspiciousSenderDomain is 2.
    const heuristicPenalty = Math.max(
      0,
      settings.sender.suspiciousSenderDomain - 1
    );
    addReason(
      reasons,
      "Suspicious sender domain",
      heuristicPenalty,
      `Sender domain "${senderDomain}" contains wording often used in phishing or impersonation attempts.`
    );
    total += heuristicPenalty;
  }

  const linkCount = links.length;

  if (linkCount > 1) {
    addReason(
      reasons,
      "Multiple links",
      settings.links.multipleLinks,
      `${linkCount} links were found in the message body.`
    );
    total += settings.links.multipleLinks;
  } else if (linkCount === 1 && hasOtherSuspiciousSigns(parsedEmail, links)) {
    addReason(
      reasons,
      "Single link with other suspicious signs",
      settings.links.oneLinkWithSuspiciousContext,
      "One link was found alongside other suspicious signals in the message."
    );
    total += settings.links.oneLinkWithSuspiciousContext;
  }

  if (hasHttpLink(links)) {
    addReason(
      reasons,
      "Insecure HTTP link",
      settings.links.insecureHttp,
      "At least one link uses HTTP instead of HTTPS."
    );
    total += settings.links.insecureHttp;
  }

  if (
    hasSuspiciousLinkDomain(links) &&
    !linkDomainOnListCategory(links, lists, "suspicious") &&
    !linkDomainOnListCategory(links, lists, "dangerous")
  ) {
    const suspiciousDomains = links
      .filter((link) =>
        domainContainsWord(link?.domain, SUSPICIOUS_LINK_DOMAIN_WORDS)
      )
      .map((link) => link.domain)
      .filter(Boolean);

    addReason(
      reasons,
      "Suspicious link domain",
      settings.links.suspiciousLinkDomain,
      `Link domain(s) contain high-risk words: ${[...new Set(suspiciousDomains)].join(", ") || "unknown"}.`
    );
    total += settings.links.suspiciousLinkDomain;
  }

  if (hasInvalidLink(links)) {
    addReason(
      reasons,
      "Malformed link",
      settings.links.malformedLink,
      "At least one link could not be parsed as a valid URL."
    );
    total += settings.links.malformedLink;
  }

  if (urgentPhrases.length >= 3) {
    addReason(
      reasons,
      "Multiple urgent phrases",
      settings.language.manyUrgentPhrases,
      `Detected ${urgentPhrases.length} urgent phrases: ${urgentPhrases.join(", ")}.`
    );
    total += settings.language.manyUrgentPhrases;
  } else if (urgentPhrases.length > 0) {
    addReason(
      reasons,
      "Urgent language",
      settings.language.urgentPhrases,
      `Detected urgent phrasing: ${urgentPhrases.join(", ")}.`
    );
    total += settings.language.urgentPhrases;
  }

  if (softContextPhrases.length > 0) {
    const softPoints =
      softContextPhrases.length * settings.language.softContextPhrase;
    addReason(
      reasons,
      "Routine form language",
      softPoints,
      `Common school-style wording (weak signal): ${softContextPhrases.join(", ")}.`
    );
    total += softPoints;
  }

  if (sensitiveRequests.length > 0) {
    addReason(
      reasons,
      "Sensitive information request",
      settings.language.sensitiveRequests,
      `Message asks for sensitive details: ${sensitiveRequests.join(", ")}.`
    );
    total += settings.language.sensitiveRequests;
  }

  const replyToDomains = safeArray(parsedEmail.replyToDomains);
  const replyToMismatchDomains = replyToDomains.filter((domain) =>
    domainsDiffer(senderDomain, domain)
  );
  const replyToMismatch = replyToMismatchDomains.length > 0;
  const authenticationLinkDomains = safeArray(parsedEmail.authenticationLinkDomains);
  const externalAuthenticationLink =
    parsedEmail.requestsAuthentication &&
    hasExternalAuthenticationDestination(authenticationLinkDomains, senderDomain);
  const coordinatedSocialEngineering =
    externalAuthenticationLink &&
    Boolean(parsedEmail.highRiskWorkflow) &&
    (parsedEmail.hasDeadlinePressure || replyToMismatch);

  if (
    parsedEmail.requestsAuthentication &&
    authenticationLinkDomains.length > 0 &&
    !externalAuthenticationLink
  ) {
    addReason(
      reasons,
      "Authentication requested through a link",
      settings.context.authenticationRequest,
      "Message asks the recipient to authenticate after opening a link."
    );
    total += settings.context.authenticationRequest;
  }

  if (parsedEmail.hasDeadlinePressure && links.length > 0) {
    addReason(
      reasons,
      "Restrained deadline pressure",
      settings.context.restrainedDeadline,
      "Message combines a deadline or negative consequence with a requested link action."
    );
    total += settings.context.restrainedDeadline;
  }

  if (replyToMismatch && (links.length > 0 || parsedEmail.requestsAuthentication)) {
    addReason(
      reasons,
      "Reply-To domain mismatch",
      settings.context.replyToMismatch,
      `Reply-To domain(s) "${replyToMismatchDomains.join(", ")}" differ from sender domain "${senderDomain}".`
    );
    total += settings.context.replyToMismatch;
  }

  if (externalAuthenticationLink) {
    addReason(
      reasons,
      "External authentication destination",
      settings.context.externalAuthenticationLink,
      "The message requests authentication on a domain unrelated to the sender domain."
    );
    total += settings.context.externalAuthenticationLink;
  }

  if (coordinatedSocialEngineering) {
    addReason(
      reasons,
      "Coordinated social-engineering pattern",
      settings.context.coordinatedSocialEngineering,
      `Message combines ${parsedEmail.highRiskWorkflow} context, an external authentication destination, and supporting pressure or identity mismatch signals.`
    );
    total += settings.context.coordinatedSocialEngineering;
  }

  if (effectiveScamKeywords.length >= 4) {
    addReason(
      reasons,
      "Many scam keywords",
      settings.language.manyScamKeywords,
      `Detected ${effectiveScamKeywords.length} scam-related keywords: ${effectiveScamKeywords.join(", ")}.`
    );
    total += settings.language.manyScamKeywords;
  } else if (effectiveScamKeywords.length > 0) {
    addReason(
      reasons,
      "Scam keywords",
      settings.language.scamKeywords,
      `Detected scam-related wording: ${effectiveScamKeywords.join(", ")}.`
    );
    total += settings.language.scamKeywords;
  }

  if (
    isScholarshipScamPattern(parsedEmail) &&
    !links.some((link) => link?.isValidUrl)
  ) {
    addReason(
      reasons,
      "Scholarship scam pattern",
      settings.language.scholarshipScamPattern,
      "Message combines scholarship offer language with urgency or a sketchy claim pitch, without a verifiable link."
    );
    total += settings.language.scholarshipScamPattern;
  }

  if (parsedEmail.hasAttachment) {
    addReason(
      reasons,
      "Attachment present",
      settings.attachments.hasAttachment,
      "The message includes an attachment (simulated)."
    );
    total += settings.attachments.hasAttachment;
  }

  // Spread/reports scoring is handled in trustDecayEngine to avoid double-counting.

  const trustDecay = applyTrustDecay(parsedEmail, lists, settings);
  for (const decayReason of trustDecay.reasons) {
    addReason(
      reasons,
      decayReason.label,
      decayReason.points,
      decayReason.detail
    );
  }
  total += trustDecay.decayPoints;

  const lookalikeResult = applyLookalikeSettings(
    analyzeDomainLookalikes(parsedEmail, lists),
    settings
  );
  const scoredLookalikeDomains = new Set();
  for (const match of lookalikeResult.matches) {
    const domainKey = normalizeDomain(match.domain);
    if (!domainKey || scoredLookalikeDomains.has(domainKey)) continue;
    scoredLookalikeDomains.add(domainKey);

    addReason(
      reasons,
      "Lookalike domain detected",
      match.points,
      match.reason
    );
    total += match.points;
  }

  const score = clampScore(total);
  const reasonTotal = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const scoreAdjustment = score - reasonTotal;
  if (scoreAdjustment !== 0) {
    const adjustmentKind = total > 10 ? "capped" : total < 0 ? "floored" : "rounded";
    const labels = {
      capped: "Score capped at 10",
      floored: "Score floored at 0",
      rounded: "Score rounded",
    };
    const details = {
      capped: "Raw reason points exceeded the maximum score, so the displayed total was capped at 10.",
      floored: "Risk-reducing reason points fell below the minimum score, so the displayed total was floored at 0.",
      rounded: "Fractional reason points were rounded to the nearest whole-number score.",
    };
    addReason(
      reasons,
      labels[adjustmentKind],
      scoreAdjustment,
      details[adjustmentKind]
    );
  }

  return {
    score,
    riskLevel: getRiskBand(score).label,
    granularRiskLevel: getGranularRiskLevel(score),
    reasons,
    recommendedAction: getRecommendedAction(score),
    trustDecay,
    lookalikeResult,
  };
}
