import { describe, it } from "node:test";
import {
  buildEmailDedupeKey,
  filterAlertsByRetention,
  getDefaultAlertExpiresAt,
  isAlertExpired,
  isEmailAlreadyScanned,
  isRetentionExpired,
  pruneScanRegistry,
  registerScannedEmail,
  keepScannedEmailReference,
  releaseScannedEmailReference,
  DEFAULT_SCAN_RETENTION_MS,
  KEPT_SCAN_RETENTION_MS,
} from "../../src/scanner/scanRetention.js";
import { assert } from "./helpers.mjs";

describe("scan retention", () => {
  it("builds dedupe key from message id", () => {
    assert.equal(
      buildEmailDedupeKey({ messageId: "<abc@mail.test>" }),
      "<abc@mail.test>"
    );
  });

  it("scopes stable message ids by pilot mailbox identity", () => {
    const first = buildEmailDedupeKey({
      mailboxId: "pilot-01",
      mailbox: "pilot01@example.invalid",
      messageId: "<same-message@example.invalid>",
    });
    const second = buildEmailDedupeKey({
      mailboxId: "pilot-02",
      mailbox: "pilot02@example.invalid",
      messageId: "<same-message@example.invalid>",
    });
    const firstAgain = buildEmailDedupeKey({
      mailboxId: "pilot-01",
      mailbox: "pilot01@example.invalid",
      messageId: "<same-message@example.invalid>",
    });

    assert.equal(first, "pilot-01|<same-message@example.invalid>");
    assert.equal(second, "pilot-02|<same-message@example.invalid>");
    assert.equal(firstAgain, first);
    assert.notEqual(first, second);
    assert.equal(
      buildEmailDedupeKey({ messageId: "<legacy@example.invalid>" }),
      "<legacy@example.invalid>"
    );
  });

  it("scopes fallback and external-id keys by pilot mailbox identity", () => {
    assert.equal(
      buildEmailDedupeKey({
        mailboxId: "pilot-01",
        mailbox: "pilot01@example.invalid",
        externalId: "provider-123",
      }),
      "pilot-01|pilot01@example.invalid|provider-123"
    );
    assert.equal(
      buildEmailDedupeKey({
        mailboxId: "pilot-01",
        sender: "sender@example.invalid",
        subject: "Subject",
        receivedAt: "2026-08-26T12:00:00.000Z",
      }),
      "pilot-01|sender@example.invalid|Subject|2026-08-26T12:00:00.000Z"
    );
  });

  it("expires default retention after window", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    const expiresAt = getDefaultAlertExpiresAt(now, false);
    const expiresMs = Date.parse(expiresAt);
    assert.equal(expiresMs - now, DEFAULT_SCAN_RETENTION_MS);
    assert.ok(
      isRetentionExpired(expiresAt, false, now + DEFAULT_SCAN_RETENTION_MS)
    );
  });

  it("kept reference does not expire on schedule", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    const expiresAt = getDefaultAlertExpiresAt(now, true);
    assert.ok(
      !isRetentionExpired(
        expiresAt,
        true,
        now + DEFAULT_SCAN_RETENTION_MS + 1
      )
    );
    assert.equal(Date.parse(expiresAt) - now, KEPT_SCAN_RETENTION_MS);
  });

  it("filters expired alerts from dashboard lists", () => {
    const now = Date.parse("2026-06-10T12:00:00.000Z");
    const alerts = [
      {
        id: "a1",
        keptForReference: false,
        expiresAt: "2026-06-09T12:00:00.000Z",
      },
      {
        id: "a2",
        keptForReference: false,
        expiresAt: "2026-06-12T12:00:00.000Z",
      },
      { id: "a3", keptForReference: true, expiresAt: "2026-06-01T12:00:00.000Z" },
    ];

    const visible = filterAlertsByRetention(alerts, now);
    assert.equal(visible.length, 2);
    assert.ok(visible.some((alert) => alert.id === "a2"));
    assert.ok(visible.some((alert) => alert.id === "a3"));
    assert.ok(isAlertExpired(alerts[0], now));
  });

  it("prunes expired registry entries but keeps pinned ones", () => {
    const now = Date.parse("2026-06-10T12:00:00.000Z");
    const pruned = pruneScanRegistry(
      [
        {
          key: "old",
          expiresAt: "2026-06-01T12:00:00.000Z",
          keptForReference: false,
        },
        {
          key: "kept",
          expiresAt: "2026-06-01T12:00:00.000Z",
          keptForReference: true,
        },
        {
          key: "fresh",
          expiresAt: "2026-06-20T12:00:00.000Z",
          keptForReference: false,
        },
      ],
      now
    );

    assert.equal(pruned.length, 2);
    assert.ok(pruned.some((entry) => entry.key === "kept"));
    assert.ok(pruned.some((entry) => entry.key === "fresh"));
  });
});

describe("scan retention registry (isolated)", () => {
  const storage = new Map();

  const originalGetItem = globalThis.localStorage?.getItem?.bind(
    globalThis.localStorage
  );
  const originalSetItem = globalThis.localStorage?.setItem?.bind(
    globalThis.localStorage
  );

  it("registers and detects scanned email keys", () => {
    if (!globalThis.localStorage) {
      globalThis.localStorage = {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      };
    } else {
      globalThis.localStorage.getItem = (key) => storage.get(key) ?? null;
      globalThis.localStorage.setItem = (key, value) => storage.set(key, value);
      globalThis.localStorage.removeItem = (key) => storage.delete(key);
    }

    storage.clear();
    const now = Date.parse("2026-06-01T12:00:00.000Z");

    registerScannedEmail({
      key: "<msg-1@test>",
      alertId: "alert-1",
      scannedAtMs: now,
    });

    assert.ok(isEmailAlreadyScanned("<msg-1@test>", now + 1000));
    assert.ok(!isEmailAlreadyScanned("<msg-1@test>", now + DEFAULT_SCAN_RETENTION_MS + 1));

    registerScannedEmail({
      key: "<msg-2@test>",
      alertId: "alert-2",
      scannedAtMs: now,
    });
    keepScannedEmailReference("alert-2", now + 1000);
    assert.ok(
      isEmailAlreadyScanned("<msg-2@test>", now + DEFAULT_SCAN_RETENTION_MS + 1)
    );

    releaseScannedEmailReference("alert-2", now + DEFAULT_SCAN_RETENTION_MS + 1);
    assert.ok(
      !isEmailAlreadyScanned(
        "<msg-2@test>",
        now + DEFAULT_SCAN_RETENTION_MS + DEFAULT_SCAN_RETENTION_MS
      )
    );

    if (originalGetItem) globalThis.localStorage.getItem = originalGetItem;
    if (originalSetItem) globalThis.localStorage.setItem = originalSetItem;
  });
});
