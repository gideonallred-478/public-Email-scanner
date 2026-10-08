import { MAILBOX_PROVIDERS } from "../config.js";
import { pollImapMailbox, verifyImapConnection } from "./imapProvider.js";
import { pollGraphMailbox, verifyGraphConnection } from "./graphProvider.js";
import {
  pollLocalSmtpInbox,
  verifyLocalSmtpInboxConnection,
} from "./localSmtpInboxProvider.js";

export async function verifyMailboxConnection(config) {
  if (!config?.configured) {
    return {
      ok: false,
      message:
        "Mailbox not configured. Copy .env.example to .env.local and set MAILBOX_PROVIDER plus credentials.",
    };
  }

  if (config.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX) {
    return verifyLocalSmtpInboxConnection(config);
  }

  if (config.provider === MAILBOX_PROVIDERS.IMAP) {
    return verifyImapConnection(config);
  }

  if (config.provider === MAILBOX_PROVIDERS.MICROSOFT_GRAPH) {
    return verifyGraphConnection(config);
  }

  return { ok: false, message: `Unsupported provider: ${config.provider}` };
}

export async function pollMailbox(config, options = {}) {
  if (!config?.configured) {
    return { ok: false, reason: "not_configured", messages: [] };
  }

  if (config.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX) {
    const messages = await pollLocalSmtpInbox(config, options);
    return { ok: true, messages };
  }

  if (config.provider === MAILBOX_PROVIDERS.IMAP) {
    const messages = await pollImapMailbox(config, options);
    return { ok: true, messages };
  }

  if (config.provider === MAILBOX_PROVIDERS.MICROSOFT_GRAPH) {
    const messages = await pollGraphMailbox(config, options);
    return { ok: true, messages };
  }

  return { ok: false, reason: "unsupported", messages: [] };
}
