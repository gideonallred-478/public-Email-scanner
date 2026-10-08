import { describe, it } from "node:test";
import { alertsToCsv, alertsToJson, buildAlertsExportPayload } from "../../src/scanner/alertExport.js";
import { assert } from "./helpers.mjs";

describe("alert export", () => {
  it("builds a compact export payload", () => {
    const payload = buildAlertsExportPayload([
      {
        id: "alert-1",
        timestamp: "2026-06-01T12:00:00.000Z",
        score: 8,
        sender: "bad@test.com",
        subject: "Reset now",
        scanSnapshot: { heavy: true },
      },
    ]);

    assert.equal(payload.length, 1);
    assert.equal(payload[0].subject, "Reset now");
    assert.equal(payload[0].scanSnapshot, undefined);
  });

  it("serializes json and csv", () => {
    const alerts = [
      {
        id: "alert-1",
        timestamp: "2026-06-01T12:00:00.000Z",
        score: 8,
        riskLevel: "Dangerous",
        status: "Open",
        alertType: "Urgent IT Alert",
        sender: "bad@test.com",
        subject: "Reset now",
        mainReasons: ["Urgent language"],
        actionSummary: "Do not click links.",
        emailDedupeKey: "<msg@test>",
      },
    ];

    assert.ok(alertsToJson(alerts).includes('"Reset now"'));
    const csv = alertsToCsv(alerts);
    assert.ok(csv.includes("Reset now"));
    assert.ok(csv.startsWith("id,timestamp"));
  });
});
