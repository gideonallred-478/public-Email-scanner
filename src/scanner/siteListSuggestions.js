import { isValidSiteListEntry, normalizeDomain } from "./domainUtils.js";
import {
  findDuplicateSiteListEntry,
  SITE_LIST_CATEGORY_LABELS,
} from "./trustedLinksStore.js";

export const SITE_LIST_SUGGESTIONS_STORAGE_KEY =
  "senior-email-scanner-site-list-suggestions";

export const SUGGESTION_CATEGORIES = ["suspicious", "dangerous"];

export const SUGGESTION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  DISMISSED: "dismissed",
};

function safeSuggestions(value) {
  return Array.isArray(value) ? value : [];
}

export function loadSiteListSuggestions() {
  try {
    const raw = localStorage.getItem(SITE_LIST_SUGGESTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return safeSuggestions(parsed).filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.domain === "string" &&
        SUGGESTION_CATEGORIES.includes(entry.category)
    );
  } catch {
    return [];
  }
}

export function saveSiteListSuggestions(entries) {
  try {
    localStorage.setItem(
      SITE_LIST_SUGGESTIONS_STORAGE_KEY,
      JSON.stringify(entries)
    );
    return true;
  } catch {
    return false;
  }
}

export function listPendingSiteListSuggestions(entries = loadSiteListSuggestions()) {
  return entries.filter((entry) => entry.status === SUGGESTION_STATUS.PENDING);
}

export function findPendingSuggestionDuplicate(entries, category, domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;

  const pending = listPendingSiteListSuggestions(entries);
  const match = pending.find(
    (entry) =>
      entry.category === category &&
      normalizeDomain(entry.domain) === normalized
  );

  return match ?? null;
}

/**
 * @param {ReturnType<import('./trustedLinksStore.js').getDefaultSiteLists>} lists
 * @param {ReturnType<loadSiteListSuggestions>} entries
 * @param {"suspicious"|"dangerous"} category
 * @param {string} domain
 * @param {{ suggestedBy?: string, note?: string }} [meta]
 */
export function buildSiteListSuggestion(lists, entries, category, domain, meta = {}) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return { ok: false, reason: "empty", message: "Enter a domain name to suggest." };
  }
  if (!SUGGESTION_CATEGORIES.includes(category)) {
    return {
      ok: false,
      reason: "invalid_category",
      message: "Suggestions are limited to suspicious or dangerous domains.",
    };
  }
  if (!isValidSiteListEntry(normalized)) {
    return {
      ok: false,
      reason: "invalid",
      message:
        "Use a full domain like school.edu — bare TLDs such as com or edu are not allowed.",
    };
  }

  const onList = findDuplicateSiteListEntry(lists, category, normalized);
  if (onList) {
    return {
      ok: false,
      reason: "duplicate_list",
      message: `${normalized} is already on the ${SITE_LIST_CATEGORY_LABELS[category]} list.`,
    };
  }

  const pending = findPendingSuggestionDuplicate(entries, category, normalized);
  if (pending) {
    return {
      ok: false,
      reason: "duplicate_pending",
      message: `${normalized} is already pending review for ${SITE_LIST_CATEGORY_LABELS[category]}.`,
    };
  }

  const note = String(meta.note ?? "").trim();
  const entry = {
    id: `suggest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    domain: normalized,
    category,
    note: note || null,
    suggestedBy: String(meta.suggestedBy ?? "User").trim() || "User",
    suggestedAt: new Date().toISOString(),
    status: SUGGESTION_STATUS.PENDING,
  };

  return {
    ok: true,
    entry,
    message: `Suggestion sent for IT review (${SITE_LIST_CATEGORY_LABELS[category]}).`,
  };
}

export function appendSiteListSuggestion(entries, entry) {
  return [...entries, entry];
}

export function updateSiteListSuggestionStatus(entries, id, status) {
  return entries.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          status,
          reviewedAt: new Date().toISOString(),
        }
      : entry
  );
}
