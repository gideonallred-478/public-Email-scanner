import { APP_NAME } from "../appBrand.js";
import { SITE_LIST_CATEGORY_LABELS } from "../scanner/trustedLinksStore.js";

/**
 * Browser notification for admin/IT when pending site list suggestions need review.
 * No email/push API — reviewers also see the pending queue on Site Lists.
 */
export function maybeNotifyReviewersOfSiteListSuggestion(entry, options = {}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const pendingCount = Number(options.pendingCount ?? 0);
  const title = `${APP_NAME} — site list suggestion${pendingCount > 1 ? "s" : ""}`;

  let body;
  if (entry?.domain) {
    const categoryLabel =
      SITE_LIST_CATEGORY_LABELS[entry.category] ?? entry.category ?? "review";
    body = `${entry.domain} (${categoryLabel}) from ${entry.suggestedBy ?? "User"}`;
    if (pendingCount > 1) {
      body += ` · ${pendingCount} waiting for review`;
    }
  } else if (pendingCount > 0) {
    body = `${pendingCount} student suggestion${pendingCount > 1 ? "s" : ""} waiting for review on Site Lists.`;
  } else {
    return;
  }

  try {
    new Notification(title, {
      body,
      tag: entry?.id ?? `site-suggest-pending-${pendingCount}`,
    });
  } catch {
    // ignore notification failures
  }
}
