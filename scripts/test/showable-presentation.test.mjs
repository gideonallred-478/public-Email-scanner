import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_SCENARIOS } from "../../src/samples/demoScenarios.js";
import {
  derivePositiveSigns,
  getResultsHighlights,
} from "../../src/scanner/scanResultSummary.js";

describe("showable presentation contracts", () => {
  it("does not keep hard-coded demo score ranges or risk bands that can drift", () => {
    for (const scenario of DEMO_SCENARIOS) {
      assert.equal(
        Object.hasOwn(scenario, "expectedScoreRange"),
        false,
        `${scenario.id}: score preview should come from the scoring engine`
      );
      assert.equal(
        Object.hasOwn(scenario, "expectedBand"),
        false,
        `${scenario.id}: risk preview should come from the scoring engine`
      );
    }
  });

  it("does not show reassuring positive-sign credits on Suspicious or Dangerous scans", () => {
    const parsed = {
      links: [],
      detectedUrgentPhrases: [],
      detectedSensitiveRequests: [],
      detectedKeywords: [],
      hasAttachment: false,
    };
    const reasons = [
      {
        label: "Trusted sender domain",
        points: -2,
        detail: "Sender is trusted.",
      },
    ];

    assert.deepEqual(derivePositiveSigns(parsed, { score: 6, reasons }), []);
    assert.deepEqual(derivePositiveSigns(parsed, { score: 9, reasons }), []);
  });

  it("keeps detailed dangerous-email sections collapsed until the presenter opens them", () => {
    const highlights = getResultsHighlights(
      { subject: "Dangerous demo" },
      {
        score: 9,
        reasons: [{ label: "Known dangerous link", points: 6 }],
        trustDecay: { reviewNeeded: true },
        lookalikeResult: { hasLookalikes: true },
      },
      { dashboardAlert: true, urgentPopup: true },
      {
        created: true,
        alert: { flags: { dangerousDomainDetected: true } },
      }
    );

    assert.equal(highlights.defaultOpenSections.actionPlan, false);
    assert.equal(highlights.defaultOpenSections.domainTrust, false);
  });

  it("uses distinct presentation labels instead of nested duplicate headings", async () => {
    const demoPage = await readFile(
      new URL("../../src/pages/DemoPage.jsx", import.meta.url),
      "utf8"
    );
    const actionPlan = await readFile(
      new URL("../../src/components/ActionPlanPanel.jsx", import.meta.url),
      "utf8"
    );

    assert.match(demoPage, /<h2>Demo Scenarios<\/h2>/);
    assert.doesNotMatch(demoPage, /<h2>Demo Mode<\/h2>/);
    assert.doesNotMatch(actionPlan, /<h3>Action Plan<\/h3>/);
  });
});
