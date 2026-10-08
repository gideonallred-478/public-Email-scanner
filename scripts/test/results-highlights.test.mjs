import { describe, it } from "node:test";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import { getActionPlan } from "../../src/scanner/actionEngine.js";
import {
  getResultsHighlights,
  getSpecialtyAlertExplanation,
} from "../../src/scanner/scanResultSummary.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { getDemoScenarioById, scenarioToScanInput } from "../../src/samples/demoScenarios.js";
import { assert } from "./helpers.mjs";

const lists = getDefaultSiteLists();
const settings = getDefaultScoringSettings();

describe("results highlights", () => {
  it("keeps domain trust collapsed for lookalike scans while preserving the key callout", () => {
    const scenario = getDemoScenarioById("lookalike-domain-attack");
    const parsed = parseEmail(scenarioToScanInput(scenario));
    const scoreResult = scoreEmail(parsed, lists, settings);
    const actionPlan = getActionPlan(scoreResult, parsed);
    const highlights = getResultsHighlights(parsed, scoreResult, actionPlan, null);

    assert.equal(highlights.defaultOpenSections.domainTrust, false);
    assert.ok(highlights.promoteLines.lookalike);
  });

  it("keeps action plan collapsed for scholarship scam scans while preserving summary guidance", () => {
    const scenario = getDemoScenarioById("scholarship-scam");
    const parsed = parseEmail(scenarioToScanInput(scenario));
    const scoreResult = scoreEmail(parsed, lists, settings);
    const actionPlan = getActionPlan(scoreResult, parsed);
    const highlights = getResultsHighlights(parsed, scoreResult, actionPlan, null);

    assert.equal(highlights.defaultOpenSections.actionPlan, false);
    assert.ok(highlights.topReasons.length <= 3);
    assert.ok(highlights.nextStep.length > 0);
  });

  it("explains specialty alerts at low scores", () => {
    const alert = {
      score: 3,
      riskLevel: "Safe",
      flags: {
        dangerousDomainDetected: true,
        lookalikeDetected: false,
        trustReviewNeeded: false,
      },
    };

    const explanation = getSpecialtyAlertExplanation(alert);
    assert.ok(explanation);
    assert.match(explanation, /dangerous domain/i);
  });
});
