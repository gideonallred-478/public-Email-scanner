import { existsSync } from "node:fs";

import { resolve, dirname } from "node:path";

import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import {
  normalizeGmailAppPassword,
  normalizeOAuthSecret,
  readEnvFileValue,
  readEnvFileValueFromCompanion,
} from "./envFile.js";

import { hasGmailOAuth } from "./providers/gmailOAuth.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localEnv = resolve(root, ".env.local");
const defaultEnv = resolve(root, ".env");

if (existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
} else if (existsSync(defaultEnv)) {
  dotenv.config({ path: defaultEnv });
}

export const MAILBOX_PROVIDERS = {
  DEMO: "demo",
  MICROSOFT_GRAPH: "microsoft-graph",
  IMAP: "imap",
  LOCAL_SMTP_INBOX: "local-smtp-inbox",
};

const PILOT_MAILBOX_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_PILOT_MAILBOXES = 10;
const SUPPORTED_LIVE_MAILBOX_PROVIDERS = new Set([
  MAILBOX_PROVIDERS.MICROSOFT_GRAPH,
  MAILBOX_PROVIDERS.IMAP,
  MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX,
]);

function readEnv(key, fallback = "") {
  const value = process.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readSecret(key) {
  const fromFile = readEnvFileValue(key);
  if (fromFile) return fromFile;
  return readEnv(key);
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : fallback;
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function buildLegacyMailboxConfig() {
  const provider = readEnv("MAILBOX_PROVIDER", MAILBOX_PROVIDERS.DEMO);
  const mailbox = readEnv("MAILBOX_ADDRESS", "inbox@local");

  const microsoftGraph = {
    tenantId: readEnv("MS_GRAPH_TENANT_ID"),
    clientId: readEnv("MS_GRAPH_CLIENT_ID"),
    clientSecret: normalizeOAuthSecret(readSecret("MS_GRAPH_CLIENT_SECRET")),
    mailbox: readEnv("MS_GRAPH_MAILBOX", mailbox),
  };

  const imap = {
    host: readEnv("IMAP_HOST"),
    port: normalizePort(readEnv("IMAP_PORT", "993"), 993),
    user: readEnv("IMAP_USER", mailbox),
    password: normalizeGmailAppPassword(readSecret("IMAP_PASSWORD")),
    tls: readEnv("IMAP_TLS", "true") !== "false",
  };

  const gmailOAuth = {
    clientId: readEnv("GMAIL_OAUTH_CLIENT_ID"),
    clientSecret: normalizeOAuthSecret(readSecret("GMAIL_OAUTH_CLIENT_SECRET")),
    refreshToken: normalizeOAuthSecret(readSecret("GMAIL_OAUTH_REFRESH_TOKEN")),
  };

  const smtpHost = readEnv("SMTP_HOST", "127.0.0.1");
  const smtpPort = normalizePort(readEnv("SMTP_PORT", "1025"), 1025);
  const localSmtpInbox = {
    path: readEnv(
      "SMTP_INBOX_PATH",
      resolve(root, "smtp-inbox")
    ),
    statePath: readEnv("SMTP_INBOX_STATE_PATH"),
    host: smtpHost,
    port: smtpPort,
  };

  const config = {
    id: "default",
    mailboxId: null,
    label: mailbox,
    provider,
    mailbox,
    lookbackHours: normalizePositiveNumber(
      readEnv("MAILBOX_LOOKBACK_HOURS", "48"),
      48
    ),
    microsoftGraph,
    imap,
    gmailOAuth,
    localSmtpInbox,
  };

  return {
    ...config,
    configured: isMailboxConfigured(config),
  };
}

function normalizeRegistryMailbox(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`MAILBOXES_JSON entry ${index + 1} must be an object.`);
  }

  const id = String(entry.id ?? "").trim();
  if (!PILOT_MAILBOX_ID_PATTERN.test(id)) {
    throw new Error(
      "Each pilot mailbox ID must start with a lowercase letter or number and use only lowercase letters, numbers, underscores, or hyphens."
    );
  }

  const provider = String(entry.provider ?? "").trim().toLowerCase();
  if (!SUPPORTED_LIVE_MAILBOX_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported mailbox provider for ${id || `entry ${index + 1}`}.`);
  }

  const mailbox = String(entry.mailbox ?? "").trim();
  if (!mailbox) {
    throw new Error(`Pilot mailbox ${id} requires a mailbox address.`);
  }

  const label = String(entry.label ?? id).trim() || id;
  if (label.length > 120) {
    throw new Error(`Pilot mailbox ${id} label must be 120 characters or fewer.`);
  }

  const graphInput = entry.microsoftGraph ?? {};
  const imapInput = entry.imap ?? {};
  const oauthInput = entry.gmailOAuth ?? {};
  const localInput = entry.localSmtpInbox ?? {};

  const microsoftGraph = {
    tenantId: String(graphInput.tenantId ?? "").trim(),
    clientId: String(graphInput.clientId ?? "").trim(),
    clientSecret: normalizeOAuthSecret(String(graphInput.clientSecret ?? "")),
    mailbox: String(graphInput.mailbox ?? mailbox).trim(),
  };

  const imap = {
    host: String(imapInput.host ?? "").trim(),
    port: normalizePort(imapInput.port, 993),
    user: String(imapInput.user ?? mailbox).trim(),
    password: normalizeGmailAppPassword(String(imapInput.password ?? "")),
    tls: normalizeBoolean(imapInput.tls, true),
  };

  const gmailOAuth = {
    clientId: String(oauthInput.clientId ?? "").trim(),
    clientSecret: normalizeOAuthSecret(String(oauthInput.clientSecret ?? "")),
    refreshToken: normalizeOAuthSecret(String(oauthInput.refreshToken ?? "")),
  };

  const localSmtpInbox = {
    path: String(localInput.path ?? "").trim(),
    statePath: String(localInput.statePath ?? "").trim(),
    host: String(localInput.host ?? "127.0.0.1").trim() || "127.0.0.1",
    port: normalizePort(localInput.port, 1025),
  };

  const config = {
    id,
    mailboxId: id,
    label,
    provider,
    mailbox,
    lookbackHours: normalizePositiveNumber(entry.lookbackHours, 48),
    microsoftGraph,
    imap,
    gmailOAuth,
    localSmtpInbox,
  };

  if (!isMailboxConfigured(config)) {
    throw new Error(`Pilot mailbox ${id} is not fully configured for ${provider}.`);
  }

  return {
    ...config,
    configured: true,
  };
}

export function getServerMailboxConfigs() {
  const raw =
    readEnvFileValueFromCompanion("MAILBOXES_JSON") ||
    readSecret("MAILBOXES_JSON").trim();
  if (!raw) return [buildLegacyMailboxConfig()];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MAILBOXES_JSON must be valid JSON.");
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > MAX_PILOT_MAILBOXES
  ) {
    throw new Error(
      `MAILBOXES_JSON must contain between 1 and ${MAX_PILOT_MAILBOXES} mailbox entries.`
    );
  }

  const configs = parsed.map(normalizeRegistryMailbox);
  const ids = new Set();
  const addresses = new Set();

  for (const config of configs) {
    const normalizedId = config.id.toLowerCase();
    const normalizedMailbox = config.mailbox.toLowerCase();
    if (ids.has(normalizedId)) {
      throw new Error("MAILBOXES_JSON requires unique mailbox IDs.");
    }
    if (addresses.has(normalizedMailbox)) {
      throw new Error("MAILBOXES_JSON requires unique mailbox addresses.");
    }
    ids.add(normalizedId);
    addresses.add(normalizedMailbox);
  }

  return configs;
}

export function getServerMailboxConfig() {
  return getServerMailboxConfigs()[0];
}

export function isMailboxConfigured(config) {
  if (!config || config.provider === MAILBOX_PROVIDERS.DEMO) {
    return false;
  }

  if (config.provider === MAILBOX_PROVIDERS.MICROSOFT_GRAPH) {
    const { tenantId, clientId, clientSecret, mailbox } =
      config.microsoftGraph ?? {};
    return Boolean(tenantId && clientId && clientSecret && mailbox);
  }

  if (config.provider === MAILBOX_PROVIDERS.IMAP) {
    const { host, user, password } = config.imap ?? {};
    const oauth = config.gmailOAuth ?? {};
    const hasOAuth = Boolean(
      oauth.clientId && oauth.clientSecret && oauth.refreshToken
    );
    return Boolean(host && user && (password || hasOAuth));
  }

  if (config.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX) {
    return Boolean(config.localSmtpInbox?.path);
  }

  return false;
}

export function isSharedDataEnabled() {
  return readEnv("SHARED_DATA_ENABLED", "true").toLowerCase() !== "false";
}

export function getMailBridgeHost() {
  return readEnv("MAIL_BRIDGE_HOST", "127.0.0.1");
}

const SERVER_AUTH_ROLES = new Set(["admin", "teacher", "it", "principal", "student"]);

export function getServerAuthAccounts() {
  const raw =
    readEnvFileValueFromCompanion("SHARED_AUTH_USERS_JSON") ||
    readSecret("SHARED_AUTH_USERS_JSON").trim();
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SHARED_AUTH_USERS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("SHARED_AUTH_USERS_JSON must contain at least one account.");
  }

  const usernames = new Set();
  return parsed.map((entry) => {
    const username = String(entry?.username ?? "").trim();
    const password = String(entry?.password ?? "");
    const role = String(entry?.role ?? "").trim().toLowerCase();
    const displayName = String(entry?.displayName ?? username).trim();
    const normalizedUsername = username.toLowerCase();
    if (!username || !displayName || !SERVER_AUTH_ROLES.has(role)) {
      throw new Error("Each shared authentication account needs a username, display name, and valid role.");
    }
    const localDevAuth =
      readEnv("LOCAL_DEV_AUTH", "false").toLowerCase() === "true" &&
      isLoopbackHost();
    if (password.length < (localDevAuth ? 9 : 12)) {
      throw new Error("Shared authentication passwords must be at least 12 characters.");
    }
    if (usernames.has(normalizedUsername)) {
      throw new Error("Shared authentication usernames must be unique.");
    }
    usernames.add(normalizedUsername);
    return { username, password, role, displayName };
  });
}

export function isLoopbackHost(host = getMailBridgeHost()) {
  const normalized = String(host).trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

export function getCorsAllowedOrigins() {
  const configured = readEnv("CORS_ALLOWED_ORIGINS");
  const values = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : ["http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:5190"];
  return new Set(
    values.map((value) => {
      const url = new URL(value);
      if (url.origin !== value || !["http:", "https:"].includes(url.protocol)) {
        throw new Error("CORS_ALLOWED_ORIGINS entries must be exact HTTP(S) origins.");
      }
      return url.origin;
    })
  );
}

export function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  try {
    return getCorsAllowedOrigins().has(new URL(origin).origin) && new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

export function validateServerSecurityConfiguration() {
  if (!isSharedDataEnabled()) {
    throw new Error("The mail bridge requires authenticated shared-data mode.");
  }
  const accounts = getServerAuthAccounts();
  if (!accounts.length) {
    throw new Error(
      "The mail bridge requires server-provisioned authentication accounts."
    );
  }
  return {
    ok: true,
    mode: isLoopbackHost() ? "local-authenticated" : "shared-authenticated",
  };
}

export function getAlertNotifyConfig() {
  const enabled = readEnv("ALERT_NOTIFY_ENABLED", "false").toLowerCase() === "true";

  const recipients = readEnv("ALERT_NOTIFY_TO", "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const mailboxConfig = getServerMailboxConfig();
  const localHarness =
    readEnv("SMTP_LOCAL_HARNESS", "false").toLowerCase() === "true" ||
    mailboxConfig.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX;

  const smtpHost = readEnv(
    "SMTP_HOST",
    localHarness ? "127.0.0.1" : "smtp.gmail.com"
  );
  const smtpPortRaw = Number(readEnv("SMTP_PORT", localHarness ? "1025" : "587"));
  const smtpPort = Number.isFinite(smtpPortRaw) ? smtpPortRaw : localHarness ? 1025 : 587;
  const smtpUser =
    readEnv("SMTP_USER") ||
    readEnv("IMAP_USER") ||
    (localHarness ? "scanner@localhost" : "");
  const smtpPass = readSecret("SMTP_PASSWORD") || readSecret("IMAP_PASSWORD");
  const useOAuth = !localHarness && hasGmailOAuth(mailboxConfig);

  const configured = localHarness
    ? Boolean(recipients.length && smtpHost)
    : Boolean(recipients.length && smtpHost && smtpUser && (smtpPass || useOAuth));

  return {
    enabled,
    recipients,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    useOAuth,
    localHarness,
    gmailOAuth: mailboxConfig.gmailOAuth,
    configured,
  };
}

export function getWebPushAllowedHosts() {
  const defaults = [
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
    "web.push.apple.com",
    "notify.windows.com",
  ];
  const configured = readEnv("WEB_PUSH_ALLOWED_HOSTS", "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...defaults, ...configured]);
}

export function getWebPushConfig() {
  const enabled = readEnv("ALERT_NOTIFY_ENABLED", "false").toLowerCase() === "true";
  const publicKey = readEnv("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = readSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
  const subject = readEnv("WEB_PUSH_VAPID_SUBJECT", "mailto:security@localhost");
  return {
    enabled,
    publicKey,
    privateKey,
    subject,
    configured: Boolean(enabled && publicKey && privateKey && subject),
  };
}

export function getNotificationWorkerConfig() {
  const enabled = readEnv("ALERT_NOTIFY_ENABLED", "false").toLowerCase() === "true";
  const pollIntervalRaw = Number(readEnv("ALERT_NOTIFY_POLL_INTERVAL_MS", "5000"));
  const maxAttemptsRaw = Number(readEnv("ALERT_NOTIFY_MAX_ATTEMPTS", "5"));
  return {
    enabled,
    pollIntervalMs:
      Number.isFinite(pollIntervalRaw) && pollIntervalRaw >= 1000
        ? Math.min(pollIntervalRaw, 60_000)
        : 5000,
    maxAttempts:
      Number.isInteger(maxAttemptsRaw) && maxAttemptsRaw >= 1
        ? Math.min(maxAttemptsRaw, 10)
        : 5,
  };
}

export function getSuggestionNotifyConfig() {
  const alertConfig = getAlertNotifyConfig();
  const enabled =
    readEnv("SUGGESTION_NOTIFY_ENABLED", alertConfig.enabled ? "true" : "false")
      .toLowerCase() === "true";
  const recipients =
    readEnv("SUGGESTION_NOTIFY_TO", readEnv("ALERT_NOTIFY_TO", ""))
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  return {
    enabled,
    recipients: recipients.length ? recipients : alertConfig.recipients,
    smtpHost: alertConfig.smtpHost,
    smtpPort: alertConfig.smtpPort,
    smtpUser: alertConfig.smtpUser,
    smtpPass: alertConfig.smtpPass,
    useOAuth: alertConfig.useOAuth,
    localHarness: alertConfig.localHarness,
    gmailOAuth: alertConfig.gmailOAuth,
    configured: alertConfig.configured && (recipients.length || alertConfig.recipients.length),
  };
}
