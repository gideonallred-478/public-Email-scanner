const USER_REPORTS_KEY = "senior-email-scanner-user-reports";

function readReportedIds() {
  if (typeof localStorage === "undefined") return new Set();

  try {
    const raw = localStorage.getItem(USER_REPORTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeReportedIds(ids) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(USER_REPORTS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function hasUserReportedAlert(alertId) {
  if (!alertId) return false;
  return readReportedIds().has(alertId);
}

export function markUserReportedAlert(alertId) {
  if (!alertId) return;
  const ids = readReportedIds();
  ids.add(alertId);
  writeReportedIds(ids);
}

export function clearUserReportedAlerts() {
  writeReportedIds(new Set());
}
