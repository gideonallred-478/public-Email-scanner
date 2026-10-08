import { createServer } from "node:http";
import { URL } from "node:url";
import {
  getServerMailboxConfigs,
  isCorsOriginAllowed,
  getNotificationWorkerConfig,
  getMailBridgeHost,
  isMailboxConfigured,
  isSharedDataEnabled,
  validateServerSecurityConfiguration,
  MAILBOX_PROVIDERS,
} from "./config.js";
import { pollMailbox, verifyMailboxConnection } from "./providers/index.js";
import { runNotificationWorkerOnce } from "./notificationWorker.js";
import { startMailboxScanManager } from "./mailboxScanWorker.js";
import { deliverNotificationJob } from "./notificationTransports.js";
import { attachNotificationProvenance } from "./notificationProvenance.js";
import {
  getSharedDataStatus,
  authorizeMailboxRequest,
  handleAddSiteListDomain,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthSession,
  handleGetSignInEvents,
  handleCreateSiteListSuggestion,
  handleGetSiteListSuggestions,
  handleGetSiteLists,
  handleGetNotificationStatus,
  handleReviewSiteListSuggestion,
  handleGetAlerts,
  handleCreateAlert,
  handlePatchAlert,
  handleResolveAlerts,
  handleRemoveAlerts,
  handleClearExpiredSafeAlerts,
  handleClearAllAlerts,
  handleKeepAlertReference,
  handleReleaseAlertReference,
  handleRemovePushSubscription,
  handleUpsertPushSubscription,
} from "./sharedDataRoutes.js";

const PORT = Number(process.env.MAIL_BRIDGE_PORT || "8787");
const connectionStatusByMailboxId = new Map();

function mailboxKey(config) {
  return String(config?.mailboxId ?? config?.id ?? config?.mailbox ?? "default");
}

function unconfiguredMailboxMessage() {
  return "Copy .env.example to .env.local, set MAILBOX_PROVIDER (local-smtp-inbox, imap, or microsoft-graph), and add credentials or SMTP_INBOX_PATH.";
}

function getConnectionStatus(config) {
  return (
    connectionStatusByMailboxId.get(mailboxKey(config)) ?? {
      connected: false,
      message: config?.configured
        ? "Mailbox connection has not been checked yet."
        : unconfiguredMailboxMessage(),
    }
  );
}

function setConnectionStatus(config, connected, message) {
  const status = {
    connected: Boolean(connected),
    message: String(message || "Mailbox connection failed."),
  };
  connectionStatusByMailboxId.set(mailboxKey(config), status);
  return status;
}

async function refreshConnectionStatus(config) {
  if (!config?.configured) {
    return setConnectionStatus(config, false, unconfiguredMailboxMessage());
  }

  try {
    const result = await verifyMailboxConnection(config);
    return setConnectionStatus(
      config,
      result.ok,
      result.ok
        ? `Connected to ${config.mailbox}`
        : result.message ?? "Mailbox connection failed."
    );
  } catch (error) {
    return setConnectionStatus(
      config,
      false,
      error instanceof Error ? error.message : "Mailbox connection failed."
    );
  }
}

async function refreshConnectionStatuses() {
  const configs = getServerMailboxConfigs();
  const activeKeys = new Set(configs.map(mailboxKey));
  for (const key of connectionStatusByMailboxId.keys()) {
    if (!activeKeys.has(key)) connectionStatusByMailboxId.delete(key);
  }
  await Promise.all(configs.map((config) => refreshConnectionStatus(config)));
  return configs;
}

function markAllConnectionsFailed(message) {
  for (const config of getServerMailboxConfigs()) {
    setConnectionStatus(config, false, message);
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isCorsOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );
}

