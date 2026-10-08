import { pollMailbox } from "./providers/index.js";
import { markLocalSmtpInboxDelivered } from "./providers/localSmtpInboxProvider.js";
import { MAILBOX_PROVIDERS } from "./config.js";
import { getSiteLists } from "./siteListsService.js";
import { addSharedAlert } from "./alertsService.js";
import { isEmailScannedOnServer } from "./scanRegistryStore.js";
import { normalizeLiveEmailMessage } from "../src/mail/incomingEmail.js";
import { runScanForIncomingEmailMessage } from "../src/mail/processIncomingEmail.js";
import { createDashboardRecordFromScan } from "../src/scanner/alertEngine.js";
import { buildEmailDedupeKey } from "../src/scanner/scanRetention.js";
import { getDefaultScoringSettings } from "../src/scanner/scoringSettings.js";

function advanceLatestReceivedAt(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;

  const candidateMs = Date.parse(candidate);
  const currentMs = Date.parse(current);
  if (!Number.isFinite(candidateMs)) return current;
  if (!Number.isFinite(currentMs) || candidateMs > currentMs) return candidate;
  return current;
}

export async function runMailboxScanWorkerOnce({
  config,
  since,
  poll = pollMailbox,
} = {}) {
  if (!config?.configured) {
    return {
      ok: true,
      status: "idle",
      reason: "not_configured",
      polled: 0,
      processed: 0,
      duplicates: 0,
    };
  }

  const pollResult = await poll(config, { since, markDelivered: false });
  const messages = Array.isArray(pollResult?.messages) ? pollResult.messages : [];
  if (pollResult?.ok === false) {
    return {
      ok: false,
      status: "poll_failed",
      reason: pollResult.reason ?? "poll_failed",
      polled: 0,
      processed: 0,
      duplicates: 0,
    };
  }

  const siteListResult = await getSiteLists();
  const siteLists = siteListResult.lists;
  const scoringSettings = getDefaultScoringSettings();

  let processed = 0;
  let duplicates = 0;
  let latestReceivedAt = since ?? null;

  const isLocalSmtp = config?.provider === MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX;
  const ackedFilenames = [];

  for (const payload of messages) {
    const incomingEmail = normalizeLiveEmailMessage(payload, {
      mailbox: payload?.mailbox ?? config.mailbox,
      mailboxId: config.mailboxId ?? null,
    });
    latestReceivedAt = advanceLatestReceivedAt(
      latestReceivedAt,
      incomingEmail.receivedAt
    );

    const dedupeKey = buildEmailDedupeKey(incomingEmail);
    if (dedupeKey && (await isEmailScannedOnServer(dedupeKey))) {
      duplicates += 1;
      if (isLocalSmtp && typeof payload?.id === "string") {
        ackedFilenames.push(payload.id);
      }
      continue;
    }

    const scan = runScanForIncomingEmailMessage(incomingEmail, {
      siteLists,
      scoringSettings,
    });
    const record = createDashboardRecordFromScan(
      scan.parsed,
      scan.scoreResult,
      scan.actionPlan,
      scan.scoreResult.trustDecay,
      scan.scoreResult.lookalikeResult,
      siteLists,
      {
        email: scan.incomingEmail,
        scanSnapshot: scan.scanSnapshot,
      }
    );

    const saved = await addSharedAlert(record, { notificationRecord: record });
    if (saved.duplicate) {
      duplicates += 1;
      if (isLocalSmtp && typeof payload?.id === "string") {
        ackedFilenames.push(payload.id);
      }
      continue;
    }
    if (!saved.ok) {
      throw new Error(saved.message ?? "Could not persist server-scanned email.");
    }

    processed += 1;
    if (isLocalSmtp && typeof payload?.id === "string") {
      ackedFilenames.push(payload.id);
    }
  }

  // Only now that every message is durably persisted do we mark the local
  // SMTP inbox files as delivered. If any persistence failed above we threw
  // before reaching here, so the files remain un-acked and are retried next poll.
  if (isLocalSmtp && ackedFilenames.length > 0) {
    await markLocalSmtpInboxDelivered(config, ackedFilenames);
  }

  return {
    ok: true,
    status: processed ? "processed" : "idle",
    polled: messages.length,
    processed,
    duplicates,
    latestReceivedAt,
  };
}

export function startMailboxScanLoop({
  getConfig,
  runOnce = runMailboxScanWorkerOnce,
  intervalMs = 30_000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onResult = () => {},
  onError = () => {},
} = {}) {
  if (typeof getConfig !== "function") {
    throw new TypeError("Mailbox scan loop requires getConfig().");
  }

  let stopped = false;
  let inFlight = null;
  let since = null;

  function tick() {
    if (stopped) return Promise.resolve({ ok: true, status: "stopped" });
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const result = await runOnce({ config: getConfig(), since });
        if (result?.latestReceivedAt) {
          since = result.latestReceivedAt;
        }
        onResult(result);
        return result;
      } catch (error) {
        onError(error);
        return { ok: false, status: "error" };
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  const timer = setIntervalFn(() => {
    void tick();
  }, intervalMs);
  timer?.unref?.();
  void tick();

  return {
    runNow: tick,
    whenIdle() {
      return inFlight ?? Promise.resolve();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearIntervalFn(timer);
    },
  };
}

export function startMailboxScanManager({
  getConfigs,
  runOnce = runMailboxScanWorkerOnce,
  intervalMs = 30_000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onResult = () => {},
  onError = () => {},
} = {}) {
  if (typeof getConfigs !== "function") {
    throw new TypeError("Mailbox scan manager requires getConfigs().");
  }

  const configs = getConfigs();
  if (!Array.isArray(configs)) {
    throw new TypeError("Mailbox scan manager requires an array of configs.");
  }

  const children = configs.map((config) => ({
    config,
    loop: startMailboxScanLoop({
      getConfig: () => config,
      runOnce,
      intervalMs,
      setIntervalFn,
      clearIntervalFn,
      onResult: (result) => onResult(config, result),
      onError: (error) => onError(config, error),
    }),
  }));

  return {
    size: children.length,
    runNow() {
      return Promise.all(children.map(({ loop }) => loop.runNow()));
    },
    whenIdle() {
      return Promise.all(children.map(({ loop }) => loop.whenIdle()));
    },
    stop() {
      for (const { loop } of children) {
        loop.stop();
      }
    },
  };
}
