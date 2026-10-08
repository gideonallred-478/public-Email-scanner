/**
 * Layer 6 — Lookalike domain detection (demo only).
 * Compares sender/link domains against reference domains (and trusted sites).
 * Reference domains do not reduce risk by themselves.
 */

import {
  domainMatchesEntry,
  getDefaultSiteLists,
  getDomainCategory,
  getLookalikeReferenceDomains,
} from "./trustedLinksStore.js";
import { normalizeDomain } from "./domainUtils.js";

const SUSPICIOUS_WORDS_MILD = [
  "help",
  "support",
  "account",
  "secure",
  "claim",
  "prize",
  "scholarship",
];

const SUSPICIOUS_WORDS_HIGH = [
  "login",
  "verify",
  "reset",
  "password",
];

const SUBSTITUTIONS = [
  ["0", "o"],
  ["1", "l"],
  ["3", "e"],
  ["5", "s"],
  ["@", "a"],
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function deobfuscate(text) {
  let result = String(text ?? "").toLowerCase();
  for (const [from, to] of SUBSTITUTIONS) {
    result = result.split(from).join(to);
  }
  return result;
}

function compactDomain(domain) {
  return normalizeDomain(domain).replace(/[.-]/g, "");
}

function getLabels(domain) {
  return normalizeDomain(domain).split(".").filter(Boolean);
}

function getSld(domain) {
  const labels = getLabels(domain);
  if (labels.length < 2) return labels[0] ?? "";
  return labels[labels.length - 2];
}

function getTld(domain) {
  const labels = getLabels(domain);
  return labels[labels.length - 1] ?? "";
}

function levenshtein(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;

  const row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= y.length; j += 1) {
      const temp = row[j];
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      prev = temp;
    }
  }
  return row[y.length];
}

function containsSuspiciousWord(domain) {
  const lower = normalizeDomain(domain);
  const words = [...SUSPICIOUS_WORDS_HIGH, ...SUSPICIOUS_WORDS_MILD];
  return words.filter((word) => lower.includes(word));
}

