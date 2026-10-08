import { describe, it } from "node:test";
import { derivePositiveSigns } from "../../src/scanner/scanResultSummary.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { DEMO_SCENARIOS } from "../../src/samples/demoScenarios.js";
import { assert, scanScenario } from "./helpers.mjs";

const lists = getDefaultSiteLists();
const settings = getDefaultScoringSettings();

function signLabels(signs) {
  return signs.map((sign) => sign.label);
}

describe("positive signs", () => {
  it("does not show absence heuristics on Suspicious scans", () => {
    const scenario = DEMO_SCENARIOS.find(
      (s) => s.id === "slightly-weird-unknown-link"
    );
    const { parsed, scoreResult } = scanScenario(scenario, lists, settings);

    assert.ok(scoreResult.score >= 4);
    const signs = derivePositiveSigns(parsed, scoreResult);
    const labels = signLabels(signs);

    assert.equal(
      labels.includes("Sender and domain appear consistent"),
      false
    );
    assert.equal(labels.includes("No common scam keywords found"), false);
    assert.equal(labels.includes("No password or payment requests found"), false);
    assert.equal(labels.includes("No attachment flagged"), false);
  });

  it("does not show absence heuristics on scholarship scam scans", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "scholarship-scam");
    const { parsed, scoreResult } = scanScenario(scenario, lists, settings);
    const signs = derivePositiveSigns(parsed, scoreResult);

    assert.ok(scoreResult.score >= 4);
    assert.equal(signs.length, 0);
  });

  it("shows absence heuristics for Safe-band routine mail", () => {
    const scenario = DEMO_SCENARIOS.find(
      (s) => s.id === "safe-school-announcement"
    );
    const { parsed, scoreResult } = scanScenario(scenario, lists, settings);
    const signs = derivePositiveSigns(parsed, scoreResult);
    const labels = signLabels(signs);

    assert.ok(scoreResult.score <= 3);
    assert.ok(labels.includes("No links detected"));
    assert.ok(labels.includes("No urgent language found"));
    assert.equal(labels.includes("Sender and domain appear consistent"), false);
  });

  it("shows score credits for trusted sender scenarios", () => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === "normal-teacher-email");
    const { parsed, scoreResult } = scanScenario(scenario, lists, settings);
    const signs = derivePositiveSigns(parsed, scoreResult);
    const labels = signLabels(signs);

    assert.ok(
      labels.some((label) => label.includes("trusted school/site list")),
      `expected trusted sender credit, got: ${labels.join(", ")}`
    );
    assert.equal(labels.includes("Sender and domain appear consistent"), false);
  });

  it("never uses the removed sender consistency heuristic", () => {
    const parsed = {
      sender: "updates@unknown-notify-service.io",
      senderDomain: "unknown-notify-service.io",
      subject: "Test",
      links: [{ domain: "student-docs-review-now.io", isValidUrl: true }],
      hasAttachment: false,
      detectedUrgentPhrases: [],
      detectedSensitiveRequests: [],
      detectedKeywords: [],
    };
    const scoreResult = { score: 1, reasons: [] };
    const signs = derivePositiveSigns(parsed, scoreResult);

    assert.equal(
      signLabels(signs).includes("Sender and domain appear consistent"),
      false
    );
  });
});
