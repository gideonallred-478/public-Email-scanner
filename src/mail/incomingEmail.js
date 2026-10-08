/**
 * Normalized incoming message — one object per email that triggers a scan.
 */

import { DEFAULT_MAILBOX_ADDRESS } from "./mailboxConfig.js";

export { DEFAULT_MAILBOX_ADDRESS };

export const EMAIL_SOURCE = {
  DEMO: "demo",
  LIVE: "live",
};

const DEMO_MESSAGE_DOMAIN = "local";

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/**
 * @param {object} input
 * @param {{ scenarioId?: string|null, receivedAt?: string, source?: string, externalId?: string|null, messageId?: string, mailbox?: string, mailboxId?: string|null }} [meta]
 */
export function createIncomingEmailMessage(input, meta = {}) {
  const receivedAt = meta.receivedAt ?? new Date().toISOString();
  const source = meta.source ?? EMAIL_SOURCE.DEMO;
  const scenarioId = meta.scenarioId ?? null;
  const slugBase =
    scenarioId ??
    meta.externalId ??
    (safeString(input?.subject, "inbound")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") ||
      "inbound");
  const slug = String(slugBase)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  const stamp = Date.now();
  const mailboxId = safeString(meta.mailboxId).trim();

  return {
    id: `email-${stamp}-${Math.random().toString(36).slice(2, 9)}`,
    messageId:
      meta.messageId ?? `<${slug}.${stamp}@${DEMO_MESSAGE_DOMAIN}>`,
    mailbox: meta.mailbox ?? DEFAULT_MAILBOX_ADDRESS,
    mailboxId: mailboxId || null,
    receivedAt,
    source,
    externalId: meta.externalId ?? null,
    scenarioId,
    sender: safeString(input?.sender).trim(),
    replyTo: safeString(input?.replyTo).trim(),
    subject: safeString(input?.subject).trim(),
    body: safeString(input?.body),
    hasAttachment: Boolean(input?.hasAttachment),
    spreadCount: input?.spreadCount ?? 1,
    studentReportCount: input?.studentReportCount ?? 0,
    verifiedSchoolAccount: Boolean(input?.verifiedSchoolAccount),
  };
}

/**
 * Map a provider payload into our normalized live message.
 * @param {object} payload
 */
export function normalizeLiveEmailMessage(payload, config) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Live email payload must be an object.");
  }

  return createIncomingEmailMessage(
    {
      sender: payload.from ?? payload.sender,
      replyTo: payload.replyTo,
      subject: payload.subject,
      body: payload.body ?? payload.bodyPreview ?? payload.bodyContent,
      hasAttachment: Boolean(payload.hasAttachments ?? payload.hasAttachment),
    },
    {
      source: EMAIL_SOURCE.LIVE,
      messageId: payload.internetMessageId ?? payload.messageId,
      externalId: payload.id ?? payload.uid ?? null,
      receivedAt:
        payload.receivedDateTime ?? payload.date ?? new Date().toISOString(),
      mailbox: config?.mailbox ?? DEFAULT_MAILBOX_ADDRESS,
      // Only an explicit mailboxId opts into mailbox-scoped identity. Legacy
      // single-mailbox installs leave this null so existing dedupe keys remain
      // stable across the upgrade.
      mailboxId: config?.mailboxId ?? null,
    }
  );
}

/** @param {ReturnType<createIncomingEmailMessage>} emailMessage */
export function incomingEmailToScanInput(emailMessage) {
  if (!emailMessage) return null;

  return {
    sender: emailMessage.sender ?? "",
    replyTo: emailMessage.replyTo ?? "",
    subject: emailMessage.subject ?? "",
    body: emailMessage.body ?? "",
    hasAttachment: Boolean(emailMessage.hasAttachment),
    spreadCount: emailMessage.spreadCount ?? 1,
    studentReportCount: emailMessage.studentReportCount ?? 0,
    verifiedSchoolAccount: Boolean(emailMessage.verifiedSchoolAccount),
  };
}

export function formatMailboxLabel(email) {
  if (!email?.mailbox) return DEFAULT_MAILBOX_ADDRESS;
  return email.mailbox;
}
