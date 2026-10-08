/**
 * Shared domain normalization helpers (demo scanner).
 */

import { getDomain } from "tldts";

/**
 * @param {unknown} domain
 * @returns {string}
 */
export function normalizeDomain(domain) {
  if (domain == null) return "";

  let value = String(domain).trim().toLowerCase();
  if (!value) return "";
  if (value === "unknown") return "unknown";

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  value = value.split(/[/?#]/)[0] ?? "";

  if (value.includes("@")) {
    value = value.slice(value.lastIndexOf("@") + 1);
  }

  value = value.replace(/^www\./, "");
  value = value.replace(/^[<\[({'"`]+/, "");
  value = value.replace(/[.,;:)\]}>'"]+$/g, "");
  value = value.replace(/^\.+|\.+$/g, "");

  try {
    value = new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    // Keep the normalized text for existing validation paths.
  }

  return value;
}

/**
 * @param {unknown} domain
 * @returns {string}
 */
export function getRootDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized || normalized === "unknown") return "";
  return getDomain(normalized, { allowPrivateDomains: true }) ?? normalized;
}

/**
 * @param {unknown} domain
 * @param {unknown} parentDomain
 */
export function isSubdomainOf(domain, parentDomain) {
  const host = normalizeDomain(domain);
  const parent = normalizeDomain(parentDomain);
  if (!host || !parent || host === "unknown") return false;

  const parentLabels = parent.split(".").filter(Boolean);
  if (parentLabels.length < 2) return false;

  return host === parent || host.endsWith(`.${parent}`);
}

/**
 * Site list entries must be a registrable-style host (at least two labels).
 * Rejects bare TLDs like "com" or "edu" that would match every domain.
 * @param {unknown} domain
 */
export function isValidSiteListEntry(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized || normalized === "unknown") return false;
  return Boolean(getDomain(normalized, { allowPrivateDomains: true }));
}
