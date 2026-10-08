import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNotificationJob,
  classifyNotificationScore,
} from "../../server/notificationPolicy.js";

test("fixed notification routing sends review email for 5-7 and urgent push for 8-10", () => {
  const cases = [
    [4, "none", null],
    [5, "review", "email"],
    [7, "review", "email"],
    [8, "urgent", "web-push"],
    [10, "urgent", "web-push"],
  ];

  for (const [score, notificationClass, channel] of cases) {
    assert.deepEqual(classifyNotificationScore(score), {
      score,
      notificationClass,
      channel,
    });
  }
});

test("fixed notification routing rejects malformed scores", () => {
  for (const value of [undefined, null, "8", NaN, -1, 11, 7.5]) {
    assert.throws(() => classifyNotificationScore(value), /integer from 0 to 10/i);
  }
});

test("notification job keys are stable, private, and revision-aware", () => {
  const record = {
    id: "record-a",
    emailDedupeKey: "internet-message-id:<private@example.test>",
    score: 6,
    alertType: "Credential phishing",
    mainReasons: ["External sign-in", "Urgent request"],
    timestamp: "2026-08-16T12:00:00.000Z",
  };

  const first = buildNotificationJob(record, { nowMs: 1_000 });
  const reordered = buildNotificationJob(
    { ...record, mainReasons: [...record.mainReasons].reverse() },
    { nowMs: 2_000 }
  );
  const escalated = buildNotificationJob(
    { ...record, score: 8 },
    { nowMs: 3_000 }
  );

  assert.equal(first.idempotencyKey, reordered.idempotencyKey);
  assert.notEqual(first.idempotencyKey, escalated.idempotencyKey);
  assert.equal(first.channel, "email");
  assert.equal(escalated.channel, "web-push");
  assert.doesNotMatch(first.idempotencyKey, /private@example\.test/);
  assert.doesNotMatch(first.payload.recordId, /record-a|private@example\.test/);
  assert.match(first.payload.recordId, /^[a-f0-9]{24}$/);
  assert.deepEqual(Object.keys(first.payload).sort(), [
    "notificationClass",
    "recordId",
    "scannedAt",
    "score",
  ]);
});

test("scores below five create no notification job", () => {
  assert.equal(buildNotificationJob({ id: "safe", score: 4 }), null);
});
