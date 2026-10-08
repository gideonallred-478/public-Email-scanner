import { describeSecretLoad } from "../envFile.js";

import { hasGmailOAuth } from "./gmailOAuth.js";



function isGmailHost(host) {

  return host === "imap.gmail.com" || /(^|\.)gmail\.com$/i.test(host ?? "");

}



export function formatImapAuthError(error, config) {

  const detail =

    error?.response ??

    (error instanceof Error ? error.message : "IMAP connection failed.");



  if (!/AUTHENTICATIONFAILED|Invalid credentials|authentication failed/i.test(detail)) {

    return detail;

  }



  const passwordInfo = describeSecretLoad("IMAP_PASSWORD");

  const hints = [];



  if (passwordInfo.fromFileLength > 0 && passwordInfo.normalizedLength !== 16) {

    hints.push(

      `App Password in .env.local is ${passwordInfo.normalizedLength} characters after cleanup (Gmail expects 16). Save the file (Ctrl+S) and paste the full 16-character password.`

    );

  }



  if (passwordInfo.truncatedByDotenv) {

    hints.push(

      "Spaced App Password was truncated — the mail bridge now reads the full line from .env.local; save the file and retry."

    );

  }



  if (isGmailHost(config?.imap?.host)) {

    hints.push(

      "In Gmail: Settings → See all settings → Forwarding and POP/IMAP → enable IMAP."

    );

    hints.push(

      "Confirm 2-Step Verification is on, then create a new App Password at https://myaccount.google.com/apppasswords"

    );

    if (!hasGmailOAuth(config)) {

      hints.push(

        "If App Passwords keep failing, use Gmail OAuth: add GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET to .env.local, then run npm run gmail:auth"

      );

    }

  }



  if (hints.length === 0) {

    return `Gmail rejected the login: ${detail}`;

  }



  return `Gmail rejected the login: ${detail}\n\n${hints.map((hint) => `• ${hint}`).join("\n")}`;

}


