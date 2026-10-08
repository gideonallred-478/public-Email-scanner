import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

test("normalizeOAuthSecret preserves internal whitespace in opaque tokens", async () => {
  const { normalizeOAuthSecret, normalizeGmailAppPassword } = await import(
    "../../server/envFile.js"
  );

  // OAuth secrets must NOT be whitespace-collapsed.
  assert.equal(normalizeOAuthSecret("  abc def ghi  "), "abc def ghi");
  assert.equal(normalizeOAuthSecret('"abc def"'), "abc def");
  assert.equal(normalizeOAuthSecret("abc\tdef"), "abc\tdef");

  // Gmail app passwords still collapse whitespace (their spaces are display only).
  assert.equal(normalizeGmailAppPassword("abcd efgh ijkl mnop"), "abcdefghijklmnop");
});

test("readEnvFileValueFromCompanion reads a multi-line secret from a *_FILE path", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "companion-secret-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const jsonPath = join(dir, "mailboxes.json");
  const multiline = JSON.stringify(
    [
      {
        id: "pilot-01",
        provider: "local-smtp-inbox",
        mailbox: "pilot01@example.invalid",
        localSmtpInbox: { path: "C:/inbox" },
      },
    ],
    null,
    2
  );
  await writeFile(jsonPath, multiline, "utf8");

  process.env.MAILBOXES_JSON_FILE = jsonPath;
  t.after(() => {
    delete process.env.MAILBOXES_JSON_FILE;
  });

  const { readEnvFileValueFromCompanion } = await import("../../server/envFile.js");
  const result = readEnvFileValueFromCompanion("MAILBOXES_JSON");
  assert.equal(JSON.parse(result)[0].id, "pilot-01");
  assert.equal(result.includes("\n"), true, "multi-line JSON must be preserved verbatim");
});

test("readEnvFileValueFromCompanion returns empty when no companion is set", async () => {
  const { readEnvFileValueFromCompanion } = await import("../../server/envFile.js");
  assert.equal(readEnvFileValueFromCompanion("MAILBOXES_JSON"), "");
});
