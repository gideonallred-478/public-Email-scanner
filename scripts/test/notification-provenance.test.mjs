import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

const message = {
  id: "restart-message",
  messageId: "<restart-message@example.test>",
  mailbox: "security@example.test",
  source: "live",
  receivedAt: "2026-08-20T00:00:00.000Z",
  sender: "sender@example.test",
  subject: "Test",
  body: "Test body",
  hasAttachment: false,
};

function runModule(source, env, args = []) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("mailbox provenance remains valid across separate server processes", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-provenance-key-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const keyPath = join(dir, "mail-provenance.key");
  const env = { MAIL_PROVENANCE_KEY_PATH: keyPath };

  const signer = runModule(
    `import { attachNotificationProvenance } from './server/notificationProvenance.js';
     const message = JSON.parse(process.argv[1]);
     process.stdout.write(JSON.stringify(attachNotificationProvenance([message])[0]));`,
    env,
    [JSON.stringify(message)]
  );
  assert.equal(signer.status, 0, signer.stderr);
  const signed = JSON.parse(signer.stdout);

  const verifier = runModule(
    `import { verifyNotificationProvenance } from './server/notificationProvenance.js';
     const message = JSON.parse(process.argv[1]);
     process.stdout.write(String(verifyNotificationProvenance(message)));`,
    env,
    [JSON.stringify(signed)]
  );
  assert.equal(verifier.status, 0, verifier.stderr);
  assert.equal(verifier.stdout, "true");
  assert.match((await readFile(keyPath, "utf8")).trim(), /^[a-f0-9]{64}$/);
});
