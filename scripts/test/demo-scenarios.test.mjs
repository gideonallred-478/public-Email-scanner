import { describe, it } from "node:test";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import {
  DEMO_SCENARIOS,
  getDemoScenarioPreview,
} from "../../src/samples/demoScenarios.js";
import {
  assert,
  expectRiskLevelMatchesScore,
  scanScenario,
} from "./helpers.mjs";

const lists = getDefaultSiteLists();
const settings = getDefaultScoringSettings();

describe("demo scenarios", () => {
  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.id} preview matches the real default scan and dashboard record`, () => {
      const { scoreResult, actionPlan, alert } = scanScenario(
        scenario,
        lists,
        settings
      );
      const preview = getDemoScenarioPreview(scenario);

      assert.deepEqual(preview, {
        score: scoreResult.score,
        riskLevel: scoreResult.riskLevel,
      });
      expectRiskLevelMatchesScore(
        scoreResult.score,
        scoreResult.riskLevel,
        scenario.id
      );
      assert.ok(alert, `${scenario.id}: every demo scan should create a dashboard record`);
      assert.equal(alert.riskLevel, scoreResult.riskLevel);
      assert.equal(actionPlan.riskBand, scoreResult.riskLevel);
    });
  }

  it("preview follows active scoring settings instead of a stale hard-coded outcome", () => {
    const scenario = DEMO_SCENARIOS.find(
      (s) => s.id === "slightly-weird-unknown-link"
    );
    const customSettings = JSON.parse(JSON.stringify(settings));
    customSettings.links.insecureHttp = 8;

    const defaultPreview = getDemoScenarioPreview(scenario, lists, settings);
    const customPreview = getDemoScenarioPreview(scenario, lists, customSettings);
    const { scoreResult } = scanScenario(scenario, lists, customSettings);

    assert.deepEqual(customPreview, {
      score: scoreResult.score,
      riskLevel: scoreResult.riskLevel,
    });
    assert.notDeepEqual(customPreview, defaultPreview);
  });

  it("safe-school-announcement creates a Safe dashboard record", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "safe-school-announcement");
    const { alert, scoreResult } = scanScenario(scenario, lists, settings);
    assert.ok(alert);
    assert.equal(alert.status, "Safe");
    assert.equal(scoreResult.riskLevel, "Safe");
  });

  it("normal-teacher-email creates Safe dashboard record with trusted sender credit", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "normal-teacher-email");
    const { scoreResult, alert } = scanScenario(scenario, lists, settings);

    assert.ok(scoreResult.score <= 2);
    assert.equal(scoreResult.riskLevel, "Safe");
    assert.ok(alert);
    assert.equal(alert.status, "Safe");
  });

  it("slightly-weird-unknown-link stays in the caution/review range and keeps one lookalike reason", () => {
    const scenario = DEMO_SCENARIOS.find(
      (s) => s.id === "slightly-weird-unknown-link"
    );
    const { scoreResult } = scanScenario(scenario, lists, settings);
    const lookalikeReasons = scoreResult.reasons.filter((reason) =>
      reason.label.includes("Lookalike")
    );

    assert.ok(scoreResult.score >= 3 && scoreResult.score <= 5);
    assert.equal(lookalikeReasons.length, 1);
    assert.ok(scoreResult.lookalikeResult?.hasLookalikes);
  });

  it("scholarship-scam lands in dashboard alert band", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "scholarship-scam");
    const { scoreResult, alert } = scanScenario(scenario, lists, settings);

    assert.ok(scoreResult.score >= 6 && scoreResult.score <= 7);
    assert.equal(scoreResult.riskLevel, "Suspicious");
    assert.ok(alert);
    assert.ok(alert.flags.dashboardAlert || alert.flags.urgentPopup);
  });

  it("fake-password-reset creates an urgent alert", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "fake-password-reset");
    const { scoreResult, alert } = scanScenario(scenario, lists, settings);

    assert.ok(scoreResult.score >= 8);
    assert.equal(scoreResult.riskLevel, "Dangerous");
    assert.ok(alert?.flags.urgentPopup);
  });

  it("lookalike-domain-attack detects lookalike domains and stays high-risk", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "lookalike-domain-attack");
    const { scoreResult, alert } = scanScenario(scenario, lists, settings);

    assert.ok(scoreResult.lookalikeResult?.hasLookalikes);
    assert.ok(scoreResult.score >= 6);
    assert.ok(["Suspicious", "Dangerous"].includes(scoreResult.riskLevel));
    assert.ok(alert);
  });

  it("trusted-link-spreading-fast triggers trust review", () => {
    const scenario = DEMO_SCENARIOS.find(
      (s) => s.id === "trusted-link-spreading-fast"
    );
    const { scoreResult, alert } = scanScenario(scenario, lists, settings);

    assert.ok(
      scoreResult.trustDecay?.reviewNeeded || scoreResult.trustDecay?.trustReduced
    );
    assert.ok(scoreResult.score >= 5 && scoreResult.score <= 7);
    assert.equal(scoreResult.riskLevel, "Suspicious");
    assert.ok(alert);
  });

  it("known-dangerous-domain scores dangerously with urgent alert", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "known-dangerous-domain");
    const { scoreResult, alert } = scanScenario(scenario, lists, settings);

    assert.ok(scoreResult.score >= 8);
    assert.equal(scoreResult.riskLevel, "Dangerous");
    assert.ok(alert?.flags.urgentPopup);
    assert.ok(alert?.flags.dangerousDomainDetected);
  });
});
