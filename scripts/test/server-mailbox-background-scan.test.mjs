import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listenTcp(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function getFreeTcpPort() {
  const server = createTcpServer();
  const port = await listenTcp(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForPersistedAlerts(path, count = 1, timeoutMs = 3_500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(path, "utf8"));
      if (Array.isArray(state?.alerts) && state.alerts.length >= count) {
        return state.alerts;
      }
    } catch {
      // The background scanner may not have created its durable state yet.
    }
    await delay(50);
  }
  throw new Error(`mail bridge did not persist ${count} background-scanned email(s)`);
}

function buildEml({ to, subject, body, messageId }) {
  return [
    "From: Outside Sender <outside@example.net>",
    `To: ${to}`,
    "Reply-To: reply@example.net",
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    "Date: Wed, 26 Aug 2026 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
    "",
  ].join("\r\n");
}

function baseServerEnv(dir, alertsPath, smtpPort, bridgePort = 0) {
  return {
    ...process.env,
    MAIL_BRIDGE_HOST: "127.0.0.1",
    MAIL_BRIDGE_PORT: String(bridgePort),
    SHARED_DATA_ENABLED: "true",
    SHARED_AUTH_USERS_JSON: JSON.stringify([
      {
        username: "pilot-admin",
        password: "pilot-password-1234",
        role: "admin",
        displayName: "Pilot Admin",
      },
    ]),
    ALERTS_DATA_PATH: alertsPath,
    SCAN_REGISTRY_DATA_PATH: join(dir, "scan-registry.json"),
    SITE_LISTS_DATA_PATH: join(dir, "site-lists.json"),
    SIGN_IN_LOG_PATH: join(dir, "sign-in-log.json"),
    MAIL_PROVENANCE_SECRET_PATH: join(dir, "mail-provenance.key"),
    ALERT_NOTIFY_ENABLED: "false",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
  };
}

async function loginToBridge(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "pilot-admin",
      password: "pilot-password-1234",
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.token, "string");
  return body.token;
}

test("mail bridge scans configured mailbox without a browser poll request", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-background-"));
  const inbox = join(dir, "smtp-inbox");
  const alertsPath = join(dir, "alerts.json");
  await mkdir(inbox, { recursive: true });
  await writeFile(
    join(inbox, "pilot-message.eml"),
    buildEml({
      to: "pilot-student@school.example",
      subject: "Account review required",
      messageId: "<pilot-background-scan@example.net>",
      body: "Please review your account. This full message body should be retained for investigation.",
    }),
    "utf8"
  );

  const smtpStub = createTcpServer((socket) => socket.end());
  const smtpPort = await listenTcp(smtpStub);

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...baseServerEnv(dir, alertsPath, smtpPort),
      MAILBOX_PROVIDER: "local-smtp-inbox",
      MAILBOX_ADDRESS: "pilot-student@school.example",
      SMTP_INBOX_PATH: inbox,
      SMTP_INBOX_STATE_PATH: join(dir, "smtp-delivered.json"),
      MAILBOXES_JSON: "",
    },
    stdio: "ignore",
  });

  t.after(async () => {
    child.kill("SIGTERM");
    smtpStub.close();
    await rm(dir, { recursive: true, force: true });
  });

  const [alert] = await waitForPersistedAlerts(alertsPath);
  assert.equal(alert.email.source, "live");
  assert.equal(alert.email.mailbox, "pilot-student@school.example");
  assert.match(alert.email.body, /full message body should be retained/i);
  assert.equal(alert.email.messageId, "<pilot-background-scan@example.net>");
});

