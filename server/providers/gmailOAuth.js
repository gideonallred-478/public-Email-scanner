import { createHash } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Scope required for Gmail IMAP XOAUTH2. */
export const GMAIL_IMAP_SCOPE = "https://mail.google.com/";

const tokenCache = new Map();

export function hasGmailOAuth(config) {
  const { clientId, clientSecret, refreshToken } = config?.gmailOAuth ?? {};
  return Boolean(clientId && clientSecret && refreshToken);
}

export async function getGmailAccessToken(config) {
  const gmailOAuth = config?.gmailOAuth ?? config;
  const { clientId, clientSecret, refreshToken } = gmailOAuth ?? {};

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail OAuth not configured. Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and run npm run gmail:auth."
    );
  }

  const now = Date.now();
  const key = createHash("sha256").update(JSON.stringify([clientId, clientSecret, refreshToken])).digest("hex");
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      payload.error_description ??
      payload.error ??
      `Token refresh failed (${response.status}).`;
    throw new Error(`Gmail OAuth token refresh failed: ${detail}`);
  }

  if (!payload.access_token) {
    throw new Error("Gmail OAuth token refresh returned no access_token.");
  }

  for (const [cacheKey, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(cacheKey);
  }
  if (tokenCache.size >= 100) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(key, { token: payload.access_token, expiresAt: now + Number(payload.expires_in ?? 3600) * 1000 });
  return payload.access_token;
}

export function clearGmailOAuthCache() {
  tokenCache.clear();
}
