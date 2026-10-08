import { USER_ROLES } from "./authConfig.js";

export const APP_TABS = [
  { id: "alerts", label: "Alerts" },
  { id: "demo", label: "Demo" },
  { id: "scanner", label: "Scanner" },
  { id: "site-lists", label: "Site Lists" },
  { id: "settings", label: "Settings" },
  { id: "tracker", label: "Tracker" },
];

/** @type {Record<string, string[]>} */
const ROLE_TAB_ACCESS = {
  [USER_ROLES.ADMIN]: [
    "alerts",
    "demo",
    "scanner",
    "site-lists",
    "settings",
    "tracker",
  ],
  [USER_ROLES.IT]: ["alerts", "scanner", "site-lists", "settings", "tracker"],
  [USER_ROLES.TEACHER]: ["alerts", "scanner", "site-lists"],
  [USER_ROLES.PRINCIPAL]: ["alerts", "scanner", "site-lists"],
  [USER_ROLES.STUDENT]: ["site-lists"],
};

const ROLES_THAT_EDIT_SITE_LISTS = new Set([
  USER_ROLES.ADMIN,
  USER_ROLES.IT,
  USER_ROLES.TEACHER,
]);

const ROLES_THAT_SUGGEST_SITE_LISTS = new Set([
  USER_ROLES.STUDENT,
  USER_ROLES.PRINCIPAL,
]);

const ROLES_THAT_REVIEW_SITE_LIST_SUGGESTIONS = new Set([
  USER_ROLES.ADMIN,
  USER_ROLES.IT,
]);

export function getTabsForRole(role) {
  const allowed = ROLE_TAB_ACCESS[role];
  if (!allowed) {
    return ROLE_TAB_ACCESS[USER_ROLES.TEACHER];
  }
  return APP_TABS.filter((tab) => allowed.includes(tab.id));
}

export function canAccessTab(role, tabId) {
  const allowed = ROLE_TAB_ACCESS[role] ?? ROLE_TAB_ACCESS[USER_ROLES.TEACHER];
  return allowed.includes(tabId);
}

export function canEditSiteLists(role) {
  return ROLES_THAT_EDIT_SITE_LISTS.has(role);
}

export function canSuggestSiteLists(role) {
  return ROLES_THAT_SUGGEST_SITE_LISTS.has(role);
}

export function canReviewSiteListSuggestions(role) {
  return ROLES_THAT_REVIEW_SITE_LIST_SUGGESTIONS.has(role);
}

export function canClearAllAlerts(role) {
  return role === USER_ROLES.ADMIN;
}

export function canManageNotificationSettings(role) {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.IT;
}

export function getDefaultTabForRole(role) {
  if (role === USER_ROLES.STUDENT) {
    return "site-lists";
  }
  return getTabsForRole(role)[0]?.id ?? "alerts";
}
