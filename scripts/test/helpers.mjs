import assert from "node:assert/strict";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import { createAlertFromScan } from "../../src/scanner/alertEngine.js";
import { getActionPlan } from "../../src/scanner/actionEngine.js";
import { getRiskBand } from "../../src/scanner/scanResultSummary.js";
import { scenarioToScanInput } from "../../src/samples/demoScenarios.js";

export { assert };

/**
 * @param {string} range
 * @returns {{ min: number, max: number } | null}
 */
export function parseScoreRange(range) {
  const match = String(range ?? "").match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!match) return null;
  return { min: Number(match[1]), max: Number(match[2]) };
}

const BAND_ALIASES = {
  Safe: ["Safe"],
  Suspicious: ["Suspicious"],
  Dangerous: ["Dangerous"],
  "Safe to Suspicious": ["Safe", "Suspicious"],
  "Safe / Low Risk": ["Safe"],
};

/**
 * @param {string} expectedBand
 * @param {string} riskLevel
 * @param {string} context
 */
export function expectBand(expectedBand, riskLevel, context) {
  const allowed = BAND_ALIASES[expectedBand] ?? [expectedBand];
  assert.ok(
    allowed.includes(riskLevel),
    `${context}: expected band ${expectedBand}, got ${riskLevel}`
  );
}

/**
 * @param {import("../../src/samples/demoScenarios.js").DemoScenario} scenario
 * @param {object} lists
 * @param {object} settings
 */
export function scanScenario(scenario, lists, settings) {
  const parsed = parseEmail(scenarioToScanInput(scenario));
  const scoreResult = scoreEmail(parsed, lists, settings);
  const actionPlan = getActionPlan(scoreResult, parsed);
  const alert = createAlertFromScan(
    parsed,
    scoreResult,
    actionPlan,
    scoreResult.trustDecay,
    scoreResult.lookalikeResult,
    lists
  );

  return { parsed, scoreResult, actionPlan, alert };
}

/**
 * @param {number} score
 * @param {string} riskLevel
 * @param {string} context
 */
export function expectRiskLevelMatchesScore(score, riskLevel, context) {
  assert.equal(
    riskLevel,
    getRiskBand(score).label,
    `${context}: riskLevel should match getRiskBand(score)`
  );
}
