import { describe, it } from "node:test";
import {
  ALERT_STATUS,
  createAlertFromScan,
  filterAlerts,
  isDuplicateAlert,
  isResolvedAlert,
  summarizeAlerts,
} from "../../src/scanner/alertEngine.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { getDemoScenarioById } from "../../src/samples/demoScenarios.js";
import { assert, scanScenario } from "./helpers.mjs";

const lists = getDefaultSiteLists();
const settings = getDefaultScoringSettings();

function makeSampleAlert(overrides = {}) {
  return {
    id: "alert-test-1",
    timestamp: new Date().toISOString(),
    score: 6,
    riskLevel: "Suspicious",
    alertType: "Review Alert",
    priority: "medium",
    sender: "test@example.com",
    senderDomain: "example.com",
    subject: "Test subject",
    linkDomains: [],
    mainReasons: ["Test reason"],
    actionSummary: "Review recommended.",
    status: ALERT_STATUS.OPEN,
    flags: {
      dashboardAlert: true,
      urgentPopup: false,
      lookalikeDetected: false,
      trustReviewNeeded: false,
      dangerousDomainDetected: false,
    },
    ...overrides,
  };
}

function applyAlertStatus(alert, status) {
  const isResolved = status === ALERT_STATUS.RESOLVED;
  return {
    ...alert,
    status,
    resolvedAt: isResolved
      ? alert.resolvedAt ?? "2026-01-01T12:00:00.000Z"
      : undefined,
  };
}

