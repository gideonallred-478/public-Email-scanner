import { MAILBOX_PROVIDERS, isLiveMailboxConfigured } from "../mailboxConfig.js";
import { apiFetch } from "../../api/apiClient.js";

const MAIL_API = "/api/mail";

async function fetchMailApi(path) {
  try {
    const response = await apiFetch(`${MAIL_API}${path}`);
    if (!response.ok) {
      return {
        ok: false,
        reason: "http_error",
        message: `Mail bridge returned ${response.status}. Is npm run dev running?`,
      };
    }
    return response.payload;
  } catch (error) {
    return {
      ok: false,
      reason: "bridge_unreachable",
      message:
        error instanceof Error
          ? error.message
          : "Mail bridge unreachable. Run npm run dev to start it.",
    };
  }
}

/**
 * Live mailbox connector — polls the local mail bridge server.
 */
export function createLiveMailboxConnector(config) {
  const configured = isLiveMailboxConfigured(config);

  return {
    kind: config?.provider ?? MAILBOX_PROVIDERS.MICROSOFT_GRAPH,
    isConfigured: () => configured,
    async connect() {
      const status = await fetchMailApi("/status");
      if (!status?.configured) {
        return {
          ok: false,
          reason: "not_configured",
          message:
            status?.message ??
            "Copy .env.example to .env.local and set MAILBOX_PROVIDER plus credentials.",
        };
      }
      if (!status.connected) {
        return {
          ok: false,
          reason: "disconnected",
          message: status.message ?? "Mailbox configured but not connected.",
        };
      }
      return {
        ok: true,
        mode: "live",
        mailbox: status.mailbox ?? config?.mailbox ?? null,
      };
    },
    async poll(options = {}) {
      const since = options.since ? `?since=${encodeURIComponent(options.since)}` : "";
      const result = await fetchMailApi(`/poll${since}`);
      if (!result?.ok) {
        return {
          ok: false,
          reason: result?.reason ?? "poll_failed",
          message: result?.message ?? "Failed to poll mailbox.",
          messages: [],
        };
      }
      return {
        ok: true,
        messages: Array.isArray(result.messages) ? result.messages : [],
      };
    },
    async disconnect() {
      return { ok: true };
    },
    getStatus() {
      return {
        mode: configured ? "live-ready" : "live-disconnected",
        label: configured
          ? "Live mailbox (checking connection…)"
          : "Live mailbox not configured",
        mailbox: config?.mailbox ?? null,
      };
    },
  };
}
