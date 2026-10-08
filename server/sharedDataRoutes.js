import {
  extractBearerToken,
  getUserFromSession,
  loginWithCredentials,
  logoutSession,
} from "./authSessions.js";
import {
  canEditSiteLists,
  canReviewSiteListSuggestions,
  canSuggestSiteLists,
} from "./rolePermissions.js";
import { addSiteListDomain, getSiteLists } from "./siteListsService.js";
import {
  createSiteListSuggestion,
  getSiteListSuggestions,
  reviewSiteListSuggestion,
} from "./siteListSuggestionsService.js";
import { sendSiteListSuggestionNotification } from "./alertNotifier.js";
import { appendSignInEvent, listSignInEvents } from "./signInLog.js";
import { isSharedDataEnabled, getAlertNotifyConfig, getWebPushConfig } from "./config.js";
import { getNotificationChannelCapabilities } from "./notificationTransports.js";
import { canonicalizeNotificationAlert } from "./notificationAlertVerifier.js";
import {
  addSharedAlert,
  clearAllSharedAlerts,
  clearExpiredSharedSafeRecords,
  getNotificationStatus,
  getSharedAlertById,
  getSharedAlerts,
  keepSharedAlertForReference,
  patchSharedAlert,
  releaseSharedAlertReference,
  removePushSubscription,
  removePushSubscriptionByHash,
  removeSharedAlerts,
  resolveSharedAlerts,
  replaceSharedAlert,
  updateSharedAlertStatus,
  upsertPushSubscription,
} from "./alertsService.js";
import {
  canAccessAlerts,
  canClearAllAlerts,
  canManageNotificationSettings,
} from "./rolePermissions.js";

function unauthorized(message = "Authentication required.") {
  return { status: 401, body: { ok: false, message } };
}

function forbidden(message = "Not allowed for your role.") {
  return { status: 403, body: { ok: false, message } };
}

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10;
const MAX_GLOBAL_LOGIN_ATTEMPTS_PER_WINDOW = 100;
const MAX_LOGIN_THROTTLE_KEYS = 1000;
const loginAttempts = new Map();
let globalLoginWindow = { count: 0, resetAt: 0 };

function consumeLoginAttempt(username, now = Date.now()) {
  if (globalLoginWindow.resetAt <= now) {
    globalLoginWindow = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  globalLoginWindow.count += 1;
  if (globalLoginWindow.count > MAX_GLOBAL_LOGIN_ATTEMPTS_PER_WINDOW) return false;

  const key = String(username ?? "").trim().toLowerCase().slice(0, 120);
  let prior = loginAttempts.get(key);
  if (!prior && loginAttempts.size >= MAX_LOGIN_THROTTLE_KEYS) {
    for (const [candidate, value] of loginAttempts) {
      if (value.resetAt <= now) loginAttempts.delete(candidate);
    }
    if (loginAttempts.size >= MAX_LOGIN_THROTTLE_KEYS) return false;
    prior = loginAttempts.get(key);
  }
  const entry =
    prior && prior.resetAt > now
      ? prior
      : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  entry.count += 1;
  loginAttempts.set(key, entry);
  return entry.count <= MAX_LOGIN_ATTEMPTS_PER_WINDOW;
}

function requireUser(req) {
  const token = extractBearerToken(req);
  const user = getUserFromSession(token);
  if (!user) {
    return { error: unauthorized() };
  }
  return { user, token };
}

export function authorizeMailboxRequest(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  return canAccessAlerts(auth.user.role) ? null : forbidden();
}

export function getSharedDataStatus() {
  return {
    ok: true,
    enabled: isSharedDataEnabled(),
    version: 1,
  };
}

export async function handleAuthLogin(body) {
  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  if (!consumeLoginAttempt(username)) {
    return {
      status: 429,
      body: { ok: false, message: "Too many login attempts. Try again later." },
    };
  }
  const result = loginWithCredentials(username, password);
  if (!result.ok) {
    return { status: 401, body: result };
  }
  let audit;
  try {
    audit = await appendSignInEvent({
      event: "sign_in",
      username: result.user.username,
      displayName: result.user.displayName,
      role: result.user.role,
    });
  } catch {
    logoutSession(result.token);
    return { status: 503, body: { ok: false, message: "Login audit failed." } };
  }
  if (!audit.ok) {
    logoutSession(result.token);
    return { status: 503, body: { ok: false, message: "Login audit failed." } };
  }
  return { status: 200, body: result };
}

export async function handleAuthLogout(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  let audit;
  try {
    audit = await appendSignInEvent({
      event: "sign_out",
      username: auth.user.username,
      displayName: auth.user.displayName,
      role: auth.user.role,
    });
  } catch {
    logoutSession(auth.token);
    return { status: 503, body: { ok: false, message: "Logout audit failed." } };
  }
  if (!audit.ok) {
    logoutSession(auth.token);
    return { status: 503, body: { ok: false, message: "Logout audit failed." } };
  }
  logoutSession(auth.token);
  return { status: 200, body: { ok: true } };
}

export async function handleAuthSession(req) {
  const user = getUserFromSession(extractBearerToken(req));
  if (!user) {
    return unauthorized();
  }
  return { status: 200, body: { ok: true, user } };
}

export async function handleGetSignInEvents(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canManageNotificationSettings(auth.user.role)) return forbidden();
  return { status: 200, body: await listSignInEvents() };
}

export async function handleGetSiteLists(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;

  const result = await getSiteLists();
  return { status: 200, body: result };
}

export async function handleAddSiteListDomain(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canEditSiteLists(auth.user.role)) {
    return forbidden();
  }

  const category = String(body?.category ?? "");
  const domain = String(body?.domain ?? "");
  const result = await addSiteListDomain(category, domain);
  return { status: result.ok ? 200 : 400, body: result };
}

