import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./durableJsonFile.js";

const DEFAULT_LOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "sign-in-log.json"
);

function getLogPath() {
  return process.env.SIGN_IN_LOG_PATH ?? DEFAULT_LOG_PATH;
}
const AUDIT_STATE_VERSION = 1;
const MAX_ENTRIES = 500;
const VALID_ROLES = new Set([
  "admin",
  "principal",
  "teacher",
  "student",
  "it",
]);
const ENTRY_FIELDS = new Set([
  "id",
  "event",
  "username",
  "displayName",
  "role",
  "at",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateEntries(value) {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) {
    throw new TypeError("Sign-in audit state must be an array within capacity.");
  }
  const ids = new Set();
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).length !== ENTRY_FIELDS.size ||
      !Object.keys(entry).every((field) => ENTRY_FIELDS.has(field)) ||
      typeof entry.id !== "string" ||
      !UUID_PATTERN.test(entry.id) ||
      !["sign_in", "sign_out"].includes(entry.event) ||
      typeof entry.username !== "string" ||
      entry.username !== entry.username.trim() ||
      !entry.username ||
      entry.username.length > 120 ||
      typeof entry.displayName !== "string" ||
      entry.displayName !== entry.displayName.trim() ||
      !entry.displayName ||
      entry.displayName.length > 200 ||
      typeof entry.role !== "string" ||
      !VALID_ROLES.has(entry.role) ||
      typeof entry.at !== "string" ||
      !Number.isFinite(Date.parse(entry.at)) ||
      new Date(Date.parse(entry.at)).toISOString() !== entry.at ||
      ids.has(entry.id)
    ) {
      throw new TypeError("Sign-in audit state contains an invalid entry.");
    }
    ids.add(entry.id);
  }
  return value;
}

function normalizeAuditState(value) {
  if (Array.isArray(value)) return validateEntries(value);
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== 2 ||
    value.version !== AUDIT_STATE_VERSION ||
    !Object.hasOwn(value, "entries")
  ) {
    throw new TypeError("Sign-in audit state has an unsupported schema.");
  }
  return validateEntries(value.entries);
}

async function readEntries() {
  const logPath = getLogPath();
  await mkdir(dirname(logPath), { recursive: true });
  try {
    return normalizeAuditState(JSON.parse(await readFile(logPath, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeEntries(entries) {
  await writeJsonAtomically(getLogPath(), {
    version: AUDIT_STATE_VERSION,
    entries: validateEntries(entries),
  });
}

let signInLogTail = Promise.resolve();

function runSignInLogExclusive(operation) {
  const run = signInLogTail.then(operation, operation);
  signInLogTail = run.catch(() => {});
  return run;
}

/**
 * @param {{ event?: string, username: string, displayName?: string, role: string }} payload
 */
export async function appendSignInEvent(payload) {
  return runSignInLogExclusive(async () => {
    const username = String(payload?.username ?? "").trim();
    const role = String(payload?.role ?? "").trim();
    const event = payload?.event === "sign_out" ? "sign_out" : "sign_in";

    if (!username || !role) {
      return { ok: false, message: "username and role are required." };
    }

    const entry = {
      id: randomUUID(),
      event,
      username,
      displayName: String(payload?.displayName ?? username).trim() || username,
      role,
      at: new Date().toISOString(),
    };

    const entries = await readEntries();
    entries.push(entry);
    const trimmed =
      entries.length > MAX_ENTRIES
        ? entries.slice(entries.length - MAX_ENTRIES)
        : entries;
    await writeEntries(trimmed);

    return { ok: true, entry };
  });
}

export async function listSignInEvents() {
  const entries = await readEntries();
  return {
    ok: true,
    entries: [...entries].sort((a, b) => b.at.localeCompare(a.at)),
  };
}
