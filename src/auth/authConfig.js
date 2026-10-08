/**
 * Hosted live mode and local development require server authentication.
 * Replace with real school SSO or backend auth before county-wide rollout.
 */

export const USER_ROLES = {
  ADMIN: "admin",
  TEACHER: "teacher",
  IT: "it",
  PRINCIPAL: "principal",
  STUDENT: "student",
};

export const ROLE_LABELS = {
  [USER_ROLES.ADMIN]: "Admin",
  [USER_ROLES.TEACHER]: "Teacher",
  [USER_ROLES.IT]: "IT",
  [USER_ROLES.PRINCIPAL]: "Principal",
  [USER_ROLES.STUDENT]: "Student",
};

/**
 * Display-only role fixtures. Authentication is always performed by the server
 * against deployment-provisioned accounts; no browser-shipped password is valid.
 */
export const LOCAL_DEV_USERS = [
  { username: "demo-admin", role: USER_ROLES.ADMIN, displayName: "demo-admin" },
  { username: "teacher", role: USER_ROLES.TEACHER, displayName: "Demo Teacher" },
  { username: "it", role: USER_ROLES.IT, displayName: "Demo IT" },
  { username: "student", role: USER_ROLES.STUDENT, displayName: "Demo Student" },
];

export function isAuthRequired(env = import.meta.env ?? {}) {
  return Boolean(env.DEV) || env.VITE_MAILBOX_LIVE === "true";
}

export function getDemoPreviewUser(env = import.meta.env ?? {}) {
  if (!env.PROD || isAuthRequired(env)) return null;
  return { username: "demo-reviewer", displayName: "Demo Reviewer", role: USER_ROLES.ADMIN };
}

export function authenticateLocalUser() {
  return null;
}

export function formatRoleLabel(role) {
  return ROLE_LABELS[role] ?? "User";
}
