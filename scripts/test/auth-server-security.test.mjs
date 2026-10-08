import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  getMailBridgeHost,
  getServerAuthAccounts,
  isCorsOriginAllowed,
  validateServerSecurityConfiguration,
} from "../../server/config.js";
import {
  getUserFromSession,
  isActiveNotificationRecipientUser,
  loginWithCredentials,
} from "../../server/authSessions.js";
import {
  handleAuthLogin,
  handleAuthLogout,
  handleGetSignInEvents,
} from "../../server/sharedDataRoutes.js";
import { authorizeMailboxRequest } from "../../server/sharedDataRoutes.js";

const KEYS = [
  "MAIL_BRIDGE_HOST",
  "SHARED_DATA_ENABLED",
  "SHARED_AUTH_USERS_JSON",
  "NODE_ENV",
  "SIGN_IN_LOG_PATH",
  "CORS_ALLOWED_ORIGINS",
];

function preserveEnv(t) {
  const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

const TEST_PASSWORDS = {
  teacher: `teacher-${"t".repeat(24)}`,
  student: `student-${"s".repeat(24)}`,
  it: `it-${"i".repeat(24)}`,
  network: `network-${"n".repeat(24)}`,
  principal: `principal-${"p".repeat(24)}`,
};

function setTestAccounts() {
  process.env.SHARED_DATA_ENABLED = "true";
  process.env.SHARED_AUTH_USERS_JSON = JSON.stringify([
    { username: "teacher", password: TEST_PASSWORDS.teacher, role: "teacher", displayName: "Teacher" },
    { username: "student", password: TEST_PASSWORDS.student, role: "student", displayName: "Student" },
    { username: "it", password: TEST_PASSWORDS.it, role: "it", displayName: "IT" },
    {
      username: "principal",
      password: TEST_PASSWORDS.principal,
      role: "principal",
      displayName: "Principal",
    },
  ]);
}

test("mail bridge binds to loopback by default and still requires provisioned accounts", (t) => {
  preserveEnv(t);
  delete process.env.MAIL_BRIDGE_HOST;
  delete process.env.SHARED_AUTH_USERS_JSON;
  assert.equal(getMailBridgeHost(), "127.0.0.1");
  assert.throws(() => validateServerSecurityConfiguration(), /server-provisioned/);
  setTestAccounts();
  assert.doesNotThrow(() => validateServerSecurityConfiguration());
});

test("mail bridge fails closed when authenticated shared-data mode is disabled", (t) => {
  preserveEnv(t);
  setTestAccounts();
  process.env.SHARED_DATA_ENABLED = "false";
  assert.throws(
    () => validateServerSecurityConfiguration(),
    /authenticated shared-data mode/
  );
});

test("CORS permits only exact configured UI origins", (t) => {
  preserveEnv(t);
  delete process.env.CORS_ALLOWED_ORIGINS;
  assert.equal(isCorsOriginAllowed("http://localhost:5173"), true);
  assert.equal(isCorsOriginAllowed("https://evil.example"), false);
  assert.equal(isCorsOriginAllowed("http://localhost:5173.evil.example"), false);
  process.env.CORS_ALLOWED_ORIGINS = "https://scanner.tail.example";
  assert.equal(isCorsOriginAllowed("https://scanner.tail.example"), true);
  assert.equal(isCorsOriginAllowed("http://localhost:5173"), false);
});

test("network sharing fails closed without deployment-provisioned accounts", (t) => {
  preserveEnv(t);
  process.env.MAIL_BRIDGE_HOST = "0.0.0.0";
  delete process.env.SHARED_AUTH_USERS_JSON;
  assert.throws(
    () => validateServerSecurityConfiguration(),
    /server-provisioned/
  );
  assert.equal(loginWithCredentials("it", "123456789").ok, false);
});

test("network sharing accepts only valid environment-provisioned accounts", (t) => {
  preserveEnv(t);
  process.env.MAIL_BRIDGE_HOST = "0.0.0.0";
  process.env.SHARED_AUTH_USERS_JSON = JSON.stringify([
    {
      username: "network-it",
      password: TEST_PASSWORDS.network,
      role: "it",
      displayName: "Network IT",
    },
  ]);

  assert.equal(getServerAuthAccounts().length, 1);
  assert.doesNotThrow(() => validateServerSecurityConfiguration());
  assert.equal(
    loginWithCredentials("network-it", TEST_PASSWORDS.network).user?.role,
    "it"
  );
  assert.equal(loginWithCredentials("it", "123456789").ok, false);
});

test("mailbox routes require an authenticated staff session", (t) => {
  preserveEnv(t);
  delete process.env.MAIL_BRIDGE_HOST;
  setTestAccounts();

  assert.equal(authorizeMailboxRequest({ headers: {} }).status, 401);
  const teacher = loginWithCredentials("teacher", TEST_PASSWORDS.teacher);
  const student = loginWithCredentials("student", TEST_PASSWORDS.student);
  assert.equal(
    authorizeMailboxRequest({
      headers: { authorization: `Bearer ${teacher.token}` },
    }),
    null
  );
  assert.equal(
    authorizeMailboxRequest({
      headers: { authorization: `Bearer ${student.token}` },
    }).status,
    403
  );
});

test("sign-in audit events are server-owned and automatic", async (t) => {
  preserveEnv(t);
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-sign-in-auth-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.SIGN_IN_LOG_PATH = join(dir, "sign-in-log.json");
  delete process.env.MAIL_BRIDGE_HOST;
  setTestAccounts();

  const signedIn = await handleAuthLogin({
    username: "teacher",
    password: TEST_PASSWORDS.teacher,
  });
  assert.equal(signedIn.status, 200);
  const teacherRequest = {
    headers: { authorization: `Bearer ${signedIn.body.token}` },
  };
  assert.equal((await handleGetSignInEvents(teacherRequest)).status, 403);

  const it = loginWithCredentials("it", TEST_PASSWORDS.it);
  const itRequest = { headers: { authorization: `Bearer ${it.token}` } };
  let listed = await handleGetSignInEvents(itRequest);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.entries[0].event, "sign_in");
  assert.equal(listed.body.entries[0].username, "teacher");
  assert.equal(listed.body.entries[0].role, "teacher");

  assert.equal((await handleAuthLogout(teacherRequest)).status, 200);
  listed = await handleGetSignInEvents(itRequest);
  assert.equal(listed.body.entries[0].event, "sign_out");
  assert.equal(listed.body.entries[0].username, "teacher");
});

