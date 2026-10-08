/**
 * Mailbox configuration — frontend display hints only.
 * Credentials live in `.env.local` on the mail bridge server (not VITE_ vars).
 */

export const MAILBOX_PROVIDERS = {
  DEMO: "demo",
  MICROSOFT_GRAPH: "microsoft-graph",
  IMAP: "imap",
  LOCAL_SMTP_INBOX: "local-smtp-inbox",
};

export const DEFAULT_MAILBOX_ADDRESS = "inbox@local";

function readEnv(key) {
  try {
    const value = import.meta.env?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : "";
  } catch {
    return "";
  }
}

/**
 * @returns {{
 *   provider: string,
 *   mailbox: string,
 *   liveEnabled: boolean,
 *   microsoftGraph: { tenantId: string, clientId: string, mailbox: string },
 *   imap: { host: string, port: number, user: string, tls: boolean },
 * }}
 */
export function resolveMailboxProvider(env = import.meta.env ?? {}) {
  const explicit = env.VITE_MAILBOX_PROVIDER;

  // Hosted builds (e.g. Vercel) ship the UI only — no local mail bridge.
  const isProd = Boolean(env.PROD);
  const liveOnWeb = env.VITE_MAILBOX_LIVE === "true";
  if (isProd && !liveOnWeb) {
    return MAILBOX_PROVIDERS.DEMO;
  }

  if (explicit) return explicit;

  return MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX;
}

export function getMailboxConfig() {
  const provider = resolveMailboxProvider();
  const mailbox = readEnv("VITE_MAILBOX_ADDRESS") || DEFAULT_MAILBOX_ADDRESS;

  const microsoftGraph = {
    tenantId: readEnv("VITE_MS_GRAPH_TENANT_ID"),
    clientId: readEnv("VITE_MS_GRAPH_CLIENT_ID"),
    mailbox: readEnv("VITE_MS_GRAPH_MAILBOX") || mailbox,
  };

  const imapPort = Number(readEnv("VITE_IMAP_PORT") || "993");
  const imap = {
    host: readEnv("VITE_IMAP_HOST"),
    port: Number.isFinite(imapPort) ? imapPort : 993,
    user: readEnv("VITE_IMAP_USER") || mailbox,
    tls: readEnv("VITE_IMAP_TLS") !== "false",
  };

  const liveEnabled = provider !== MAILBOX_PROVIDERS.DEMO;

  return {
    provider,
    mailbox,
    liveEnabled,
    microsoftGraph,
    imap,
  };
}

export function isLiveMailboxConfigured(config) {
  if (!config || config.provider === MAILBOX_PROVIDERS.DEMO) return false;
  return (
    config.provider === MAILBOX_PROVIDERS.MICROSOFT_GRAPH ||
    config.provider === MAILBOX_PROVIDERS.IMAP ||
    config.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX
  );
}

export function getMailboxStatusLabel(config) {
  if (!config || config.provider === MAILBOX_PROVIDERS.DEMO) {
    return "Demo incoming mail feed";
  }
  if (config.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX) {
    return "Local SMTP harness inbox";
  }
  return "Checking live mailbox…";
}
