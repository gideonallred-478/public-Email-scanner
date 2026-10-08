import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loginWithCredentials } from "../../server/authSessions.js";
import {
  handleCreateAlert,
  handleGetNotificationStatus,
  handlePatchAlert,
  handleRemovePushSubscription,
  handleUpsertPushSubscription,
} from "../../server/sharedDataRoutes.js";
import {
  attachNotificationProvenance,
  getNotificationSourceDigest,
} from "../../server/notificationProvenance.js";

const TEST_PASSWORDS = {
  "demo-admin": `admin-${"a".repeat(24)}`,
  teacher: `teacher-${"t".repeat(24)}`,
  it: `it-${"i".repeat(24)}`,
  student: `student-${"s".repeat(24)}`,
};
const TEST_AUTH_USERS = JSON.stringify([
  { username: "demo-admin", password: TEST_PASSWORDS["demo-admin"], role: "admin", displayName: "Demo Admin" },
  { username: "teacher", password: TEST_PASSWORDS.teacher, role: "teacher", displayName: "Teacher" },
  { username: "it", password: TEST_PASSWORDS.it, role: "it", displayName: "IT" },
  { username: "student", password: TEST_PASSWORDS.student, role: "student", displayName: "Student" },
]);

function requestFor(username) {
  process.env.SHARED_AUTH_USERS_JSON = TEST_AUTH_USERS;
  const login = loginWithCredentials(username, TEST_PASSWORDS[username]);
  assert.equal(login.ok, true);
  return { headers: { authorization: `Bearer ${login.token}` } };
}

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/route-test",
  keys: { p256dh: "key", auth: "auth" },
};

test("notification status is restricted to Admin and IT and is redacted", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-notification-routes-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");

  assert.equal((await handleGetNotificationStatus({ headers: {} })).status, 401);
  assert.equal((await handleGetNotificationStatus(requestFor("teacher"))).status, 403);

  const result = await handleGetNotificationStatus(requestFor("it"));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(typeof result.body.webPush.publicKey, "string");
  assert.equal("privateKey" in result.body.webPush, false);
  assert.equal("recipients" in result.body.email, false);
  assert.equal("smtpUser" in result.body.email, false);
});

test("only server-proven live mailbox scans can enqueue outbound notifications", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-provenance-routes-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "registry.json");
  process.env.SITE_LISTS_DATA_PATH = join(dir, "site-lists.json");
  process.env.MAIL_PROVENANCE_KEY_PATH = join(dir, "mail-provenance.key");

  const forged = {
    id: "forged-score",
    score: 10,
    sender: "teacher@example.test",
    subject: "Fabricated alert",
    timestamp: new Date().toISOString(),
    scanInput: { sender: "teacher@example.test", subject: "Hello", body: "Routine note" },
  };
  assert.equal((await handleCreateAlert(requestFor("teacher"), { record: forged })).status, 201);
  let state = JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
  assert.equal(state.notificationJobs.length, 0);

  const unsignedLiveEmail = {
    id: "unsigned-live",
    messageId: "<unsigned-live@example.test>",
    mailbox: "security@example.test",
    source: "live",
    receivedAt: new Date().toISOString(),
    sender: "attacker@evil.example",
    replyTo: "attacker@evil.example",
    subject: "Urgent password reset",
    body: "Verify your password at https://micros0ft-login.com/reset",
    hasAttachment: false,
  };
  const seeded = {
    id: "digest-seed",
    score: 0,
    sender: "manual@example.test",
    subject: "Manual seed",
    timestamp: new Date().toISOString(),
    notificationSourceDigest: getNotificationSourceDigest(unsignedLiveEmail),
  };
  assert.equal(
    (await handleCreateAlert(requestFor("teacher"), { record: seeded })).status,
    201
  );
  const forgedPatch = await handlePatchAlert(requestFor("teacher"), seeded.id, {
    record: { ...seeded, email: unsignedLiveEmail },
  });
  assert.equal(forgedPatch.status, 400);
  state = JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
  assert.equal(state.notificationJobs.length, 0);
  assert.equal(
    state.alerts.find((entry) => entry.id === seeded.id)?.notificationSourceDigest,
    undefined
  );

  const [liveEmail] = attachNotificationProvenance([
    {
      id: "live-email-1",
      messageId: "<live-email-1@example.test>",
      mailbox: "security@example.test",
      source: "live",
      receivedAt: new Date().toISOString(),
      sender: "attacker@evil.example",
      replyTo: "attacker@evil.example",
      subject: "Urgent password reset",
      body: "Your account expires now. Sign in and verify your password at https://micros0ft-login.com/reset",
      hasAttachment: false,
    },
  ]);
  const verified = {
    id: "client-claimed-safe",
    score: 0,
    sender: liveEmail.sender,
    subject: liveEmail.subject,
    timestamp: new Date().toISOString(),
    email: liveEmail,
    scanInput: { sender: "forged", subject: "forged", body: "forged" },
  };
  assert.equal((await handleCreateAlert(requestFor("teacher"), { record: verified })).status, 201);
  state = JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
  assert.equal(state.notificationJobs.length, 1);
  assert.equal(state.notificationJobs[0].notificationClass, "urgent");
  const storedLive = state.alerts.find((entry) => entry.id === "client-claimed-safe");
  assert.ok(storedLive.score >= 8);
  assert.match(storedLive.notificationSourceDigest, /^[a-f0-9]{64}$/);

  const { notificationProvenance: _expired, ...emailAfterRestart } = storedLive.email;
  const replacement = await handlePatchAlert(
    requestFor("teacher"),
    storedLive.id,
    { record: { ...storedLive, email: emailAfterRestart } }
  );
  assert.equal(replacement.status, 200);

  const tampered = await handlePatchAlert(requestFor("teacher"), storedLive.id, {
    record: {
      ...storedLive,
      email: { ...emailAfterRestart, body: `${emailAfterRestart.body} tampered` },
    },
  });
  assert.equal(tampered.status, 400);

  state = JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
  assert.equal(state.notificationJobs.length, 1);
  assert.equal(
    state.alerts.find((entry) => entry.id === storedLive.id).email.body,
    storedLive.email.body
  );
});

test("only Admin and IT can register a Web Push subscription", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-subscription-routes-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");

  assert.equal(
    (await handleUpsertPushSubscription(requestFor("teacher"), { subscription })).status,
    403
  );
  const result = await handleUpsertPushSubscription(requestFor("it"), { subscription });
  assert.equal(result.status, 201);
  assert.equal(result.body.ok, true);

  const itStatus = await handleGetNotificationStatus(requestFor("it"));
  assert.equal("devices" in itStatus.body, false);
  const adminStatus = await handleGetNotificationStatus(requestFor("demo-admin"));
  assert.equal(adminStatus.body.devices.length, 1);
  assert.deepEqual(Object.keys(adminStatus.body.devices[0]).sort(), [
    "createdAt",
    "endpointHash",
    "updatedAt",
    "userId",
  ]);
  assert.equal("endpoint" in adminStatus.body.devices[0], false);
  assert.equal("keys" in adminStatus.body.devices[0], false);

  const endpointHash = adminStatus.body.devices[0].endpointHash;
  assert.equal(
    (await handleRemovePushSubscription(requestFor("it"), { endpointHash })).status,
    403
  );
  const revoked = await handleRemovePushSubscription(requestFor("demo-admin"), {
    endpointHash,
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.removed, 1);
});
