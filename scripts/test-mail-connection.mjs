import { getServerMailboxConfig } from "../server/config.js";
import { verifyMailboxConnection } from "../server/providers/index.js";
import { describeSecretLoad } from "../server/envFile.js";
import { hasGmailOAuth } from "../server/providers/gmailOAuth.js";

const config = getServerMailboxConfig();
const passwordInfo = describeSecretLoad("IMAP_PASSWORD");

console.log(`Mailbox: ${config.mailbox}`);
console.log(`Provider: ${config.provider}`);
console.log(`Configured: ${config.configured}`);
console.log(`Auth mode: ${hasGmailOAuth(config) ? "Gmail OAuth" : "App password"}`);
console.log(
  `App password loaded: ${passwordInfo.normalizedLength} chars` +
    (passwordInfo.normalizedLength !== 16
      ? " (expected 16 — save .env.local or wrap spaced passwords in quotes)"
      : "")
);

if (passwordInfo.truncatedByDotenv) {
  console.warn(
    "\nWarning: spaced App Password may have been truncated before — now reading full line from .env.local."
  );
}

if (!config.configured) {
  console.error("\nNot configured. Copy .env.example to .env.local and fill in credentials.");
  process.exit(1);
}

const result = await verifyMailboxConnection(config);

if (result.ok) {
  console.log("\nConnected successfully.");
  process.exit(0);
}

console.error("\nConnection failed:");
console.error(result.message);

if (!hasGmailOAuth(config)) {
  console.error(
    "\nNext steps:" +
      "\n  1. Save .env.local (Ctrl+S) after pasting your App Password" +
      "\n  2. Use quotes if it has spaces: IMAP_PASSWORD=\"xxxx xxxx xxxx xxxx\"" +
      "\n  3. Or run Gmail OAuth (more reliable): npm run gmail:auth"
  );
}

process.exit(1);