export async function handleGetSiteListSuggestions(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;

  const result = await getSiteListSuggestions();
  return { status: 200, body: result };
}

export async function handleCreateSiteListSuggestion(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canSuggestSiteLists(auth.user.role)) {
    return forbidden();
  }

  const category = String(body?.category ?? "");
  const domain = String(body?.domain ?? "");
  const note = String(body?.note ?? "");
  const result = await createSiteListSuggestion(category, domain, {
    suggestedBy: auth.user.displayName ?? auth.user.username,
    note,
  });

  if (result.ok && result.entry) {
    void sendSiteListSuggestionNotification(result.entry);
  }

  return { status: result.ok ? 201 : 400, body: result };
}

export async function handleReviewSiteListSuggestion(req, suggestionId, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canReviewSiteListSuggestions(auth.user.role)) {
    return forbidden();
  }

  const action = String(body?.action ?? "");
  const result = await reviewSiteListSuggestion(suggestionId, action);
  return { status: result.ok ? 200 : 400, body: result };
}

export async function handleGetAlerts(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const result = await getSharedAlerts();
  return { status: 200, body: result };
}

export async function handleCreateAlert(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const verified = await canonicalizeNotificationAlert(body?.record);
  const result = await addSharedAlert(verified.record, {
    notificationRecord: verified.notificationRecord,
  });
  if (result.duplicate) {
    return { status: 200, body: result };
  }
  return { status: result.ok ? 201 : 400, body: result };
}

export async function handlePatchAlert(req, alertId, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  if (body?.record && typeof body.record === "object") {
    const existingRecord = await getSharedAlertById(alertId);
    if (!existingRecord) {
      return { status: 404, body: { ok: false, message: "Alert not found." } };
    }
    const verified = await canonicalizeNotificationAlert(
      {
        ...body.record,
        id: alertId,
      },
      { existingRecord }
    );
    if (verified.error) {
      return { status: 400, body: { ok: false, message: verified.error } };
    }
    const result = await replaceSharedAlert(alertId, verified.record, {
      notificationRecord: verified.notificationRecord,
      expectedNotificationSourceDigest: existingRecord.notificationSourceDigest,
    });
    return { status: result.ok ? 200 : 400, body: result };
  }

  if (body?.status) {
    const result = await updateSharedAlertStatus(alertId, String(body.status));
    return {
      status: result.ok ? 200 : 400,
      body: result,
    };
  }

  return { status: 400, body: { ok: false, message: "Invalid alert update." } };
}

export async function handleResolveAlerts(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const result = await resolveSharedAlerts(body?.ids);
  return { status: result.ok ? 200 : 400, body: result };
}

export async function handleRemoveAlerts(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const result = await removeSharedAlerts(body?.ids);
  return { status: result.ok ? 200 : 400, body: result };
}

export async function handleClearExpiredSafeAlerts(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const result = await clearExpiredSharedSafeRecords();
  return { status: 200, body: result };
}

export async function handleClearAllAlerts(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canClearAllAlerts(auth.user.role)) {
    return forbidden("Only admin can clear all alerts.");
  }

  const result = await clearAllSharedAlerts();
  return { status: 200, body: result };
}

export async function handleKeepAlertReference(req, alertId) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const result = await keepSharedAlertForReference(alertId);
  return { status: result.ok ? 200 : 400, body: result };
}

export async function handleReleaseAlertReference(req, alertId) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canAccessAlerts(auth.user.role)) {
    return forbidden();
  }

  const result = await releaseSharedAlertReference(alertId);
  return { status: result.ok ? 200 : 400, body: result };
}

export async function handleGetNotificationStatus(req) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canManageNotificationSettings(auth.user.role)) return forbidden();

  const [queue, emailConfig, webPushConfig] = await Promise.all([
    getNotificationStatus({ includeDevices: auth.user.role === "admin" }),
    Promise.resolve(getAlertNotifyConfig()),
    Promise.resolve(getWebPushConfig()),
  ]);
  return {
    status: 200,
    body: {
      ...queue,
      policy: { none: "0-4", reviewEmail: "5-7", urgentDirect: "8-10" },
      email: {
        enabled: emailConfig.enabled,
        configured: emailConfig.configured,
      },
      webPush: {
        enabled: webPushConfig.enabled,
        configured: webPushConfig.configured,
        publicKey: webPushConfig.publicKey,
      },
      channels: getNotificationChannelCapabilities(),
    },
  };
}

export async function handleUpsertPushSubscription(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canManageNotificationSettings(auth.user.role)) return forbidden();
  try {
    const result = await upsertPushSubscription(body?.subscription, {
      userId: auth.user.username,
    });
    return { status: result.created ? 201 : 200, body: result };
  } catch (error) {
    return {
      status: 400,
      body: {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid Web Push subscription.",
      },
    };
  }
}

export async function handleRemovePushSubscription(req, body) {
  const auth = requireUser(req);
  if (auth.error) return auth.error;
  if (!canManageNotificationSettings(auth.user.role)) return forbidden();
  const endpointHash = String(body?.endpointHash ?? "");
  if (endpointHash) {
    if (auth.user.role !== "admin") return forbidden();
    const result = await removePushSubscriptionByHash(endpointHash);
    return { status: result.ok ? 200 : 400, body: result };
  }

  const endpoint = String(body?.endpoint ?? "");
  if (!endpoint) {
    return { status: 400, body: { ok: false, message: "Subscription endpoint is required." } };
  }
  const result = await removePushSubscription(endpoint, {
    userId: auth.user.username,
  });
  return { status: 200, body: result };
}
