import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getMailboxConfig,
  isLiveMailboxConfigured,
  MAILBOX_PROVIDERS,
  DEFAULT_MAILBOX_ADDRESS,
} from "../../src/mail/mailboxConfig.js";
import { createMailboxConnector } from "../../src/mail/mailboxConnector.js";
import {
  createIncomingEmailMessage,
  incomingEmailToScanInput,
  normalizeLiveEmailMessage,
  EMAIL_SOURCE,
} from "../../src/mail/incomingEmail.js";
import {
  getServerMailboxConfig,
  getServerMailboxConfigs,
  isMailboxConfigured,
} from "../../server/config.js";

function withMailboxRegistry(value, action) {
  const previous = process.env.MAILBOXES_JSON;
  if (value === undefined) delete process.env.MAILBOXES_JSON;
  else process.env.MAILBOXES_JSON = value;
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env.MAILBOXES_JSON;
    else process.env.MAILBOXES_JSON = previous;
  }
}

function localMailbox(id, mailbox, path = `/tmp/${id}`) {
  return {
    id,
    label: `Pilot ${id}`,
    provider: "local-smtp-inbox",
    mailbox,
    localSmtpInbox: { path, host: "127.0.0.1", port: 1025 },
  };
}

test("default frontend mailbox config expects local smtp inbox in dev", () => {
  const config = getMailboxConfig();
  assert.equal(config.provider, MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX);
  assert.equal(config.liveEnabled, true);
});

test("demo provider disables live mode on frontend", () => {
  const config = {
    provider: MAILBOX_PROVIDERS.DEMO,
    mailbox: DEFAULT_MAILBOX_ADDRESS,
    liveEnabled: false,
    microsoftGraph: {},
    imap: {},
  };
  assert.equal(isLiveMailboxConfigured(config), false);
});

test("server mailbox reads credentials from env file when present", () => {
  const config = getServerMailboxConfig();
  assert.equal(typeof config.configured, "boolean");
  assert.equal(typeof config.mailbox, "string");
});

test("server mailbox registry returns multiple validated pilot mailboxes", () => {
  withMailboxRegistry(
    JSON.stringify([
      localMailbox("pilot-01", "pilot01@example.invalid"),
      localMailbox("pilot-02", "pilot02@example.invalid"),
    ]),
    () => {
      const configs = getServerMailboxConfigs();
      assert.equal(configs.length, 2);
      assert.deepEqual(
        configs.map((entry) => entry.id),
        ["pilot-01", "pilot-02"]
      );
      assert.deepEqual(
        configs.map((entry) => entry.mailbox),
        ["pilot01@example.invalid", "pilot02@example.invalid"]
      );
      assert.equal(configs.every((entry) => entry.configured), true);
      assert.equal(getServerMailboxConfig().id, "pilot-01");
    }
  );
});

test("server mailbox registry rejects invalid or ambiguous pilot definitions", () => {
  const cases = [
    {
      value: "not-json",
      message: /MAILBOXES_JSON must be valid JSON/i,
    },
    {
      value: JSON.stringify([]),
      message: /between 1 and 10/i,
    },
    {
      value: JSON.stringify([
        localMailbox("pilot-01", "pilot01@example.invalid"),
        localMailbox("pilot-01", "pilot02@example.invalid"),
      ]),
      message: /unique mailbox ids/i,
    },
    {
      value: JSON.stringify([
        localMailbox("pilot-01", "Pilot01@example.invalid"),
        localMailbox("pilot-02", "pilot01@example.invalid"),
      ]),
      message: /unique mailbox addresses/i,
    },
    {
      value: JSON.stringify([
        localMailbox("Pilot 01", "pilot01@example.invalid"),
      ]),
      message: /mailbox id/i,
    },
    {
      value: JSON.stringify([
        {
          ...localMailbox("pilot-01", "pilot01@example.invalid"),
          provider: "unsupported-provider",
        },
      ]),
      message: /unsupported mailbox provider/i,
    },
    {
      value: JSON.stringify(
        Array.from({ length: 11 }, (_, index) =>
          localMailbox(
            `pilot-${String(index + 1).padStart(2, "0")}`,
            `pilot${index + 1}@example.invalid`
          )
        )
      ),
      message: /between 1 and 10/i,
    },
  ];

  for (const entry of cases) {
    withMailboxRegistry(entry.value, () => {
      assert.throws(() => getServerMailboxConfigs(), entry.message);
    });
  }
});

test("server detects configured imap from env shape", () => {
  assert.equal(
    isMailboxConfigured({
      provider: MAILBOX_PROVIDERS.IMAP,
      imap: { host: "imap.example.com", user: "a@b.com", password: "secret" },
      microsoftGraph: {},
    }),
    true
  );
});

test("normalizeLiveEmailMessage maps provider payload and mailbox identity", () => {
  const message = normalizeLiveEmailMessage(
    {
      id: "AAMkAG123",
      internetMessageId: "<real-message@example.com>",
      from: "sender@example.com",
      subject: "Test subject",
      body: "Hello from live mail",
      replyTo: "case-review@other.example",
      receivedDateTime: "2026-05-20T12:00:00.000Z",
    },
    { mailbox: "you@example.com", mailboxId: "pilot-01" }
  );

  assert.equal(message.source, EMAIL_SOURCE.LIVE);
  assert.equal(message.externalId, "AAMkAG123");
  assert.equal(message.messageId, "<real-message@example.com>");
  assert.equal(message.mailbox, "you@example.com");
  assert.equal(message.mailboxId, "pilot-01");
  assert.equal(message.replyTo, "case-review@other.example");
  assert.equal(
    incomingEmailToScanInput(message).replyTo,
    "case-review@other.example"
  );
  assert.equal(incomingEmailToScanInput(message).subject, "Test subject");
});

test("live connector reports bridge or config status", async () => {
  const connector = createMailboxConnector({
    provider: MAILBOX_PROVIDERS.IMAP,
    mailbox: "you@example.com",
    microsoftGraph: {},
    imap: {},
  });

  const connectResult = await connector.connect();
  assert.equal(connectResult.ok, false);
  assert.ok(
    ["not_configured", "disconnected", "bridge_unreachable"].includes(
      connectResult.reason
    )
  );

  const pollResult = await connector.poll();
  assert.equal(pollResult.ok, false);
  assert.deepEqual(pollResult.messages, []);
});

test("demo connector reports demo mode", async () => {
  const connector = createMailboxConnector({
    provider: MAILBOX_PROVIDERS.DEMO,
    mailbox: DEFAULT_MAILBOX_ADDRESS,
    microsoftGraph: {},
    imap: {},
  });
  const result = await connector.connect();
  assert.equal(result.ok, true);
  assert.equal(result.mode, "demo");
  assert.equal(connector.getStatus().mode, "demo");
});

test("createIncomingEmailMessage tags demo source by default", () => {
  const message = createIncomingEmailMessage(
    { sender: "a@b.com", subject: "Hi", body: "Body" },
    { scenarioId: "safe-school-announcement" }
  );
  assert.equal(message.source, EMAIL_SOURCE.DEMO);
  assert.match(message.messageId, /@local>$/);
});
