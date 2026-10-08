import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_KEY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "mail-provenance.key"
);
let cachedKeyIdentity = "";
let cachedKey = null;
const FIELDS = [
  "id",
  "messageId",
  "externalId",
  "mailbox",
  "receivedAt",
  "source",
  "sender",
  "replyTo",
  "subject",
  "body",
  "hasAttachment",
  "spreadCount",
  "studentReportCount",
  "verifiedSchoolAccount",
];

function canonicalMessage(message) {
  const canonical = {};
  for (const field of FIELDS) {
    canonical[field] = message?.[field] ?? null;
  }
  return JSON.stringify(canonical);
}

function readStoredKey(path) {
  const value = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("Mailbox provenance key file is invalid.");
  }
  return Buffer.from(value, "hex");
}

function syncDirectory(path) {
  let handle;
  try {
    handle = openSync(path, "r");
    fsyncSync(handle);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EACCES"].includes(error?.code)) {
      throw error;
    }
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}

function loadProvenanceKey() {
  const configuredSecret = String(process.env.MAIL_PROVENANCE_SECRET ?? "");
  const path = process.env.MAIL_PROVENANCE_KEY_PATH || DEFAULT_KEY_PATH;
  const identity = configuredSecret
    ? `env:${createHash("sha256").update(configuredSecret).digest("hex")}`
    : `file:${path}`;
  if (cachedKey && cachedKeyIdentity === identity) return cachedKey;

  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("MAIL_PROVENANCE_SECRET must be at least 32 characters.");
    }
    cachedKey = createHash("sha256").update(configuredSecret).digest();
    cachedKeyIdentity = identity;
    return cachedKey;
  }

  mkdirSync(dirname(path), { recursive: true });
  try {
    cachedKey = readStoredKey(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const generated = randomBytes(32);
    let handle;
    let created = false;
    try {
      handle = openSync(path, "wx", 0o600);
      writeFileSync(handle, `${generated.toString("hex")}\n`, "utf8");
      fsyncSync(handle);
      cachedKey = generated;
      created = true;
    } catch (createError) {
      if (createError?.code !== "EEXIST") throw createError;
      cachedKey = readStoredKey(path);
    } finally {
      if (handle !== undefined) closeSync(handle);
    }
    if (created) syncDirectory(dirname(path));
  }
  cachedKeyIdentity = identity;
  return cachedKey;
}

function signMessage(message) {
  return createHmac("sha256", loadProvenanceKey())
    .update(canonicalMessage(message))
    .digest("hex");
}

export function getNotificationSourceDigest(message) {
  return createHash("sha256").update(canonicalMessage(message)).digest("hex");
}

export function attachNotificationProvenance(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    ...message,
    notificationProvenance: signMessage(message),
  }));
}

export function verifyNotificationProvenance(message) {
  if (message?.source !== "live") return false;
  const supplied = String(message?.notificationProvenance ?? "");
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(signMessage(message), "hex");
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
