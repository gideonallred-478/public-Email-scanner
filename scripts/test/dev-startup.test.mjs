import { describe, it } from "node:test";
import {
  buildDevServiceConfig,
  isMatchingScannerBridgeStatus,
  isScannerSmtpGreeting,
  shouldManageLocalSmtp,
} from "../dev-service-config.mjs";
import { assert } from "./helpers.mjs";

describe("development service startup", () => {
  it("uses the scanner's non-conflicting local ports by default", () => {
    assert.deepEqual(buildDevServiceConfig({}), {
      bridgeHost: "127.0.0.1",
      bridgeProbeHost: "127.0.0.1",
      bridgePort: 8790,
      bridgeStatusUrl: "http://127.0.0.1:8790/api/mail/status",
      frontendApiBase: "http://127.0.0.1:8790",
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      smtpInbox: "smtp-inbox",
      mailboxProvider: "local-smtp-inbox",
      mailboxAddress: "tester@localhost",
    });
  });

  it("honors explicit local development overrides", () => {
    const config = buildDevServiceConfig({
      MAIL_BRIDGE_HOST: "127.0.0.1",
      MAIL_BRIDGE_PORT: "8890",
      VITE_API_BASE: "http://127.0.0.1:8890",
      SMTP_HOST: "127.0.0.2",
      SMTP_PORT: "2025",
      SMTP_INBOX_PATH: "custom-inbox",
    });

    assert.equal(config.bridgePort, 8890);
    assert.equal(config.frontendApiBase, "http://127.0.0.1:8890");
    assert.equal(config.smtpHost, "127.0.0.2");
    assert.equal(config.smtpPort, 2025);
    assert.equal(config.smtpInbox, "custom-inbox");
  });

  it("rejects explicitly invalid development ports", () => {
    assert.throws(
      () => buildDevServiceConfig({ MAIL_BRIDGE_PORT: "not-a-port" }),
      /MAIL_BRIDGE_PORT must be an integer between 1 and 65535/
    );
    assert.throws(
      () => buildDevServiceConfig({ SMTP_PORT: "70000" }),
      /SMTP_PORT must be an integer between 1 and 65535/
    );
  });

  it("manages SMTP only for the local inbox provider", () => {
    assert.equal(shouldManageLocalSmtp({ MAILBOX_PROVIDER: "local-smtp-inbox" }), true);
    assert.equal(shouldManageLocalSmtp({ MAILBOX_PROVIDER: "imap" }), false);
    assert.equal(
      shouldManageLocalSmtp({
        MAILBOX_PROVIDER: "imap",
        SMTP_LOCAL_HARNESS: "true",
      }),
      true
    );
  });

  it("probes an explicit bridge host and maps wildcard binds to loopback", () => {
    assert.equal(
      buildDevServiceConfig({
        MAIL_BRIDGE_HOST: "192.168.1.32",
        MAIL_BRIDGE_PORT: "8790",
      }).bridgeStatusUrl,
      "http://192.168.1.32:8790/api/mail/status"
    );
    assert.equal(
      buildDevServiceConfig({ MAIL_BRIDGE_HOST: "0.0.0.0" }).bridgeProbeHost,
      "127.0.0.1"
    );
  });

  it("reuses only the scanner SMTP harness greeting", () => {
    assert.equal(
      isScannerSmtpGreeting("220 localhost Security Email Scanner SMTP harness\r\n"),
      true
    );
    assert.equal(
      isScannerSmtpGreeting("220 localhost Security Email Scanner SMTP harness impersonator\r\n"),
      false
    );
    assert.equal(isScannerSmtpGreeting("220 mail.example ESMTP\r\n"), false);
    assert.equal(isScannerSmtpGreeting("HTTP/1.1 200 OK\r\n"), false);
  });

  it("reuses only a matching scanner bridge", () => {
    const expected = {
      mailboxProvider: "local-smtp-inbox",
      mailboxAddress: "tester@localhost",
    };
    assert.equal(
      isMatchingScannerBridgeStatus(
        {
          service: "security-email-scanner-mail-bridge",
          connected: true,
          provider: "local-smtp-inbox",
          mailbox: "tester@localhost",
        },
        expected
      ),
      true
    );
    assert.equal(
      isMatchingScannerBridgeStatus({ connected: true }, expected),
      false
    );
    assert.equal(
      isMatchingScannerBridgeStatus(
        {
          service: "security-email-scanner-mail-bridge",
          connected: true,
          provider: "imap",
          mailbox: "other@example.com",
        },
        expected
      ),
      false
    );
  });
});
