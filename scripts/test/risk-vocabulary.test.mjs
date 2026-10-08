import { describe, it } from "node:test";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { DEMO_SCENARIOS } from "../../src/samples/demoScenarios.js";
import {
  getActionBadgeLabel,
  getRiskBand,
} from "../../src/scanner/scanResultSummary.js";
import {
  assert,
  expectRiskLevelMatchesScore,
  scanScenario,
} from "./helpers.mjs";

const lists = getDefaultSiteLists();
const settings = getDefaultScoringSettings();

describe("risk vocabulary", () => {
  for (const score of [0, 1, 3, 4, 5, 7, 8, 10]) {
    it(`maps score ${score} to the unified risk band`, () => {
      if (score <= 3) assert.equal(getRiskBand(score).label, "Safe");
      if (score >= 4 && score <= 7) assert.equal(getRiskBand(score).label, "Suspicious");
      if (score >= 8) assert.equal(getRiskBand(score).label, "Dangerous");
    });
  }

  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.id} uses unified risk labels in score and action plan`, () => {
      const { scoreResult, actionPlan, alert } = scanScenario(
        scenario,
        lists,
        settings
      );

      expectRiskLevelMatchesScore(
        scoreResult.score,
        scoreResult.riskLevel,
        `${scenario.id} scoreResult`
      );

      assert.equal(
        actionPlan.riskBand,
        scoreResult.riskLevel,
        `${scenario.id}: action plan band should match score band`
      );
      assert.equal(
        actionPlan.actionLevel,
        scoreResult.riskLevel,
        `${scenario.id}: action level should match score band`
      );
      assert.match(
        actionPlan.badgeLabel,
        new RegExp(`^${scoreResult.riskLevel} — `),
        `${scenario.id}: badge should start with risk band label`
      );
      assert.equal(
        actionPlan.badgeLabel,
        getActionBadgeLabel(scoreResult.score),
        `${scenario.id}: badge label should come from scanResultSummary`
      );

      if (alert) {
        assert.equal(
          alert.riskLevel,
          scoreResult.riskLevel,
          `${scenario.id}: alert band should match score band`
        );
        assert.equal(alert.riskLevelDetail, undefined);
      }
    });
  }

  it("keeps granular labels in debug-only score fields", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "scholarship-scam");
    const { scoreResult } = scanScenario(scenario, lists, settings);

    assert.equal(scoreResult.riskLevel, "Suspicious");
    assert.ok(scoreResult.granularRiskLevel);
    assert.notEqual(scoreResult.granularRiskLevel, scoreResult.riskLevel);
  });
});
