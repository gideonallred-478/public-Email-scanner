import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { canReviewSiteListSuggestions } from "../auth/rolePermissions.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";
import { maybeNotifyReviewersOfSiteListSuggestion } from "../notifications/siteListSuggestionNotifications.js";

/**
 * Notifies admin/IT in this browser when pending site list suggestions need review.
 */
export function useReviewerSiteListSuggestionAlerts() {
  const { user } = useAuth();
  const { pendingSuggestions } = useSiteLists();
  const canReview = canReviewSiteListSuggestions(user?.role);
  const prevCountRef = useRef(0);
  const loginNotifiedRef = useRef(false);

  useEffect(() => {
    if (!canReview) {
      prevCountRef.current = 0;
      loginNotifiedRef.current = false;
      return;
    }

    const count = pendingSuggestions.length;
    const prevCount = prevCountRef.current;

    if (!loginNotifiedRef.current && count > 0) {
      loginNotifiedRef.current = true;
      const latest = pendingSuggestions[count - 1];
      maybeNotifyReviewersOfSiteListSuggestion(latest, { pendingCount: count });
    } else if (count > prevCount && prevCount > 0) {
      const latest = pendingSuggestions[count - 1];
      maybeNotifyReviewersOfSiteListSuggestion(latest, { pendingCount: count });
    }

    prevCountRef.current = count;
  }, [canReview, pendingSuggestions, user?.username]);
}
