import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function getEnvFilePath() {
  const local = resolve(root, ".env.local");
  if (existsSync(local)) return local;
  const env = resolve(root, ".env");
  if (existsSync(env)) return env;
  return null;
}

const LINE_SPLIT = /\r?\n/;

/**
 * Read a single key from .env.local, keeping values after `=` intact
 * (dotenv truncates unquoted spaced app passwords at the first space).
 */
export function readEnvFileValue(key) {
  const path = getEnvFilePath();
  if (!path) return "";

  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(LINE_SPLIT)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith(`${key}=`)) continue;

    let value = line.slice(line.indexOf("=") + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return "";
}

/**
 * Read a secret whose value is too large or multi-line to fit a single .env
 * line (e.g. MAILBOXES_JSON, SHARED_AUTH_USERS_JSON). Set `<KEY>_FILE` to an
 * absolute path whose entire contents are the secret value. Returns "" when
 * the companion variable is absent so callers fall back to the inline value.
 */
export function readEnvFileValueFromCompanion(key) {
  const fileVar = `${key}_FILE`;
  const direct = process.env[fileVar];
  if (direct) return readSecretFromFile(direct);

  const inlinePath = getEnvFilePath();
  if (!inlinePath) return "";
  const raw = readFileSync(inlinePath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(LINE_SPLIT)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith(`${fileVar}=`)) continue;
    const value = line.slice(line.indexOf("=") + 1).trim();
    return readSecretFromFile(value);
  }
  return "";
}

function readSecretFromFile(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`${path} (referenced by a *_FILE env var) does not exist.`);
  }
  return readFileSync(resolved, "utf8").replace(/^\uFEFF/, "").trim();
}

/** Gmail app passwords ignore spaces; strip quotes and whitespace. */
export function normalizeGmailAppPassword(value) {
  if (!value) return "";
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/\s+/g, "");
}

/**
 * OAuth client secrets and refresh tokens are opaque values, not Gmail app
 * passwords. Strip surrounding quotes and trim only; never collapse internal
 * whitespace, which could corrupt a legitimate token.
 */
export function normalizeOAuthSecret(value) {
  if (!value) return "";
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function describeSecretLoad(key) {
  const fromFile = readEnvFileValue(key);
  const fromProcess = process.env[key] ?? "";
  const normalized = normalizeGmailAppPassword(fromFile || fromProcess);

  return {
    fromFileLength: fromFile.length,
    fromProcessLength: fromProcess.length,
    normalizedLength: normalized.length,
    truncatedByDotenv:
      Boolean(fromFile) &&
      fromProcess.length > 0 &&
      fromProcess.length < fromFile.replace(/\s+/g, "").length,
  };
}
