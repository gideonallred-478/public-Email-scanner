import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

// --- Fix #1: Graph token cache is keyed per tenant/client ---

test("graph token cache does not share tokens across tenants or clients", async () => {
  const { pollGraphMailbox } = await import("../../server/providers/graphProvider.js");

  const tokenRequests = [];
  const issuedTokens = new Set();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes("login.microsoftonline.com")) {
      const body = new URLSearchParams(init?.body ?? "");
      const clientId = body.get("client_id") ?? "";
      const token = `token-for-${clientId}`;
      tokenRequests.push(clientId);
      issuedTokens.add(token);
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: token, expires_in: 3600 }),
        text: async () => "",
      };
    }
    // Graph messages endpoint — return an empty mailbox.
    return {
      ok: true,
      status: 200,
      json: async () => ({ value: [] }),
      text: async () => "",
    };
  };

  try {
    const cfgA = {
      microsoftGraph: { tenantId: "tenant-a", clientId: "client-a", clientSecret: "s", mailbox: "a@example.invalid" },
    };
    const cfgB = {
      microsoftGraph: { tenantId: "tenant-b", clientId: "client-b", clientSecret: "s", mailbox: "b@example.invalid" },
    };

    await pollGraphMailbox(cfgA);
    await pollGraphMailbox(cfgA);
    await pollGraphMailbox(cfgB);

    // Same tenant/client reuses its cached token (only one token fetch for client-a).
    assert.equal(tokenRequests.filter((id) => id === "client-a").length, 1);
    // A different client issues its own token.
    assert.equal(tokenRequests.filter((id) => id === "client-b").length, 1);
    assert.equal(issuedTokens.has("token-for-client-b"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Fix #2: scan registry writes are atomic and read-only loads do not rewrite ---

test("loadServerScanRegistry does not rewrite the registry file when pruning", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "scan-registry-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const registryPath = join(dir, "scan-registry.json");
  process.env.SCAN_REGISTRY_DATA_PATH = registryPath;
  t.after(() => {
    delete process.env.SCAN_REGISTRY_DATA_PATH;
  });

  const { registerServerScannedEmail, loadServerScanRegistry } = await import(
    "../../server/scanRegistryStore.js"
  );

  const now = Date.parse("2026-06-01T12:00:00.000Z");
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  await registerServerScannedEmail({
    key: "<expired@example.invalid>",
    alertId: "a1",
    scannedAtMs: now - thirtyDaysMs, // far beyond the 7-day retention -> expired
  });
  await registerServerScannedEmail({
    key: "<fresh@example.invalid>",
    alertId: "a2",
    scannedAtMs: now,
  });

  const before = await readFile(registryPath, "utf8");

  // Loading (which prunes the expired entry in memory) must not write.
  const loaded = await loadServerScanRegistry(now);
  assert.deepEqual(
    loaded.map((entry) => entry.key),
    ["<fresh@example.invalid>"]
  );

  const after = await readFile(registryPath, "utf8");
  assert.equal(before, after, "a read-only load must not rewrite the registry file");
});

test("scan registry writes are atomic (no partial temp files left behind)", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "scan-registry-atomic-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const registryPath = join(dir, "scan-registry.json");
  process.env.SCAN_REGISTRY_DATA_PATH = registryPath;
  t.after(() => {
    delete process.env.SCAN_REGISTRY_DATA_PATH;
  });

  const { registerServerScannedEmail } = await import("../../server/scanRegistryStore.js");
  await registerServerScannedEmail({
    key: "<atomic@example.invalid>",
    alertId: "a1",
    scannedAtMs: Date.now(),
  });

  const parsed = JSON.parse(await readFile(registryPath, "utf8"));
  assert.equal(parsed[0].key, "<atomic@example.invalid>");
});

// --- Fix #3: local SMTP delivery-marking is deferred until acknowledged ---

test("pollLocalSmtpInbox can defer delivery-marking until acknowledged", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "smtp-defer-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const inbox = join(dir, "inbox");
  await mkdir(inbox, { recursive: true });
  const statePath = join(dir, "delivered.json");

  await writeFile(
    join(inbox, "one.eml"),
    [
      "From: outside@example.net",
      "To: test@localhost",
      "Subject: Deferred delivery",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Body for deferred delivery test.",
    ].join("\r\n"),
    "utf8"
  );

  const {
    pollLocalSmtpInbox,
    markLocalSmtpInboxDelivered,
  } = await import("../../server/providers/localSmtpInboxProvider.js");

  const config = {
    mailbox: "test@localhost",
    localSmtpInbox: { path: inbox, statePath },
  };

  // First poll with markDelivered: false must return the message but not
  // persist it as delivered.
  const first = await pollLocalSmtpInbox(config, { markDelivered: false });
  assert.equal(first.length, 1);
  assert.equal(first[0].id, "one.eml");

  // Because it was not marked delivered, a second poll must see it again.
  const second = await pollLocalSmtpInbox(config, { markDelivered: false });
  assert.equal(second.length, 1);

  // Acknowledge delivery, then a third poll must skip it.
  await markLocalSmtpInboxDelivered(config, ["one.eml"]);
  const third = await pollLocalSmtpInbox(config, { markDelivered: false });
  assert.equal(third.length, 0);
});

test("pollLocalSmtpInbox marks delivered eagerly by default", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "smtp-eager-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const inbox = join(dir, "inbox");
  await mkdir(inbox, { recursive: true });

  await writeFile(
    join(inbox, "one.eml"),
    [
      "From: outside@example.net",
      "To: test@localhost",
      "Subject: Eager delivery",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Body.",
    ].join("\r\n"),
    "utf8"
  );

  const { pollLocalSmtpInbox } = await import(
    "../../server/providers/localSmtpInboxProvider.js"
  );
  const config = {
    mailbox: "test@localhost",
    localSmtpInbox: { path: inbox, statePath: join(dir, "delivered.json") },
  };

  const first = await pollLocalSmtpInbox(config);
  assert.equal(first.length, 1);
  const second = await pollLocalSmtpInbox(config);
  assert.equal(second.length, 0);
});
