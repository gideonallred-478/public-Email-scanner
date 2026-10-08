function readString(env, key, fallback) {
  const value = env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readPort(env, key, fallback) {
  const raw = env?.[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const parsed = Number(String(raw).trim());
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }
  return parsed;
}

export function buildDevServiceConfig(env = process.env) {
  const bridgeHost = readString(env, "MAIL_BRIDGE_HOST", "127.0.0.1");
  const bridgeProbeHost =
    bridgeHost === "0.0.0.0" || bridgeHost === "::" ? "127.0.0.1" : bridgeHost;
  const bridgePort = readPort(env, "MAIL_BRIDGE_PORT", 8790);
  const smtpHost = readString(env, "SMTP_HOST", "127.0.0.1");
  const smtpPort = readPort(env, "SMTP_PORT", 1025);

  return {
    bridgeHost,
    bridgeProbeHost,
    bridgePort,
    bridgeStatusUrl: `http://${bridgeProbeHost}:${bridgePort}/api/mail/status`,
    frontendApiBase: readString(
      env,
      "VITE_API_BASE",
      `http://127.0.0.1:${bridgePort}`
    ),
    smtpHost,
    smtpPort,
    smtpInbox: readString(env, "SMTP_INBOX_PATH", "smtp-inbox"),
    mailboxProvider: readString(env, "MAILBOX_PROVIDER", "local-smtp-inbox"),
    mailboxAddress: readString(env, "MAILBOX_ADDRESS", "tester@localhost"),
  };
}

export function shouldManageLocalSmtp(env = process.env) {
  return (
    readString(env, "MAILBOX_PROVIDER", "local-smtp-inbox") === "local-smtp-inbox" ||
    readString(env, "SMTP_LOCAL_HARNESS", "false").toLowerCase() === "true"
  );
}

export function isScannerSmtpGreeting(value) {
  return /^220 localhost Security Email Scanner SMTP harness$/i.test(
    typeof value === "string" ? value.trim() : ""
  );
}

export function isMatchingScannerBridgeStatus(status, expected) {
  return Boolean(
    status &&
      status.service === "security-email-scanner-mail-bridge" &&
      status.connected === true &&
      status.provider === expected.mailboxProvider &&
      status.mailbox === expected.mailboxAddress
  );
}
