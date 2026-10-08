import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendSignInEvent,
  listSignInEvents,
} from "../../server/signInLog.js";

test("appendSignInEvent stores sign-in and sign-out entries", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sign-in-log-"));
  t.after(async () => {
    delete process.env.SIGN_IN_LOG_PATH;
    await rm(dir, { recursive: true, force: true });
  });

  process.env.SIGN_IN_LOG_PATH = join(dir, "sign-in-log.json");

  const signIn = await appendSignInEvent({
    username: "teacher",
    displayName: "Demo Teacher",
    role: "teacher",
    event: "sign_in",
  });
  assert.equal(signIn.ok, true);

  const signOut = await appendSignInEvent({
    username: "teacher",
    displayName: "Demo Teacher",
    role: "teacher",
    event: "sign_out",
  });
  assert.equal(signOut.ok, true);

  const list = await listSignInEvents();
  assert.equal(list.ok, true);
  assert.equal(list.entries.length, 2);
  assert.equal(list.entries[0].event, "sign_out");
  assert.equal(list.entries[1].event, "sign_in");
  const stored = JSON.parse(await readFile(process.env.SIGN_IN_LOG_PATH, "utf8"));
  assert.equal(stored.version, 1);
  assert.equal(stored.entries.length, 2);
});

test("sign-in audit rejects noncanonical, duplicate, and unsupported state without overwrite", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-signin-schema-"));
  const path = join(dir, "sign-in-log.json");
  process.env.SIGN_IN_LOG_PATH = path;
  t.after(async () => {
    delete process.env.SIGN_IN_LOG_PATH;
    await rm(dir, { recursive: true, force: true });
  });

  const entry = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    event: "sign_in",
    username: "admin",
    displayName: "Admin",
    role: "admin",
    at: "2026-08-20T00:00:00.000Z",
  };
  const invalidStates = [
    { version: 99, entries: [] },
    { version: 1, entries: [{ ...entry, providerSecret: "must-not-be-exposed" }] },
    { version: 1, entries: [entry, entry] },
  ];
  for (const state of invalidStates) {
    const raw = JSON.stringify(state);
    await writeFile(path, raw, "utf8");
    await assert.rejects(() => listSignInEvents(), /audit state/i);
    assert.equal(await readFile(path, "utf8"), raw);
  }
});

test("appendSignInEvent rejects missing username", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sign-in-log-"));
  t.after(async () => {
    delete process.env.SIGN_IN_LOG_PATH;
    await rm(dir, { recursive: true, force: true });
  });

  process.env.SIGN_IN_LOG_PATH = join(dir, "sign-in-log.json");

  const result = await appendSignInEvent({ role: "teacher" });
  assert.equal(result.ok, false);
});