describe("alert engine", () => {
  it("creates alerts for scholarship scam scans", () => {
    const scenario = getDemoScenarioById("scholarship-scam");
    const { alert } = scanScenario(scenario, lists, settings);
    assert.ok(alert);
    assert.equal(alert.riskLevel, "Suspicious");
    assert.equal(alert.status, ALERT_STATUS.OPEN);
  });

  it("dedupes active alerts by email dedupe key", () => {
    const existing = [
      makeSampleAlert({
        emailDedupeKey: "<msg-123@test>",
        sender: "a@b.com",
        subject: "Hello",
        score: 6,
      }),
    ];
    const candidate = {
      emailDedupeKey: "<msg-123@test>",
      sender: "a@b.com",
      subject: "Hello",
      score: 9,
    };

    assert.ok(isDuplicateAlert(existing, candidate));
  });

  it("dedupes by sender and subject when dedupe key is missing", () => {
    const existing = [
      makeSampleAlert({
        sender: "a@b.com",
        subject: "Hello",
        score: 6,
      }),
    ];
    const candidate = {
      sender: "a@b.com",
      subject: "Hello",
      score: 9,
    };

    assert.ok(isDuplicateAlert(existing, candidate));
  });

  it("does not treat resolved alerts as duplicates", () => {
    const existing = [
      applyAlertStatus(
        makeSampleAlert({
          emailDedupeKey: "<msg-123@test>",
          sender: "a@b.com",
          subject: "Hello",
          score: 6,
        }),
        ALERT_STATUS.RESOLVED
      ),
    ];
    const candidate = {
      emailDedupeKey: "<msg-123@test>",
      sender: "a@b.com",
      subject: "Hello",
      score: 6,
    };

    assert.equal(isDuplicateAlert(existing, candidate), false);
  });

  it("still dedupes against open and under-review alerts", () => {
    const candidate = {
      emailDedupeKey: "<msg-456@test>",
      sender: "a@b.com",
      subject: "Hello",
      score: 6,
    };

    for (const status of [ALERT_STATUS.OPEN, ALERT_STATUS.UNDER_REVIEW]) {
      const existing = [
        makeSampleAlert({
          status,
          emailDedupeKey: candidate.emailDedupeKey,
          sender: candidate.sender,
          subject: candidate.subject,
          score: candidate.score,
        }),
      ];
      assert.ok(
        isDuplicateAlert(existing, candidate),
        `expected duplicate for ${status}`
      );
    }
  });

  it("filterAlerts(active) excludes resolved alerts", () => {
    const alerts = [
      makeSampleAlert({ id: "open-1" }),
      applyAlertStatus(makeSampleAlert({ id: "resolved-1" }), ALERT_STATUS.RESOLVED),
      makeSampleAlert({
        id: "safe-1",
        status: ALERT_STATUS.SAFE,
        flags: { cleared: true, dashboardAlert: false, urgentPopup: false },
      }),
    ];

    const active = filterAlerts(alerts, "active");
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "open-1");
  });

  it("filterAlerts(safe) shows auto-cleared routine mail", () => {
    const alerts = [
      makeSampleAlert({ id: "open-1" }),
      makeSampleAlert({
        id: "safe-1",
        status: ALERT_STATUS.SAFE,
        alertType: "Routine Mail — No Action",
        priority: "none",
        flags: { cleared: true, dashboardAlert: false, urgentPopup: false },
      }),
    ];

    const safe = filterAlerts(alerts, "safe");
    assert.equal(safe.length, 1);
    assert.equal(safe[0].id, "safe-1");
  });

  it("safe-school-announcement creates a Safe dashboard record", () => {
    const scenario = getDemoScenarioById("safe-school-announcement");
    const { alert, scoreResult } = scanScenario(scenario, lists, settings);
    assert.ok(alert);
    assert.equal(alert.status, ALERT_STATUS.SAFE);
    assert.equal(scoreResult.riskLevel, "Safe");
    assert.ok(alert.scanSummary);
  });

  it("filterAlerts(resolved) shows only resolved alerts", () => {
    const alerts = [
      makeSampleAlert({ id: "open-1" }),
      applyAlertStatus(makeSampleAlert({ id: "resolved-1" }), ALERT_STATUS.RESOLVED),
    ];

    const resolved = filterAlerts(alerts, "resolved");
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, "resolved-1");
    assert.ok(isResolvedAlert(resolved[0]));
  });

  it("category filters exclude resolved alerts", () => {
    const resolvedDashboard = applyAlertStatus(
      makeSampleAlert({
        id: "resolved-dashboard",
        score: 6,
        flags: {
          dashboardAlert: true,
          urgentPopup: false,
          lookalikeDetected: false,
          trustReviewNeeded: false,
          dangerousDomainDetected: false,
        },
      }),
      ALERT_STATUS.RESOLVED
    );

    assert.equal(filterAlerts([resolvedDashboard], "dashboard").length, 0);
    assert.equal(filterAlerts([resolvedDashboard], "urgent").length, 0);
    assert.equal(filterAlerts([resolvedDashboard], "open").length, 0);
  });

  it("summarizeAlerts counts active and resolved separately", () => {
    const alerts = [
      makeSampleAlert({ id: "open-1", status: ALERT_STATUS.OPEN }),
      makeSampleAlert({ id: "open-2", status: ALERT_STATUS.UNDER_REVIEW }),
      applyAlertStatus(makeSampleAlert({ id: "resolved-1" }), ALERT_STATUS.RESOLVED),
    ];

    const summary = summarizeAlerts(alerts);
    assert.equal(summary.total, 2);
    assert.equal(summary.resolved, 1);
    assert.equal(summary.open, 1);
  });

  it("queue summary counts stay equal to filters when flags are missing or stale", () => {
    const alerts = [
      makeSampleAlert({ id: "review-missing-flags", score: 5, flags: {} }),
      makeSampleAlert({
        id: "urgent-stale-flags",
        score: 8,
        flags: { dashboardAlert: true, urgentPopup: false },
      }),
      makeSampleAlert({
        id: "review-stale-flags",
        score: 7,
        flags: { dashboardAlert: false, urgentPopup: true },
      }),
    ];
    const summary = summarizeAlerts(alerts);

    assert.equal(summary.dashboard, filterAlerts(alerts, "dashboard").length);
    assert.equal(summary.urgent, filterAlerts(alerts, "urgent").length);
    assert.equal(summary.dashboard, 2);
    assert.equal(summary.urgent, 1);
  });

  it("reopened alerts clear resolvedAt like AlertsContext", () => {
    const resolved = applyAlertStatus(makeSampleAlert(), ALERT_STATUS.RESOLVED);
    const reopened = applyAlertStatus(resolved, ALERT_STATUS.OPEN);

    assert.equal(reopened.status, ALERT_STATUS.OPEN);
    assert.equal(reopened.resolvedAt, undefined);
  });

  it("lookalike review note creates a low-score alert", () => {
    const scenario = getDemoScenarioById("slightly-weird-unknown-link");
    const { scoreResult, actionPlan, parsed, alert } = scanScenario(
      scenario,
      lists,
      settings
    );

    assert.ok(scoreResult.score <= 7);
    assert.ok(scoreResult.lookalikeResult?.hasLookalikes);
    assert.ok(
      createAlertFromScan(
        parsed,
        scoreResult,
        actionPlan,
        scoreResult.trustDecay,
        scoreResult.lookalikeResult,
        lists
      )
    );
    assert.ok(alert);
  });

  it("creates an alert for dangerous domains even when score is low", () => {
    const parsed = {
      sender: "test@example.com",
      senderDomain: "example.com",
      subject: "Dangerous link test",
      links: [
        {
          domain: "fake-login-verify.com",
          isValidUrl: true,
          protocol: "https",
        },
      ],
    };
    const scoreResult = {
      score: 3,
      riskLevel: "Safe",
      reasons: [],
      recommendedAction: "Show a small caution notice.",
    };

    const alert = createAlertFromScan(
      parsed,
      scoreResult,
      { adminMessage: "" },
      { reviewNeeded: false, trustReduced: false },
      { hasLookalikes: false, matches: [] },
      lists
    );

    assert.ok(alert);
    assert.equal(alert.flags.dangerousDomainDetected, true);
    assert.equal(alert.alertType, "Known Dangerous Domain Review");
    assert.equal(alert.priority, "high");
    assert.equal(alert.flags.urgentPopup, false);
    assert.equal(alert.flags.dashboardAlert, false);
  });

  it("dangerous sender domain also triggers a low-score alert", () => {
    const parsed = {
      sender: "noreply@school-login-reset.net",
      senderDomain: "school-login-reset.net",
      subject: "Account notice",
      links: [],
    };
    const scoreResult = {
      score: 4,
      riskLevel: "Suspicious",
      reasons: [],
      recommendedAction: "Show a small caution notice.",
    };

    const alert = createAlertFromScan(
      parsed,
      scoreResult,
      { adminMessage: "" },
      { reviewNeeded: false, trustReduced: false },
      { hasLookalikes: false, matches: [] },
      lists
    );

    assert.ok(alert);
    assert.equal(alert.flags.dangerousDomainDetected, true);
    assert.match(alert.alertType, /Dangerous Domain/i);
  });
});
