import { randomUUID, timingSafeEqual } from "node:crypto";
import { getServerAuthAccounts } from "./config.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** @type {Map<string, { user: object, expiresAt: number }>} */
const sessions = new Map();

function sanitizeUser(account) {
  return {
    username: account.username,
    displayName: account.displayName,
    role: account.role,
  };
}

function secureStringEquals(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue ?? ""));
  const right = Buffer.from(String(rightValue ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function findServerAccount(username) {
  const normalizedUsername = String(username ?? "").trim().toLowerCase();
  try {
    return (
      getServerAuthAccounts().find(
        (entry) => entry.username.toLowerCase() === normalizedUsername
      ) ?? null
    );
  } catch {
    return null;
  }
}

function authenticateServerUser(username, password) {
  const account = findServerAccount(username);
  return account && secureStringEquals(account.password, password) ? account : null;
}

export function isActiveNotificationRecipientUser(username) {
  const account = findServerAccount(username);
  return Boolean(account && ["admin", "it"].includes(account.role));
}

export function loginWithCredentials(username, password) {
  const account = authenticateServerUser(username, password);
  if (!account) {
    return { ok: false, message: "Invalid username or password." };
  }

  const token = randomUUID();
  const user = sanitizeUser(account);
  sessions.set(token, {
    user,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return {
    ok: true,
    token,
    user,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
}

export function logoutSession(token) {
  if (token) {
    sessions.delete(token);
  }
  return { ok: true };
}

export function getUserFromSession(token) {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  const currentAccount = findServerAccount(session.user.username);
  if (!currentAccount) {
    sessions.delete(token);
    return null;
  }
  session.user = sanitizeUser(currentAccount);
  return session.user;
}

export function extractBearerToken(req) {
  const header = String(req.headers.authorization ?? "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}