function jsonResponse(req, res, statusCode, payload) {
  setCorsHeaders(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) {
      const error = new Error("Request body exceeds 256 KiB.");
      error.code = "request_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

async function handleStatus(req, res) {
  const denied = authorizeMailboxRequest(req);
  if (denied) return jsonResponse(req, res, denied.status, denied.body);

  const configs = await refreshConnectionStatuses();
  const primary = configs[0];
  const primaryStatus = getConnectionStatus(primary);
  const mailboxes = configs.map((config) => {
    const status = getConnectionStatus(config);
    return {
      id: config.id,
      label: config.label,
      provider: config.provider,
      mailbox: config.mailbox,
      configured: config.configured,
      connected: status.connected,
      message: status.message,
    };
  });

  jsonResponse(req, res, 200, {
    service: "security-email-scanner-mail-bridge",
    ok: true,
    // Preserve the original top-level fields for the current dashboard while
    // exposing the bounded pilot registry through `mailboxes`.
    provider: primary.provider,
    mailbox: primary.mailbox,
    configured: primary.configured,
    connected: primaryStatus.connected,
    message: primaryStatus.message,
    mode: primary.configured ? "live" : "unconfigured",
    sharedData: isSharedDataEnabled(),
    mailboxCount: mailboxes.length,
    mailboxes,
  });
}

async function handlePoll(req, res) {
  const denied = authorizeMailboxRequest(req);
  if (denied) return jsonResponse(req, res, denied.status, denied.body);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedMailboxId = url.searchParams.get("mailboxId")?.trim() ?? "";
  const configs = getServerMailboxConfigs();
  const config = requestedMailboxId
    ? configs.find((entry) => entry.id === requestedMailboxId)
    : configs[0];

  if (!config) {
    jsonResponse(req, res, 404, {
      ok: false,
      reason: "unknown_mailbox",
      messages: [],
      message: "The requested mailbox is not configured.",
    });
    return;
  }

  const status = await refreshConnectionStatus(config);

  if (!config.configured) {
    jsonResponse(req, res, 200, {
      ok: false,
      reason: "not_configured",
      messages: [],
      message: status.message,
    });
    return;
  }

  if (!status.connected) {
    jsonResponse(req, res, 200, {
      ok: false,
      reason: "disconnected",
      messages: [],
      message: status.message,
    });
    return;
  }

  const since = url.searchParams.get("since");

  try {
    const result = await pollMailbox(config, { since: since || undefined });
    jsonResponse(req, res, 200, {
      ...result,
      mailboxId: config.id,
      messages: attachNotificationProvenance(result?.messages),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox poll failed.";
    setConnectionStatus(config, false, message);
    jsonResponse(req, res, 200, {
      ok: false,
      reason: "poll_error",
      mailboxId: config.id,
      messages: [],
      message,
    });
  }
}

async function handleSignInLogGet(req, res) {
  const result = await handleGetSignInEvents(req);
  jsonResponse(req, res, result.status, result.body);
}

async function dispatchSharedRoute(req, res, handler) {
  try {
    const result = await handler();
    jsonResponse(req, res, result.status, result.body);
  } catch (error) {
    jsonResponse(req, res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : "Shared data request failed.",
    });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (!isCorsOriginAllowed(req.headers.origin)) {
    res.writeHead(403, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ ok: false, message: "Origin is not allowed." }));
    return;
  }

  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mail/status") {
    await handleStatus(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mail/poll") {
    await handlePoll(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/sign-in-log") {
    await handleSignInLogGet(req, res);
    return;
  }

  if (isSharedDataEnabled()) {
    if (req.method === "GET" && url.pathname === "/api/shared-data/status") {
      jsonResponse(req, res, 200, getSharedDataStatus());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      try {
        const body = await readJsonBody(req);
        const result = await handleAuthLogin(body ?? {});
        jsonResponse(req, res, result.status, result.body);
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid login payload.",
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      await dispatchSharedRoute(req, res, () => handleAuthLogout(req));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/session") {
      await dispatchSharedRoute(req, res, () => handleAuthSession(req));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/notifications/status") {
      await dispatchSharedRoute(req, res, () => handleGetNotificationStatus(req));
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/notifications/web-push/subscriptions"
    ) {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () =>
          handleUpsertPushSubscription(req, body ?? {})
        );
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid Web Push subscription.",
        });
      }
      return;
    }

    if (
      req.method === "DELETE" &&
      url.pathname === "/api/notifications/web-push/subscriptions"
    ) {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () =>
          handleRemovePushSubscription(req, body ?? {})
        );
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid Web Push subscription.",
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/site-lists") {
      await dispatchSharedRoute(req, res, () => handleGetSiteLists(req));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/site-lists/domains") {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () => handleAddSiteListDomain(req, body ?? {}));
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid site list payload.",
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/site-list-suggestions") {
      await dispatchSharedRoute(req, res, () => handleGetSiteListSuggestions(req));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/site-list-suggestions") {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () =>
          handleCreateSiteListSuggestion(req, body ?? {})
        );
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message:
            error instanceof Error ? error.message : "Invalid suggestion payload.",
        });
      }
      return;
    }

    const suggestionMatch = url.pathname.match(
      /^\/api\/site-list-suggestions\/([^/]+)$/
    );
    if (req.method === "PATCH" && suggestionMatch) {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () =>
          handleReviewSiteListSuggestion(req, suggestionMatch[1], body ?? {})
        );
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message:
            error instanceof Error ? error.message : "Invalid review payload.",
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/alerts") {
      await dispatchSharedRoute(req, res, () => handleGetAlerts(req));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alerts") {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () => handleCreateAlert(req, body ?? {}));
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid alert payload.",
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alerts/resolve") {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () => handleResolveAlerts(req, body ?? {}));
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid resolve payload.",
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alerts/remove") {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () => handleRemoveAlerts(req, body ?? {}));
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid remove payload.",
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alerts/clear-expired-safe") {
      await dispatchSharedRoute(req, res, () => handleClearExpiredSafeAlerts(req));
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/alerts") {
      await dispatchSharedRoute(req, res, () => handleClearAllAlerts(req));
      return;
    }

    const keepRefMatch = url.pathname.match(/^\/api\/alerts\/([^/]+)\/keep-reference$/);
    if (req.method === "POST" && keepRefMatch) {
      await dispatchSharedRoute(req, res, () =>
        handleKeepAlertReference(req, decodeURIComponent(keepRefMatch[1]))
      );
      return;
    }

    const releaseRefMatch = url.pathname.match(/^\/api\/alerts\/([^/]+)\/release-reference$/);
    if (req.method === "POST" && releaseRefMatch) {
      await dispatchSharedRoute(req, res, () =>
        handleReleaseAlertReference(req, decodeURIComponent(releaseRefMatch[1]))
      );
      return;
    }

    const alertMatch = url.pathname.match(/^\/api\/alerts\/([^/]+)$/);
    if (req.method === "PATCH" && alertMatch) {
      try {
        const body = await readJsonBody(req);
        await dispatchSharedRoute(req, res, () =>
          handlePatchAlert(req, decodeURIComponent(alertMatch[1]), body ?? {})
        );
      } catch (error) {
        jsonResponse(req, res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid alert patch.",
        });
      }
      return;
    }
  }

  jsonResponse(req, res, 404, { ok: false, message: "Not found" });
});