function normalizeLookalikeDomain(domain) {
  const normalized = normalizeDomain(domain);
  return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

function buildReferenceProfile(referenceDomain) {
  const domain = normalizeDomain(referenceDomain);
  const labels = getLabels(domain);
  const sld = getSld(domain);
  const tld = getTld(domain);
  const roots = new Set([domain, compactDomain(domain), sld, compactDomain(sld)]);

  for (const label of labels) {
    if (label.length >= 4 && label !== tld) {
      roots.add(label);
      roots.add(compactDomain(label));
    }
  }

  if (labels.length >= 2) {
    roots.add(labels.slice(-2).join("."));
    roots.add(compactDomain(labels.slice(-2).join(".")));
  }
  if (labels.length >= 3) {
    roots.add(labels.slice(-3).join("."));
    roots.add(compactDomain(labels.slice(-3).join(".")));
  }

  return {
    domain,
    sld,
    tld,
    compact: compactDomain(domain),
    compactSld: compactDomain(sld),
    brandDeob: deobfuscate(compactDomain(sld)),
    roots: [...roots].filter(Boolean),
  };
}

function severityFromPoints(points) {
  if (points >= 3) return "high";
  if (points >= 2) return "medium";
  return "low";
}

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

/**
 * Keep the strongest lookalike match for a single domain.
 * High severity beats medium beats low; then higher points; then clearer reason.
 */
export function pickBestLookalikeMatch(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;

  const currentRank = SEVERITY_RANK[current.severity] ?? 0;
  const candidateRank = SEVERITY_RANK[candidate.severity] ?? 0;

  if (candidateRank !== currentRank) {
    return candidateRank > currentRank ? candidate : current;
  }

  if (candidate.points !== current.points) {
    return candidate.points > current.points ? candidate : current;
  }

  return (candidate.reason?.length ?? 0) > (current.reason?.length ?? 0)
    ? candidate
    : current;
}

function pickHigher(current, candidate) {
  return pickBestLookalikeMatch(current, candidate);
}

function isOfficialDomain(domain, referenceDomains) {
  return safeArray(referenceDomains).some((entry) =>
    domainMatchesEntry(domain, entry)
  );
}

/**
 * @param {string} domain
 * @param {{ domain: string, sld: string, tld: string, compact: string, compactSld: string, brandDeob: string, roots: string[] }} reference
 */
function evaluateLookalike(domain, reference) {
  if (domainMatchesEntry(domain, reference.domain)) return null;

  const candidateSld = getSld(domain);
  const candidateTld = getTld(domain);
  const candidateCompact = compactDomain(domain);
  const candidateDeob = deobfuscate(candidateCompact);
  const candidateBrandDeob = deobfuscate(compactDomain(candidateSld));
  const suspiciousHigh = containsSuspiciousWord(domain).filter((w) =>
    SUSPICIOUS_WORDS_HIGH.includes(w)
  );
  const suspiciousMild = containsSuspiciousWord(domain).filter((w) =>
    SUSPICIOUS_WORDS_MILD.includes(w)
  );
  const hyphenParts = normalizeDomain(domain).replace(/\./g, "-").split("-");

  let best = null;
  const referenceLabel = reference.domain;

  const rootContainedInCandidate = reference.roots.some((root) => {
    const compactRoot = compactDomain(root);
    return (
      compactRoot.length >= 4 &&
      (candidateCompact.includes(compactRoot) ||
        candidateDeob.includes(deobfuscate(compactRoot)))
    );
  });

  const brandSimilarEnough =
    reference.brandDeob.length >= 4 &&
    candidateBrandDeob.length >= 4 &&
    levenshtein(candidateBrandDeob, reference.brandDeob) <= 2;

  const referenceRootInCandidate =
    rootContainedInCandidate || brandSimilarEnough;

  // Character substitution on brand/root (high)
  const referenceBrandDeob = reference.brandDeob;
  if (
    referenceBrandDeob.length >= 4 &&
    (candidateBrandDeob === referenceBrandDeob ||
      levenshtein(candidateBrandDeob, referenceBrandDeob) <= 1)
  ) {
    best = pickHigher(best, {
      resemblesReferenceDomain: referenceLabel,
      severity: "high",
      points: 3,
      reason: `Domain "${domain}" closely resembles reference domain "${referenceLabel}" with character substitutions (for example 0/o or 1/l).`,
    });
  }

  // Same brand name, different TLD (medium)
  if (
    candidateSld &&
    reference.sld &&
    deobfuscate(compactDomain(candidateSld)) === deobfuscate(compactDomain(reference.sld)) &&
    candidateTld !== reference.tld
  ) {
    best = pickHigher(best, {
      resemblesReferenceDomain: referenceLabel,
      severity: "medium",
      points: 2,
      reason: `Domain "${domain}" uses the same name as reference domain "${referenceLabel}" but a different ending (.${candidateTld} vs .${reference.tld}).`,
    });
  }

  // Hyphen/login clone (medium, high with auth words)
  const hyphenClone =
    referenceRootInCandidate &&
    hyphenParts.length >= 2 &&
    (normalizeDomain(domain).includes("-") || suspiciousHigh.length > 0);

  if (hyphenClone) {
    const points = suspiciousHigh.length > 0 ? 3 : 2;
    best = pickHigher(best, {
      resemblesReferenceDomain: referenceLabel,
      severity: severityFromPoints(points),
      points,
      reason: suspiciousHigh.length
        ? `Domain "${domain}" looks like a hyphenated login clone of reference domain "${referenceLabel}".`
        : `Domain "${domain}" uses hyphenated wording similar to reference domain "${referenceLabel}".`,
    });
  }

  // Reference brand/root + suspicious word
  if (referenceRootInCandidate && (suspiciousHigh.length > 0 || suspiciousMild.length > 0)) {
    const highAuth = suspiciousHigh.length > 0;
    const points = highAuth ? 3 : 1;
    const words = [...suspiciousHigh, ...suspiciousMild].join(", ");
    best = pickHigher(best, {
      resemblesReferenceDomain: referenceLabel,
      severity: severityFromPoints(points),
      points,
      reason: highAuth
        ? `Domain "${domain}" includes brand-style naming plus authentication wording (${words}) similar to reference domain "${referenceLabel}".`
        : `Domain "${domain}" contains wording related to reference domain "${referenceLabel}" plus suspicious terms (${words}).`,
    });
  }

  // Minor spelling change on root (medium)
  if (
    reference.sld.length >= 6 &&
    candidateSld &&
    candidateTld !== reference.tld &&
    levenshtein(deobfuscate(compactDomain(candidateSld)), deobfuscate(compactDomain(reference.sld))) === 1
  ) {
    best = pickHigher(best, {
      resemblesReferenceDomain: referenceLabel,
      severity: "medium",
      points: 2,
      reason: `Domain "${domain}" is a near-spelling match to reference domain "${referenceLabel}".`,
    });
  }

  return best;
}

function collectDomainsFromParsed(parsedEmail) {
  const domains = new Set();
  const sender = String(parsedEmail?.senderDomain ?? "").trim();
  if (sender && sender !== "unknown") domains.add(normalizeDomain(sender));

  for (const link of safeArray(parsedEmail?.links)) {
    const domain = String(link?.domain ?? "").trim();
    if (domain && domain !== "unknown") domains.add(normalizeDomain(domain));
  }

  return [...domains];
}

/**
 * One entry per suspicious domain — keep the strongest match only.
 * @param {{ domain: string, resemblesReferenceDomain: string, severity: "low"|"medium"|"high", reason: string, points: number }[]} matches
 */
export function dedupeLookalikeMatches(matches) {
  const byDomain = new Map();

  for (const match of safeArray(matches)) {
    const domain = normalizeLookalikeDomain(match.domain);
    if (!domain || domain === "unknown") continue;

    const normalizedMatch = { ...match, domain };
    const existing = byDomain.get(domain);
    byDomain.set(
      domain,
      existing
        ? pickBestLookalikeMatch(existing, normalizedMatch)
        : normalizedMatch
    );
  }

  return [...byDomain.values()];
}

/**
 * @param {string[]} domainsToCheck
 * @param {string[]} referenceDomains
 */
export function detectLookalikeDomains(domainsToCheck, referenceDomains) {
  const referenceProfiles = safeArray(referenceDomains).map(buildReferenceProfile);
  /** @type {{ domain: string, resemblesReferenceDomain: string, severity: "low"|"medium"|"high", reason: string, points: number }[]} */
  const matches = [];

  const seenDomains = new Set();

  for (const rawDomain of safeArray(domainsToCheck)) {
    const domain = normalizeLookalikeDomain(rawDomain);
    if (!domain || domain === "unknown" || seenDomains.has(domain)) continue;
    seenDomains.add(domain);

    if (isOfficialDomain(domain, referenceDomains)) continue;

    let best = null;
    for (const profile of referenceProfiles) {
      const result = evaluateLookalike(domain, profile);
      if (result) {
        best = pickBestLookalikeMatch(best, result);
      }
    }

    if (best) {
      matches.push({
        domain,
        resemblesReferenceDomain: best.resemblesReferenceDomain,
        severity: best.severity,
        reason: best.reason,
        points: best.points,
      });
    }
  }

  const dedupedMatches = dedupeLookalikeMatches(matches);

  return {
    hasLookalikes: dedupedMatches.length > 0,
    matches: dedupedMatches,
  };
}

/**
 * @param {object} parsedEmail
 * @param {ReturnType<getDefaultSiteLists>} [siteLists]
 */
export function analyzeDomainLookalikes(parsedEmail, siteLists) {
  const lists = siteLists ?? getDefaultSiteLists();
  const referenceDomains = getLookalikeReferenceDomains(lists);
  const domains = collectDomainsFromParsed(parsedEmail);
  return detectLookalikeDomains(domains, referenceDomains);
}

export function getLookalikeMatchForDomain(domain, lookalikeResult) {
  const normalized = normalizeLookalikeDomain(domain);
  const matches = safeArray(lookalikeResult?.matches).filter(
    (match) => normalizeLookalikeDomain(match.domain) === normalized
  );
  if (!matches.length) return null;
  return matches.reduce(pickBestLookalikeMatch);
}

/**
 * Effective category for UI — exact trusted wins; lookalike overrides unknown.
 */
export function getEffectiveDomainCategory(domain, siteLists, lookalikeResult) {
  const normalized = normalizeDomain(domain);
  if (!normalized || normalized === "unknown") return "unknown";

  const listCategory = getDomainCategory(normalized, siteLists);
  if (
    listCategory === "trusted" ||
    listCategory === "dangerous" ||
    listCategory === "suspicious"
  ) {
    return listCategory;
  }

  if (getLookalikeMatchForDomain(normalized, lookalikeResult)) {
    return "lookalike";
  }

  return "unknown";
}

export function emptyLookalikeResult() {
  return { hasLookalikes: false, matches: [] };
}
