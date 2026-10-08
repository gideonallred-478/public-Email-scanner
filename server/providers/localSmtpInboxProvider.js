import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { simpleParser } from "mailparser";
import { writeJsonAtomically } from "../durableJsonFile.js";

const DEFAULT_STATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".data",
  "smtp-inbox-delivered.json"
);

function getStatePath(config) {
  return (
    config?.localSmtpInbox?.statePath ||
    process.env.SMTP_INBOX_STATE_PATH ||
    DEFAULT_STATE_PATH
  );
}

function formatAddress(addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0) return "";
  return addresses
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry?.address) {
        return entry.name ? `${entry.name} <${entry.address}>` : entry.address;
      }
      return entry?.text ?? "";
    })
    .filter(Boolean)
    .join(", ");
}

async function readDeliveredFilenames(config) {
  const statePath = getStatePath(config);
  await mkdir(dirname(statePath), { recursive: true });
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

async function writeDeliveredFilenames(config, filenames) {
  const statePath = getStatePath(config);
  await mkdir(dirname(statePath), { recursive: true });
  const list = [...filenames].sort();
  await writeJsonAtomically(statePath, list);
}

export async function markLocalSmtpInboxDelivered(config, filenames) {
  if (!Array.isArray(filenames) || filenames.length === 0) return;
  const delivered = await readDeliveredFilenames(config);
  let changed = false;
  for (const filename of filenames) {
    if (typeof filename === "string" && filename && !delivered.has(filename)) {
      delivered.add(filename);
      changed = true;
    }
  }
  if (changed) {
    await writeDeliveredFilenames(config, delivered);
  }
}

async function listInboxFiles(inboxPath) {
  const entries = await readdir(inboxPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".eml"))
    .map((entry) => entry.name)
    .sort();
}

async function parseEmlFile(inboxPath, filename) {
  const fullPath = join(inboxPath, filename);
  const [raw, fileStat] = await Promise.all([
    readFile(fullPath, "utf8"),
    stat(fullPath),
  ]);
  const parsed = await simpleParser(raw);
  const from =
    formatAddress(parsed.from?.value) ||
    formatAddress(parsed.from) ||
    "unknown@localhost";
  const subject = parsed.subject ?? "";
  const body =
    parsed.text?.trim() ||
    (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ").trim() : "");

  return {
    id: filename,
    internetMessageId:
      parsed.messageId ?? `<local-smtp-${filename.replace(/[^\w.-]+/g, "-")}@localhost>`,
    from,
    replyTo: formatAddress(parsed.replyTo?.value) || formatAddress(parsed.replyTo),
    subject,
    body,
    receivedDateTime: (
      parsed.date ?? fileStat.mtime ?? new Date()
    ).toISOString(),
    hasAttachments: Boolean(parsed.attachments?.length),
    folder: "smtp-inbox",
  };
}

function filterSince(messages, since) {
  if (!since) return messages;
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return messages;
  return messages.filter(
    (message) => new Date(message.receivedDateTime).getTime() >= sinceDate.getTime()
  );
}

function checkSmtpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolvePromise(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function verifyLocalSmtpInboxConnection(config) {
  const inboxPath = resolve(config.localSmtpInbox?.path ?? "");
  if (!inboxPath) {
    return {
      ok: false,
      message: "Set SMTP_INBOX_PATH to the harness .eml inbox folder.",
    };
  }

  try {
    await stat(inboxPath);
  } catch {
    return {
      ok: false,
      message: `SMTP inbox folder not found: ${inboxPath}`,
    };
  }

  const { host, port } = config.localSmtpInbox ?? {};
  if (host && port) {
    const reachable = await checkSmtpPort(host, port);
    if (!reachable) {
      return {
        ok: false,
        message: `Local SMTP harness not reachable at ${host}:${port}. Start smtp_harness.py first.`,
      };
    }
  }

  return {
    ok: true,
    message: `Watching ${inboxPath}${host && port ? ` (harness ${host}:${port})` : ""}`,
  };
}

export async function pollLocalSmtpInbox(config, { since, markDelivered = true } = {}) {
  const inboxPath = resolve(config.localSmtpInbox.path);
  const delivered = await readDeliveredFilenames(config);
  const filenames = await listInboxFiles(inboxPath);
  const messages = [];

  for (const filename of filenames) {
    if (delivered.has(filename)) continue;

    const message = await parseEmlFile(inboxPath, filename);
    message.mailbox = config.mailbox;
    messages.push(message);
    if (markDelivered) {
      delivered.add(filename);
    }
  }

  // When markDelivered is false, the caller is responsible for acknowledging
  // delivery only after the message has been durably persisted (see the scan
  // worker). Persisting here would mark a message delivered before it is
  // scanned, so a later persistence failure would permanently drop it.
  if (markDelivered && messages.length > 0) {
    await writeDeliveredFilenames(config, delivered);
  }

  const filtered = filterSince(messages, since);
  filtered.sort(
    (a, b) =>
      new Date(a.receivedDateTime).getTime() -
      new Date(b.receivedDateTime).getTime()
  );

  return filtered;
}