process.on("uncaughtException", (error) => {
  console.error("Mail bridge error (kept running):", error?.message ?? error);
  const message = error instanceof Error ? error.message : "Unexpected mail bridge error.";
  try {
    markAllConnectionsFailed(message);
  } catch {
    // Invalid configuration should remain visible through startup/config validation.
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("Mail bridge rejection (kept running):", reason);
  const message = reason instanceof Error ? reason.message : "Unexpected mail bridge error.";
  try {
    markAllConnectionsFailed(message);
  } catch {
    // Invalid configuration should remain visible through startup/config validation.
  }
});

const startupConfigs = await refreshConnectionStatuses();
const startupConfig = startupConfigs[0];
validateServerSecurityConfiguration();
const listenHost = getMailBridgeHost();

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other mail bridge (or close the old terminal), or set MAIL_BRIDGE_PORT in .env.local.`
    );
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, listenHost, () => {
  const configuredCount = startupConfigs.filter((config) => config.configured).length;
  const label =
    configuredCount === 0 || startupConfig.provider === MAILBOX_PROVIDERS.DEMO
      ? "waiting for .env.local"
      : configuredCount === 1
        ? `${startupConfig.provider} → ${startupConfig.mailbox}`
        : `${configuredCount} protected mailboxes`;
  console.log(
    `Mail bridge listening on http://${listenHost === "0.0.0.0" ? "127.0.0.1" : listenHost}:${PORT} (${label})`
  );
  if (listenHost === "0.0.0.0") {
    console.log(
      `Shared data API enabled — other devices can reach /api on port ${PORT} (set Vite --host for the UI).`
    );
  }
  if (!isMailboxConfigured(startupConfig)) {
    console.log(
      "Configure .env.local with MAILBOX_PROVIDER and credentials to link your inbox."
    );
  }
  for (const config of startupConfigs) {
    if (!config.configured) continue;
    const status = getConnectionStatus(config);
    if (!status.connected) {
      console.log(`Mailbox connection issue (${config.id}): ${status.message}`);
    } else {
      console.log(`Mailbox connected (${config.id}): ${config.mailbox}`);
    }
  }
});

startMailboxScanManager({
  getConfigs: getServerMailboxConfigs,
  intervalMs: 30_000,
  onResult(config, result) {
    if (result?.ok === false) {
      console.error(
        `Mailbox background scan failed (${config.id}: ${result.reason ?? result.status ?? "poll_failed"}).`
      );
    }
  },
  onError(config, error) {
    console.error(
      `Mailbox background scan failed (${config.id}: ${String(error?.code ?? error?.message ?? "scan_failure").slice(0, 120)}).`
    );
  },
});

const notificationWorkerConfig = getNotificationWorkerConfig();
let notificationTickRunning = false;
async function runNotificationTick() {
  if (notificationTickRunning) return;
  notificationTickRunning = true;
  try {
    const result = await runNotificationWorkerOnce({
      deliver: deliverNotificationJob,
      maxAttempts: notificationWorkerConfig.maxAttempts,
    });
    if (result.status === "dead") {
      console.error(`Notification job moved to dead letter (${result.errorCode}).`);
    }
  } catch (error) {
    console.error(
      `Notification worker tick failed (${String(error?.code ?? "worker_failure").slice(0, 80)}).`
    );
  } finally {
    notificationTickRunning = false;
  }
}

if (notificationWorkerConfig.enabled) {
  const notificationTimer = setInterval(
    runNotificationTick,
    notificationWorkerConfig.pollIntervalMs
  );
  notificationTimer.unref();
  void runNotificationTick();
}

const connectionRefreshTimer = setInterval(() => {
  refreshConnectionStatuses().catch((error) => {
    const message = error instanceof Error ? error.message : "Connection check failed.";
    try {
      markAllConnectionsFailed(message);
    } catch {
      // Keep the bridge alive; configuration errors remain visible on the next request/log.
    }
  });
}, 60_000);
connectionRefreshTimer.unref();
