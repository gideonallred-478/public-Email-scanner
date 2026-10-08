import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-mailbox-worker-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  process.env.ALERTS_DATA_PATH = join(dir, "alerts.json");
  process.env.SCAN_REGISTRY_DATA_PATH = join(dir, "scan-registry.json");
  process.env.SITE_LISTS_DATA_PATH = join(dir, "site-lists.json");
}

async function readAlertState() {
  return JSON.parse(await readFile(process.env.ALERTS_DATA_PATH, "utf8"));
}

async function importWorker() {
  try {
    return await import("../../server/mailboxScanWorker.js");
  } catch {
    return null;
  }
}

test("server mailbox worker scans new mail once without a browser", async (t) => {
  await setup(t);

  const workerModule = await importWorker();
  assert.equal(
    typeof workerModule?.runMailboxScanWorkerOnce,
    "function",
    "server mailbox scan worker must exist"
  );

  const providerMessage = {
    id: "message-1",
    internetMessageId: "<message-1@school.example>",
    from: "Unknown Sender <outside@example.net>",
    replyTo: "reply@example.net",
    subject: "Please review this message",
    body: "This complete email body must remain available to the protected investigation view.",
    receivedDateTime: "2026-08-26T10:00:00.000Z",
    hasAttachments: false,
    mailbox: "pilot-student-1@school.example",
  };

  const config = {
    id: "pilot-01",
    mailboxId: "pilot-01",
    configured: true,
    mailbox: "pilot-student-1@school.example",
  };

  let polls = 0;
  const poll = async () => {
    polls += 1;
    return { ok: true, messages: [providerMessage] };
  };

  const first = await workerModule.runMailboxScanWorkerOnce({ config, poll });
  assert.equal(first.ok, true);
  assert.equal(first.processed, 1);
  assert.equal(first.duplicates, 0);
  assert.equal(first.latestReceivedAt, providerMessage.receivedDateTime);

  const stateAfterFirst = await readAlertState();
  assert.equal(stateAfterFirst.alerts.length, 1);
  assert.equal(stateAfterFirst.alerts[0].email.mailbox, config.mailbox);
  assert.equal(stateAfterFirst.alerts[0].email.mailboxId, "pilot-01");
  assert.equal(stateAfterFirst.alerts[0].email.body, providerMessage.body);
  assert.equal(stateAfterFirst.alerts[0].email.source, "live");

  const second = await workerModule.runMailboxScanWorkerOnce({ config, poll });
  assert.equal(second.ok, true);
  assert.equal(second.processed, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(
    second.latestReceivedAt,
    providerMessage.receivedDateTime,
    "duplicate messages should still advance the poll cursor after restart"
  );
  assert.equal((await readAlertState()).alerts.length, 1);
  assert.equal(polls, 2);
});

test("server mailbox scan loop starts immediately, repeats, and prevents overlap", async () => {
  const workerModule = await importWorker();
  assert.equal(
    typeof workerModule?.startMailboxScanLoop,
    "function",
    "server mailbox scan loop must exist"
  );

  let scheduledCallback = null;
  let scheduledDelay = null;
  let clearedTimer = null;
  const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
  const setIntervalFn = (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return timer;
  };
  const clearIntervalFn = (value) => {
    clearedTimer = value;
  };

  let calls = 0;
  let releaseFirst;
  const firstRun = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const runOnce = async ({ since }) => {
    calls += 1;
    if (calls === 1) {
      await firstRun;
      return {
        ok: true,
        latestReceivedAt: "2026-08-26T10:00:00.000Z",
      };
    }
    assert.equal(since, "2026-08-26T10:00:00.000Z");
    return { ok: true, latestReceivedAt: since };
  };

  const loop = workerModule.startMailboxScanLoop({
    getConfig: () => ({ configured: true, mailbox: "pilot@school.example" }),
    runOnce,
    intervalMs: 30_000,
    setIntervalFn,
    clearIntervalFn,
  });

  await Promise.resolve();
  assert.equal(calls, 1, "loop should run once immediately");
  assert.equal(scheduledDelay, 30_000);
  assert.equal(timer.unrefCalled, true);

  await scheduledCallback();
  assert.equal(calls, 1, "a second tick must not overlap the active first tick");

  releaseFirst();
  await loop.whenIdle();
  await scheduledCallback();
  await loop.whenIdle();
  assert.equal(calls, 2);

  loop.stop();
  assert.equal(clearedTimer, timer);
});

test("multi-mailbox manager keeps an independent cursor for each mailbox", async () => {
  const workerModule = await importWorker();
  assert.equal(
    typeof workerModule?.startMailboxScanManager,
    "function",
    "multi-mailbox scan manager must exist"
  );

  const configs = [
    { id: "pilot-01", mailboxId: "pilot-01", configured: true, mailbox: "one@example.invalid" },
    { id: "pilot-02", mailboxId: "pilot-02", configured: true, mailbox: "two@example.invalid" },
  ];
  const calls = new Map(configs.map((config) => [config.id, []]));
  const cursors = {
    "pilot-01": "2026-08-26T10:01:00.000Z",
    "pilot-02": "2026-08-26T10:02:00.000Z",
  };
  const timers = [];

  const manager = workerModule.startMailboxScanManager({
    getConfigs: () => configs,
    runOnce: async ({ config, since }) => {
      calls.get(config.id).push(since ?? null);
      return { ok: true, latestReceivedAt: cursors[config.id] };
    },
    setIntervalFn(callback, delay) {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn() {},
  });

  assert.equal(manager.size, 2);
  await manager.whenIdle();
  assert.deepEqual(calls.get("pilot-01"), [null]);
  assert.deepEqual(calls.get("pilot-02"), [null]);
  assert.equal(timers.length, 2);
  assert.equal(timers.every((timer) => timer.delay === 30_000), true);

  await manager.runNow();
  await manager.whenIdle();
  assert.deepEqual(calls.get("pilot-01"), [null, cursors["pilot-01"]]);
  assert.deepEqual(calls.get("pilot-02"), [null, cursors["pilot-02"]]);

  manager.stop();
});

test("multi-mailbox manager isolates slow and failing mailboxes", async () => {
  const workerModule = await importWorker();
  assert.equal(
    typeof workerModule?.startMailboxScanManager,
    "function",
    "multi-mailbox scan manager must exist"
  );

  const configs = [
    { id: "pilot-slow", mailboxId: "pilot-slow", configured: true, mailbox: "slow@example.invalid" },
    { id: "pilot-fast", mailboxId: "pilot-fast", configured: true, mailbox: "fast@example.invalid" },
  ];
  let releaseSlow;
  const slowGate = new Promise((resolve) => {
    releaseSlow = resolve;
  });
  const calls = [];
  let slowAttempts = 0;

  const manager = workerModule.startMailboxScanManager({
    getConfigs: () => configs,
    runOnce: async ({ config }) => {
      calls.push(config.id);
      if (config.id === "pilot-slow") {
        slowAttempts += 1;
        if (slowAttempts === 1) {
          await slowGate;
          throw new Error("synthetic mailbox failure");
        }
      }
      return {
        ok: true,
        latestReceivedAt: `2026-08-26T10:0${slowAttempts}:00.000Z`,
      };
    },
    setIntervalFn(callback, delay) {
      return { callback, delay, unref() {} };
    },
    clearIntervalFn() {},
  });

  await Promise.resolve();
  assert.ok(
    calls.includes("pilot-fast"),
    "the fast mailbox should start even while another mailbox is still waiting"
  );

  releaseSlow();
  await manager.whenIdle();

  const fastCallsBeforeRetry = calls.filter((id) => id === "pilot-fast").length;
  await manager.runNow();
  await manager.whenIdle();
  assert.equal(slowAttempts, 2, "failed mailbox should remain retryable");
  assert.equal(
    calls.filter((id) => id === "pilot-fast").length,
    fastCallsBeforeRetry + 1,
    "another mailbox must keep scanning after its peer fails"
  );

  manager.stop();
});
