import { getRecordEmailMessage } from "./recordAnalysis.js";

export const ORIGINAL_EMAIL_DEFAULT_OPEN = false;

function safeString(value) {
  return typeof value === "string" ? value : "";
}

export function buildOriginalEmailViewModel(record) {
  const email = getRecordEmailMessage(record);
  if (!email) return null;

  return {
    messageId: safeString(email.messageId),
    from: safeString(email.sender || record?.sender),
    replyTo: safeString(email.replyTo),
    to: safeString(email.mailbox),
    subject: safeString(email.subject || record?.subject),
    receivedAt: safeString(email.receivedAt || record?.timestamp),
    body: safeString(email.body),
    hasAttachment: Boolean(email.hasAttachment),
  };
}
