import { MAILBOX_PROVIDERS, isLiveMailboxConfigured } from "./mailboxConfig.js";
import { createDemoMailboxConnector } from "./connectors/demoMailboxConnector.js";
import { createLiveMailboxConnector } from "./connectors/liveMailboxConnector.js";

/**
 * @param {ReturnType<import('./mailboxConfig.js').getMailboxConfig>} config
 */
export function createMailboxConnector(config) {
  if (!config || config.provider === MAILBOX_PROVIDERS.DEMO) {
    return createDemoMailboxConnector(config);
  }

  return createLiveMailboxConnector(config);
}

export { isLiveMailboxConfigured };
