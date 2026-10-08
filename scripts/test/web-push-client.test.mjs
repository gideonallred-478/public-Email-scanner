import { test } from "node:test";
import assert from "node:assert/strict";
import { urlBase64ToUint8Array } from "../../src/notifications/alertNotifications.js";

test("VAPID public keys decode for PushManager.subscribe", () => {
  assert.deepEqual([...urlBase64ToUint8Array("AQIDBA")], [1, 2, 3, 4]);
});
