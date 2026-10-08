import { USER_ROLES } from "../src/auth/authConfig.js";

export {
  canClearAllAlerts,
  canEditSiteLists,
  canManageNotificationSettings,
  canReviewSiteListSuggestions,
  canSuggestSiteLists,
} from "../src/auth/rolePermissions.js";

export function canAccessAlerts(role) {
  return Boolean(role) && role !== USER_ROLES.STUDENT;
}
