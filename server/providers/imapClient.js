import { ImapFlow } from "imapflow";
import { hasGmailOAuth, getGmailAccessToken } from "./gmailOAuth.js";

function isGmailHost(host) {
  return host === "imap.gmail.com" || /(^|\.)gmail\.com$/i.test(host ?? "");
}

export async function createImapClient(config) {
  const { imap } = config;
  const auth = { user: imap.user };

  if (isGmailHost(imap.host) && hasGmailOAuth(config)) {
    auth.accessToken = await getGmailAccessToken(config);
  } else if (imap.password) {
    auth.pass = imap.password;
  } else {
    throw new Error(
      "IMAP password missing. Save your App Password in .env.local or run npm run gmail:auth for OAuth."
    );
  }

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.tls,
    auth,
    logger: false,
    tls: imap.tls
      ? {
          servername: imap.host,
        }
      : undefined,
  });

  client.on("error", () => {
    // imapflow may emit after disconnect; avoid crashing the mail bridge.
  });

  return client;
}
