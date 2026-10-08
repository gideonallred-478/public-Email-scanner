import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createImapClient } from "./imapClient.js";
import { formatImapAuthError } from "./imapErrors.js";
import { resolveImapScanFolders } from "./imapScanFolders.js";

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

export async function parseImapMessageSource(source) {
  if (!source) return { text: "", html: "" };
  const parsed = await simpleParser(source);
  return {
    text: parsed.text ?? "",
    html: parsed.html ?? "",
    messageId: parsed.messageId ?? null,
    replyTo: formatAddress(parsed.replyTo?.value) || formatAddress(parsed.replyTo),
  };
}

function buildSearchQuery({ since, lookbackHours }) {
  const sinceDate = since ? new Date(since) : null;
  if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
    return { since: sinceDate };
  }

  const hours =
    Number.isFinite(lookbackHours) && lookbackHours > 0 ? lookbackHours : 48;
  return { since: new Date(Date.now() - hours * 60 * 60 * 1000) };
}

function messageDedupeKey(parsed, envelope, folderPath, uid) {
  return (
    parsed.messageId ??
    envelope?.messageId ??
    `${folderPath}:${uid}`
  );
}

async function listMailboxes(client) {
  return await client.list();
}

export async function pollImapMailbox(config, { since } = {}) {
  const { imap, mailbox, lookbackHours } = config;
  const client = await createImapClient(config);
  const searchQuery = buildSearchQuery({ since, lookbackHours });
  const messagesByKey = new Map();

  try {
    await client.connect();
    const listed = await listMailboxes(client);
    const folderPaths = resolveImapScanFolders(listed);

    for (const folderPath of folderPaths) {
      const lock = await client.getMailboxLock(folderPath);

      try {
        for await (const message of client.fetch(searchQuery, {
          uid: true,
          envelope: true,
          source: true,
          internalDate: true,
        })) {
          const parsed = await parseImapMessageSource(message.source);
          const dedupeKey = messageDedupeKey(
            parsed,
            message.envelope,
            folderPath,
            message.uid
          );
          if (messagesByKey.has(dedupeKey)) continue;

          const from = formatAddress(message.envelope?.from);
          const subject = message.envelope?.subject ?? "";
          const body =
            parsed.text?.trim() ||
            (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ").trim() : "");

          messagesByKey.set(dedupeKey, {
            id: `${folderPath}:${message.uid}`,
            internetMessageId:
              parsed.messageId ??
              message.envelope?.messageId ??
              `<imap-${folderPath}-${message.uid}@${imap.host}>`,
            from,
            replyTo: parsed.replyTo,
            subject,
            body,
            receivedDateTime: (
              message.internalDate ??
              message.envelope?.date ??
              new Date()
            ).toISOString(),
            hasAttachments: Boolean(message.envelope?.attachments?.length),
            mailbox,
            folder: folderPath,
          });
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  const messages = Array.from(messagesByKey.values());
  messages.sort(
    (a, b) =>
      new Date(a.receivedDateTime).getTime() -
      new Date(b.receivedDateTime).getTime()
  );

  return messages;
}

export async function verifyImapConnection(config) {
  const client = await createImapClient(config);

  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: formatImapAuthError(error, config),
    };
  }
}
