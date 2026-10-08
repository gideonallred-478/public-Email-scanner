import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { getAlertNotifyConfig, getSuggestionNotifyConfig } from "./config.js";
import { getGmailAccessToken } from "./providers/gmailOAuth.js";

const DEFAULT_DEDUPE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "alert-notify-dedupe.json"
);

function getDedupePath() {
  return process.env.ALERT_NOTIFY_DEDUPE_PATH ?? DEFAULT_DEDUPE_PATH;
}

async function readDedupeKeys() {
  const path = getDedupePath();
  await mkdir(dirname(path), { recursive: true });
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function rememberDedupeKey(key) {
  const keys = await readDedupeKeys();
  if (keys.includes(key)) return;
  keys.push(key);
  const trimmed = keys.length > 1000 ? keys.slice(keys.length - 1000) : keys;
  await writeFile(getDedupePath(), JSON.stringify(trimmed, null, 2), "utf8");
}

async function buildTransport(config) {
  if (config.localHarness) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: false,
      ignoreTLS: true,
      tls: { rejectUnauthorized: false },
    });
  }

  if (config.useOAuth) {
    const accessToken = await getGmailAccessToken(config);
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        type: "OAuth2",
        user: config.smtpUser,
        clientId: config.gmailOAuth.clientId,
        clientSecret: config.gmailOAuth.clientSecret,
        refreshToken: config.gmailOAuth.refreshToken,
        accessToken,
      },
    });
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

export function formatReviewEmail(payload) {
  const score = Number(payload.score);
  return {
    subject: `[Review ${score}/10] Phishing Detector alert`,
    text: [
      "Phishing Detector created an IT review alert.",
      "",
      `Risk score: ${score}/10`,
      `Alert reference: ${payload.recordId || "Unavailable"}`,
      `Scanned at: ${payload.scannedAt || "Unavailable"}`,
      "",
      "Open the authenticated Alerts dashboard to review the message.",
      "Sensitive message content is intentionally excluded from this email.",
    ].join("\n"),
  };
}

