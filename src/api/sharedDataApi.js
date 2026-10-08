import { apiFetch } from "./apiClient.js";

let sharedDataEnabled = null;

export async function fetchSharedDataStatus() {
  const result = await apiFetch("/api/shared-data/status");
  if (!result.ok || !result.payload?.enabled) {
    sharedDataEnabled = false;
    return { enabled: false };
  }
  sharedDataEnabled = true;
  return result.payload;
}

export function isSharedDataActive() {
  return sharedDataEnabled === true;
}

export function clearSharedDataCache() {
  sharedDataEnabled = null;
}

export async function loginWithServer(username, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function logoutFromServer() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

export async function fetchServerSession() {
  return apiFetch("/api/auth/session");
}

export async function fetchSharedSiteLists() {
  return apiFetch("/api/site-lists");
}

export async function addSharedSiteListDomain(category, domain) {
  return apiFetch("/api/site-lists/domains", {
    method: "POST",
    body: { category, domain },
  });
}

export async function fetchSharedSiteListSuggestions() {
  return apiFetch("/api/site-list-suggestions");
}

export async function createSharedSiteListSuggestion(category, domain, note) {
  return apiFetch("/api/site-list-suggestions", {
    method: "POST",
    body: { category, domain, note },
  });
}

export async function reviewSharedSiteListSuggestion(suggestionId, action) {
  return apiFetch(`/api/site-list-suggestions/${encodeURIComponent(suggestionId)}`, {
    method: "PATCH",
    body: { action },
  });
}

export async function fetchSharedAlerts() {
  return apiFetch("/api/alerts");
}

export async function createSharedAlert(record) {
  return apiFetch("/api/alerts", {
    method: "POST",
    body: { record },
  });
}

export async function patchSharedAlert(alertId, body) {
  return apiFetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
    body,
  });
}

export async function resolveSharedAlerts(ids) {
  return apiFetch("/api/alerts/resolve", {
    method: "POST",
    body: { ids },
  });
}

export async function removeSharedAlerts(ids) {
  return apiFetch("/api/alerts/remove", {
    method: "POST",
    body: { ids },
  });
}

export async function clearExpiredSharedSafeAlerts() {
  return apiFetch("/api/alerts/clear-expired-safe", { method: "POST" });
}

export async function clearAllSharedAlerts() {
  return apiFetch("/api/alerts", { method: "DELETE" });
}

export async function keepSharedAlertReference(alertId) {
  return apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/keep-reference`, {
    method: "POST",
  });
}

export async function releaseSharedAlertReference(alertId) {
  return apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/release-reference`, {
    method: "POST",
  });
}
