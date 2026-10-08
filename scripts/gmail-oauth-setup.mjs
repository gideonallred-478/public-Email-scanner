import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readOAuthCallbackCode } from "./oauth-callback.mjs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { OAuth2Client } from "google-auth-library";
import { readEnvFileValue, getEnvFilePath } from "../server/envFile.js";
import { GMAIL_IMAP_SCOPE } from "../server/providers/gmailOAuth.js";

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

const clientId = readEnvFileValue("GMAIL_OAUTH_CLIENT_ID");
const clientSecret = readEnvFileValue("GMAIL_OAUTH_CLIENT_SECRET");

if (!clientId || !clientSecret) {
  console.error(
    "Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in .env.local first."
  );
  console.error(
    "Create a Desktop OAuth client at https://console.cloud.google.com/apis/credentials"
  );
  process.exit(1);
}

console.log(`
=== Gmail OAuth setup ===

You do NOT need Google "dev approval" for personal use. Keep the app in Testing:

  Google Cloud → OAuth consent screen
    • Publishing status: Testing (not Production)
    • Test users → Add: your-test-account@example.com
  Google Cloud → Library → enable "Gmail API"

Only authorize your own reviewed test application and test mailbox. Community testers should use the local synthetic demo instead.
`);

const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);
const oauthState = randomBytes(32).toString("base64url");
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [GMAIL_IMAP_SCOPE],
  state: oauthState,
});

async function saveRefreshToken(tokens) {
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke app access at https://myaccount.google.com/permissions and run again."
    );
  }

  const envPath = getEnvFilePath();
  if (!envPath) {
    throw new Error(".env.local not found.");
  }

  const fs = await import("node:fs/promises");
  let contents = await fs.readFile(envPath, "utf8");
  const line = `GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`;

  if (/^GMAIL_OAUTH_REFRESH_TOKEN=/m.test(contents)) {
    contents = contents.replace(/^GMAIL_OAUTH_REFRESH_TOKEN=.*$/m, line);
  } else {
    contents = `${contents.trimEnd()}\n${line}\n`;
  }

  await fs.writeFile(envPath, contents, "utf8");
}

function extractAuthCode(raw) {
  const value = raw.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.searchParams.get("code");
  } catch {
    return value;
  }
}

async function exchangeCode(code) {
  const { tokens } = await oauth2Client.getToken(code);
  await saveRefreshToken(tokens);
  console.log("\nRefresh token saved to .env.local");
  console.log("Run: npm run test:mail");
}

async function promptForManualCode() {
  console.log(
    "\nIf the browser could not redirect back to PowerShell, paste either:\n" +
      "  • the full redirect URL from the address bar, or\n" +
      "  • just the code= value Google shows\n"
  );

  const rl = createInterface({ input, output });
  const pasted = await rl.question("Paste URL or code (or Enter to quit): ");
  rl.close();

  const code = extractAuthCode(pasted);
  if (!code) {
    console.error("No code provided.");
    process.exit(1);
  }

  await exchangeCode(code);
}

async function runLoopbackServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI);

      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      let code;
      try {
        code = readOAuthCallbackCode(url, oauthState);
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("OAuth callback rejected. Restart setup if authorization was declined.");
        return;
      }

      try {
        await exchangeCode(code);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<h2>Gmail linked</h2><p>Refresh token saved. Close this tab and run <code>npm run test:mail</code></p>"
        );
        server.close();
        resolve();
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("OAuth exchange failed. Check your private local configuration.");
        server.close();
        reject(err);
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      console.log("1. Open this URL in your browser and sign in as your-test-account@example.com:\n");
      console.log(authUrl);
      console.log("\n2. Waiting for Google to redirect to http://127.0.0.1:" + PORT + " …\n");
    });

    server.on("error", reject);
  });
}

const codeArg = process.argv.find((arg) => arg.startsWith("--code="));
if (codeArg) {
  await exchangeCode(codeArg.slice("--code=".length));
  process.exit(0);
}

try {
  await runLoopbackServer();
  process.exit(0);
} catch (error) {
  console.error(
    "\nAutomatic redirect failed:",
    error instanceof Error ? error.message : error
  );
  await promptForManualCode();
}