export async function sendReviewEmailNotification(payload, dependencies = {}) {
  const config = dependencies.config ?? getAlertNotifyConfig();
  if (!config.enabled || !config.configured) {
    const error = new Error("Review email delivery is not configured.");
    error.code = "review_email_not_configured";
    error.retryable = false;
    throw error;
  }
  let transport;
  try {
    transport = await (dependencies.buildTransport ?? buildTransport)(config);
  } catch (cause) {
    const error = new Error("Review email transport setup failed.", { cause });
    error.code = "review_email_transport_setup_failure";
    const providerCode = String(cause?.code ?? "").toLowerCase();
    const status = Number(cause?.responseCode ?? cause?.status);
    error.retryable =
      ![400, 401, 403, 535, 550, 551, 552, 553, 554].includes(status) &&
      !["invalid_grant", "eauth"].includes(providerCode);
    throw error;
  }
  const { subject, text } = formatReviewEmail(payload);
  const recipientHash = (recipient) =>
    createHash("sha256").update(recipient.trim().toLowerCase()).digest("hex");
  const configuredRecipientHashes = [...new Set(config.recipients.map(recipientHash))].sort();
  const priorIntendedRecipientHashes = [
    ...new Set(dependencies.deliveryState?.intendedRecipientHashes ?? []),
  ].sort();
  const intendedRecipientHashes = priorIntendedRecipientHashes.length
    ? priorIntendedRecipientHashes
    : configuredRecipientHashes;
  if (
    priorIntendedRecipientHashes.length &&
    (priorIntendedRecipientHashes.length !== configuredRecipientHashes.length ||
      priorIntendedRecipientHashes.some(
        (hash, index) => hash !== configuredRecipientHashes[index]
      ))
  ) {
    const error = new Error("Review-email recipient configuration changed during delivery.");
    error.code = "review_email_recipient_configuration_changed";
    error.retryable = false;
    error.deliveryState = {
      pendingRecipientHashes: dependencies.deliveryState?.pendingRecipientHashes ?? [],
      permanentFailureRecipientHashes:
        dependencies.deliveryState?.permanentFailureRecipientHashes ?? [],
      intendedRecipientHashes,
    };
    throw error;
  }
  const pendingHashes = new Set(
    dependencies.deliveryState?.pendingRecipientHashes ?? []
  );
  const priorPermanentHashes = new Set(
    dependencies.deliveryState?.permanentFailureRecipientHashes ?? []
  );
  const recipients = pendingHashes.size
    ? config.recipients.filter((recipient) => pendingHashes.has(recipientHash(recipient)))
    : config.recipients;
  if (!recipients.length) {
    const error = new Error("Pending review-email recipients no longer match configuration.");
    error.code = "review_email_recipient_configuration_changed";
    error.retryable = false;
    error.deliveryState = {
      pendingRecipientHashes: [...pendingHashes],
      permanentFailureRecipientHashes: [...priorPermanentHashes],
      intendedRecipientHashes,
    };
    throw error;
  }
  const failures = [];
  for (const recipient of recipients) {
    try {
      const result = await transport.sendMail({
        from: `"Phishing Detector" <${config.smtpUser}>`,
        to: recipient,
        subject,
        text,
      });
      const accepted = (result?.accepted ?? []).map((value) =>
        String(value?.address ?? value).trim().toLowerCase()
      );
      const rejected = (result?.rejected ?? []).map((value) =>
        String(value?.address ?? value).trim().toLowerCase()
      );
      const normalizedRecipient = recipient.trim().toLowerCase();
      if (!accepted.includes(normalizedRecipient) || rejected.includes(normalizedRecipient)) {
        const responseCode = Number(String(result?.response ?? "").match(/^\s*(\d{3})/)?.[1]);
        failures.push({ recipient, responseCode });
      }
    } catch (cause) {
      failures.push({ recipient, responseCode: Number(cause?.responseCode) });
    }
  }
  const isPermanentFailure = ({ responseCode }) =>
    [535, 550, 551, 552, 553, 554].includes(responseCode);
  const transientFailures = failures.filter((failure) => !isPermanentFailure(failure));
  for (const failure of failures.filter(isPermanentFailure)) {
    priorPermanentHashes.add(recipientHash(failure.recipient));
  }
  if (failures.length) {
    const error = new Error("Review email provider delivery failed for one or more recipients.");
    error.code = "review_email_provider_failure";
    error.retryable = transientFailures.length > 0;
    error.deliveryState = {
      pendingRecipientHashes: transientFailures.map(({ recipient }) =>
        recipientHash(recipient)
      ),
      permanentFailureRecipientHashes: [...priorPermanentHashes],
      intendedRecipientHashes,
    };
    throw error;
  }
  if (priorPermanentHashes.size) {
    const error = new Error("Review email has permanently rejected recipients.");
    error.code = "review_email_permanent_recipient_failure";
    error.retryable = false;
    error.deliveryState = {
      pendingRecipientHashes: [],
      permanentFailureRecipientHashes: [...priorPermanentHashes],
      intendedRecipientHashes,
    };
    throw error;
  }
  return { ok: true, delivered: recipients.length };
}

function formatSuggestionEmail(entry) {
  const category = entry.category ?? "review";
  const subject = `Site list suggestion: ${entry.domain} (${category})`;
  const lines = [
    `Domain: ${entry.domain}`,
    `Category: ${category}`,
    `Suggested by: ${entry.suggestedBy ?? "User"}`,
    entry.note ? `Note: ${entry.note}` : null,
    "",
    "Review pending suggestions in the Site Lists tab.",
  ].filter(Boolean);

  return { subject, text: lines.join("\n") };
}

/**
 * @param {object} entry
 */
export async function sendSiteListSuggestionNotification(entry) {
  const config = getSuggestionNotifyConfig();

  if (!config.enabled) {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  if (!config.configured) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const dedupeKey = `site-suggest:${entry?.id ?? entry?.domain}`;
  const prior = await readDedupeKeys();
  if (prior.includes(dedupeKey)) {
    return { ok: true, skipped: true, reason: "duplicate" };
  }

  const { subject, text } = formatSuggestionEmail(entry);
  const transport = await buildTransport(config);

  try {
    await transport.sendMail({
      from: `"Phishing Detector" <${config.smtpUser}>`,
      to: config.recipients.join(", "),
      subject,
      text,
    });
    await rememberDedupeKey(dedupeKey);
    return { ok: true, id: randomUUID() };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Failed to send suggestion email.",
    };
  }
}
