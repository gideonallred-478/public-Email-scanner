import { MAILBOX_PROVIDERS } from "../mailboxConfig.js";

/**
 * Demo feed connector — drives simulated incoming mail from built-in scenarios.
 */
export function createDemoMailboxConnector(config) {
  return {
    kind: MAILBOX_PROVIDERS.DEMO,
    isConfigured: () => true,
    async connect() {
      return { ok: true, mode: "demo" };
    },
    async poll() {
      return { ok: true, messages: [] };
    },
    async disconnect() {
      return { ok: true };
    },
    getStatus() {
      return {
        mode: "demo",
        label: "Demo feed active",
        mailbox: config?.mailbox ?? null,
      };
    },
  };
}