test("mail bridge scans two pilot mailboxes independently without a browser", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-multi-background-"));
  const inboxOne = join(dir, "smtp-inbox-one");
  const inboxTwo = join(dir, "smtp-inbox-two");
  const alertsPath = join(dir, "alerts.json");
  await Promise.all([
    mkdir(inboxOne, { recursive: true }),
    mkdir(inboxTwo, { recursive: true }),
  ]);

  const sharedMessageId = "<same-campaign@example.net>";
  const sharedFilename = `shared-${Date.now()}-${Math.random().toString(36).slice(2)}.eml`;
  await Promise.all([
    writeFile(
      join(inboxOne, sharedFilename),
      buildEml({
        to: "pilot01@example.invalid",
        subject: "Shared campaign one",
        messageId: sharedMessageId,
        body: "Full original body for pilot mailbox one.",
      }),
      "utf8"
    ),
    writeFile(
      join(inboxTwo, sharedFilename),
      buildEml({
        to: "pilot02@example.invalid",
        subject: "Shared campaign two",
        messageId: sharedMessageId,
        body: "Full original body for pilot mailbox two.",
      }),
      "utf8"
    ),
  ]);

  const smtpStub = createTcpServer((socket) => socket.end());
  const smtpPort = await listenTcp(smtpStub);
  const bridgePort = await getFreeTcpPort();
  const mailboxConfigs = [
    {
      id: "pilot-01",
      label: "Pilot Student 01",
      provider: "local-smtp-inbox",
      mailbox: "pilot01@example.invalid",
      localSmtpInbox: {
        path: inboxOne,
        statePath: join(dir, "smtp-delivered-one.json"),
        host: "127.0.0.1",
        port: smtpPort,
      },
    },
    {
      id: "pilot-02",
      label: "Pilot Student 02",
      provider: "local-smtp-inbox",
      mailbox: "pilot02@example.invalid",
      localSmtpInbox: {
        path: inboxTwo,
        statePath: join(dir, "smtp-delivered-two.json"),
        host: "127.0.0.1",
        port: smtpPort,
      },
    },
  ];

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...baseServerEnv(dir, alertsPath, smtpPort, bridgePort),
      MAILBOXES_JSON: JSON.stringify(mailboxConfigs),
    },
    stdio: "ignore",
  });

  t.after(async () => {
    child.kill("SIGTERM");
    smtpStub.close();
    await rm(dir, { recursive: true, force: true });
  });

  const alerts = await waitForPersistedAlerts(alertsPath, 2);
  const pilotAlerts = alerts.filter((alert) =>
    ["pilot-01", "pilot-02"].includes(alert.email?.mailboxId)
  );
  assert.equal(pilotAlerts.length, 2);
  assert.deepEqual(
    new Set(pilotAlerts.map((alert) => alert.email.mailboxId)),
    new Set(["pilot-01", "pilot-02"])
  );
  assert.deepEqual(
    new Set(pilotAlerts.map((alert) => alert.email.mailbox)),
    new Set(["pilot01@example.invalid", "pilot02@example.invalid"])
  );
  assert.equal(
    pilotAlerts.every((alert) => alert.email.messageId === sharedMessageId),
    true,
    "the same upstream Message-ID must remain distinct across protected mailboxes"
  );
  assert.equal(
    pilotAlerts.every((alert) => /Full original body for pilot mailbox/.test(alert.email.body)),
    true,
    "full original email context should remain available for investigation"
  );

  const baseUrl = `http://127.0.0.1:${bridgePort}`;
  const token = await loginToBridge(baseUrl);
  const authHeaders = { Authorization: `Bearer ${token}` };

  const statusResponse = await fetch(`${baseUrl}/api/mail/status`, {
    headers: authHeaders,
  });
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.mailboxCount, 2);
  assert.deepEqual(
    status.mailboxes.map((entry) => entry.id),
    ["pilot-01", "pilot-02"]
  );
  const allowedStatusKeys = [
    "configured",
    "connected",
    "id",
    "label",
    "mailbox",
    "message",
    "provider",
  ];
  assert.equal(
    status.mailboxes.every(
      (entry) =>
        JSON.stringify(Object.keys(entry).sort()) ===
        JSON.stringify([...allowedStatusKeys].sort())
    ),
    true,
    "staff mailbox status must expose only redacted connection metadata"
  );
  assert.equal(JSON.stringify(status).includes("pilot-password-1234"), false);

  const selectedPollResponse = await fetch(
    `${baseUrl}/api/mail/poll?mailboxId=pilot-02`,
    { headers: authHeaders }
  );
  assert.equal(selectedPollResponse.status, 200);
  const selectedPoll = await selectedPollResponse.json();
  assert.equal(selectedPoll.mailboxId, "pilot-02");

  const unknownPollResponse = await fetch(
    `${baseUrl}/api/mail/poll?mailboxId=not-configured`,
    { headers: authHeaders }
  );
  assert.equal(unknownPollResponse.status, 404);
  const unknownPoll = await unknownPollResponse.json();
  assert.equal(unknownPoll.reason, "unknown_mailbox");
});
