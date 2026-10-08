const AUTH_TOKEN_KEY = "senior-email-scanner-auth-token";

export function getApiBaseUrl() {
  const fromEnv = import.meta.env?.VITE_API_BASE;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return "";
}

export function getAuthToken() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!token) {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      return;
    }
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore storage failures
  }
}

export async function apiFetch(path, options = {}) {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  const headers = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body:
      options.body !== undefined && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload };
}