test("provisioned Principal accounts can authenticate with mandatory audit", async (t) => {
  preserveEnv(t);
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-principal-auth-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  process.env.SIGN_IN_LOG_PATH = join(dir, "sign-in-log.json");
  setTestAccounts();

  const response = await handleAuthLogin({
    username: "principal",
    password: TEST_PASSWORDS.principal,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, "principal");
});

test("login fails closed without overwriting corrupt sign-in audit state", async (t) => {
  preserveEnv(t);
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-sign-in-corrupt-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "sign-in-log.json");
  process.env.SIGN_IN_LOG_PATH = path;
  setTestAccounts();

  for (const raw of ["{invalid", "null", '[{"event":"sign_in"}]']) {
    await writeFile(path, raw, "utf8");
    const result = await handleAuthLogin({
      username: "teacher",
      password: TEST_PASSWORDS.teacher,
    });
    assert.equal(result.status, 503);
    assert.equal(await readFile(path, "utf8"), raw);
  }
});

test("login endpoint throttles repeated attempts", async (t) => {
  preserveEnv(t);
  setTestAccounts();
  let result;
  for (let index = 0; index < 11; index += 1) {
    result = await handleAuthLogin({
      username: "rate-limit-nonexistent",
      password: `wrong-${index}`,
    });
  }
  assert.equal(result.status, 429);
});

test("login endpoint applies a bounded global throttle across rotating usernames", async (t) => {
  preserveEnv(t);
  setTestAccounts();
  const statuses = [];
  for (let index = 0; index < 110; index += 1) {
    statuses.push(
      (
        await handleAuthLogin({
          username: `rotating-${index}`,
          password: "wrong",
        })
      ).status
    );
  }
  assert.equal(statuses.includes(429), true);
});

test("sessions and urgent-recipient eligibility follow current provisioned roles", (t) => {
  preserveEnv(t);
  setTestAccounts();
  const login = loginWithCredentials("it", TEST_PASSWORDS.it);
  assert.equal(login.ok, true);
  assert.equal(isActiveNotificationRecipientUser("it"), true);

  process.env.SHARED_AUTH_USERS_JSON = JSON.stringify([
    {
      username: "it",
      password: TEST_PASSWORDS.it,
      role: "teacher",
      displayName: "Former IT",
    },
  ]);
  assert.equal(getUserFromSession(login.token)?.role, "teacher");
  assert.equal(isActiveNotificationRecipientUser("it"), false);

  process.env.SHARED_AUTH_USERS_JSON = "[]";
  assert.equal(getUserFromSession(login.token), null);
});

test("invalid deployment accounts fail closed", (t) => {
  preserveEnv(t);
  process.env.SHARED_AUTH_USERS_JSON = JSON.stringify([
    { username: "it", password: "short", role: "it" },
  ]);
  assert.throws(() => getServerAuthAccounts(), /at least 12 characters/);
});
