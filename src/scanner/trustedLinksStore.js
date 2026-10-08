/**
 * Layer 4 — Local site lists (demo only).
 * Trusted / suspicious / dangerous affect risk scoring.
 * Reference domains are used only for lookalike detection.
 */

import { isSubdomainOf, isValidSiteListEntry, normalizeDomain } from "./domainUtils.js";

export { normalizeDomain } from "./domainUtils.js";

export const DEFAULT_TRUSTED_SITES = [
  "lincoln-high.edu",
  "staffordschools.net",
  "canvas.instructure.com",
  "classroom.google.com",
  "docs.google.com",
  "forms.gle",
  "collegeboard.org",
  "studentaid.gov",
  "fafsa.gov",
];

export const DEFAULT_REFERENCE_DOMAINS = [
  "google.com",
  "gmail.com",
  "microsoft.com",
  "office.com",
  "outlook.com",
  "apple.com",
  "icloud.com",
  "paypal.com",
  "amazon.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "x.com",
  "chatgpt.com",
  "openai.com",
  "collegeboard.org",
  "studentaid.gov",
  "fafsa.gov",
  "commonapp.org",
  "khanacademy.org",
  "canvas.instructure.com",
  "docs.google.com",
  "classroom.google.com",
];

export const DEFAULT_SUSPICIOUS_SITES = [
  "student-opportunities.net",
  "scholarship-claim.net",
  "school-login-help.net",
];

export const DEFAULT_DANGEROUS_SITES = [
  "secure-scholarship-claim.xyz",
  "school-login-reset.net",
  "fake-login-verify.com",
];

/** @typedef {"trusted" | "suspicious" | "dangerous" | "unknown"} DomainCategory */

/**
 * @returns {{
 *   trustedSites: string[],
 *   referenceDomains: string[],
 *   suspiciousSites: string[],
 *   dangerousSites: string[],
 * }}
 */
export function getDefaultSiteLists() {
  return {
    trustedSites: [...DEFAULT_TRUSTED_SITES],
    referenceDomains: [...DEFAULT_REFERENCE_DOMAINS],
    suspiciousSites: [...DEFAULT_SUSPICIOUS_SITES],
    dangerousSites: [...DEFAULT_DANGEROUS_SITES],
  };
}

/**
 * @param {string} domain
 * @param {string} entry
 */
export function domainMatchesEntry(domain, entry) {
  return isSubdomainOf(domain, entry);
}

/**
 * @param {string} domain
 * @param {string[]} list
 */
function matchesAny(domain, list) {
  return safeList(list).some((entry) => domainMatchesEntry(domain, entry));
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Domains used as lookalike comparison targets (reference list + trusted sites).
 * Reference domains alone do not reduce risk.
 * @param {{ referenceDomains?: string[], trustedSites?: string[] }} [lists]
 */
export function getLookalikeReferenceDomains(lists = getDefaultSiteLists()) {
  const merged = new Set();
  for (const domain of safeList(lists.referenceDomains)) {
    const normalized = normalizeDomain(domain);
    if (normalized) merged.add(normalized);
  }
  for (const domain of safeList(lists.trustedSites)) {
    const normalized = normalizeDomain(domain);
    if (normalized) merged.add(normalized);
  }
  return [...merged];
}

/**
 * @param {string} domain
 * @param {{ trustedSites?: string[], suspiciousSites?: string[], dangerousSites?: string[] }} [lists]
 */
export function isDangerousDomain(domain, lists = getDefaultSiteLists()) {
  return matchesAny(domain, lists.dangerousSites);
}

export function isSuspiciousDomain(domain, lists = getDefaultSiteLists()) {
  return matchesAny(domain, lists.suspiciousSites);
}

export function isTrustedDomain(domain, lists = getDefaultSiteLists()) {
  return matchesAny(domain, lists.trustedSites);
}

/**
 * Dangerous beats suspicious beats trusted.
 * @returns {DomainCategory}
 */
export function getDomainCategory(domain, lists = getDefaultSiteLists()) {
  if (isDangerousDomain(domain, lists)) return "dangerous";
  if (isSuspiciousDomain(domain, lists)) return "suspicious";
  if (isTrustedDomain(domain, lists)) return "trusted";
  return "unknown";
}

const LIST_KEYS = {
  trusted: "trustedSites",
  reference: "referenceDomains",
  suspicious: "suspiciousSites",
  dangerous: "dangerousSites",
};

export const SITE_LIST_CATEGORY_LABELS = {
  trusted: "Trusted / Approved",
  reference: "Reference (lookalike)",
  suspicious: "Suspicious",
  dangerous: "Dangerous",
};

/**
 * @param {ReturnType<getDefaultSiteLists>} lists
 * @param {"trusted" | "reference" | "suspicious" | "dangerous"} category
 * @param {string} domain
 */
export function findDuplicateSiteListEntry(lists, category, domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized || !LIST_KEYS[category]) {
    return null;
  }

  const key = LIST_KEYS[category];
  const alreadyListed = safeList(lists[key]).some(
    (entry) => normalizeDomain(entry) === normalized
  );

  if (!alreadyListed) {
    return null;
  }

  return {
    category,
    domain: normalized,
    message: `${normalized} is already on the ${SITE_LIST_CATEGORY_LABELS[category]} list.`,
  };
}

const RISK_CATEGORIES = new Set(["trusted", "suspicious", "dangerous"]);

function removeFromRiskLists(lists, normalized) {
  return {
    ...lists,
    trustedSites: lists.trustedSites.filter(
      (d) => normalizeDomain(d) !== normalized
    ),
    suspiciousSites: lists.suspiciousSites.filter(
      (d) => normalizeDomain(d) !== normalized
    ),
    dangerousSites: lists.dangerousSites.filter(
      (d) => normalizeDomain(d) !== normalized
    ),
  };
}

/**
 * Session-only add helper.
 * Reference domains are independent from risk lists (a domain may appear in both).
 * @param {ReturnType<getDefaultSiteLists>} lists
 * @param {"trusted" | "reference" | "suspicious" | "dangerous"} category
 * @param {string} domain
 */
export function addDomainToList(lists, category, domain) {
  const normalized = normalizeDomain(domain);
  const valid = Boolean(normalized && LIST_KEYS[category] && isValidSiteListEntry(normalized));
  if (!valid) {
    return lists;
  }

  if (category === "reference") {
    const refs = safeList(lists.referenceDomains);
    if (refs.some((d) => normalizeDomain(d) === normalized)) return lists;
    return {
      ...lists,
      referenceDomains: [...refs, normalized],
    };
  }

  if (!RISK_CATEGORIES.has(category)) return lists;

  const cleared = removeFromRiskLists(lists, normalized);
  const key = LIST_KEYS[category];
  const current = safeList(cleared[key]);
  if (current.some((d) => normalizeDomain(d) === normalized)) return cleared;

  return {
    ...cleared,
    [key]: [...current, normalized],
  };
}

/**
 * @param {ReturnType<getDefaultSiteLists>} lists
 * @param {string} domain
 */
export function removeDomainFromAllLists(lists, domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return lists;

  return {
    trustedSites: lists.trustedSites.filter(
      (d) => normalizeDomain(d) !== normalized
    ),
    referenceDomains: safeList(lists.referenceDomains).filter(
      (d) => normalizeDomain(d) !== normalized
    ),
    suspiciousSites: lists.suspiciousSites.filter(
      (d) => normalizeDomain(d) !== normalized
    ),
    dangerousSites: lists.dangerousSites.filter(
      (d) => normalizeDomain(d) !== normalized
    ),
  };
}
