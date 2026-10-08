import { describe, it } from "node:test";
import {
  dedupeLookalikeMatches,
  detectLookalikeDomains,
  pickBestLookalikeMatch,
} from "../../src/scanner/lookalikeDomainDetector.js";
import { getDefaultSiteLists, getLookalikeReferenceDomains } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { getDemoScenarioById } from "../../src/samples/demoScenarios.js";
import { assert, scanScenario } from "./helpers.mjs";

const lists = getDefaultSiteLists();
const settings = getDefaultScoringSettings();
const refs = getLookalikeReferenceDomains(lists);

const shouldFlag = [
  "chat-gpt.net",
  "openai.net",
  "g00gle.com",
  "docs-google-login.com",
  "college-board-login.com",
  "fafsa-help-login.net",
  "micros0ft-login.com",
];

const shouldNotFlag = [
  "chatgpt.com",
  "openai.com",
  "docs.google.com",
  "classroom.google.com",
  "accounts.google.com",
  "mail.google.com",
];

describe("lookalike detector", () => {
  for (const domain of shouldFlag) {
    it(`flags ${domain}`, () => {
      const result = detectLookalikeDomains([domain], refs);
      assert.ok(result.hasLookalikes, `expected ${domain} to be flagged`);
      assert.ok(result.matches.length >= 1);
    });
  }

  for (const domain of shouldNotFlag) {
    it(`does not flag official domain ${domain}`, () => {
      const result = detectLookalikeDomains([domain], refs);
      assert.equal(result.hasLookalikes, false);
    });
  }

  it("dedupeLookalikeMatches keeps one entry per domain", () => {
    const duplicateInput = [
      {
        domain: "student-club-form.net",
        resemblesReferenceDomain: "forms.gle",
        severity: "medium",
        points: 2,
        reason: "forms.gle match",
      },
      {
        domain: "student-club-form.net",
        resemblesReferenceDomain: "commonapp.org",
        severity: "medium",
        points: 2,
        reason: "commonapp match",
      },
    ];

    const deduped = dedupeLookalikeMatches(duplicateInput);
    assert.equal(deduped.length, 1);
  });

  it("pickBestLookalikeMatch returns the stronger match", () => {
    const weaker = {
      domain: "student-club-form.net",
      resemblesReferenceDomain: "forms.gle",
      severity: "medium",
      points: 2,
      reason: "medium",
    };
    const stronger = {
      domain: "student-club-form.net",
      resemblesReferenceDomain: "commonapp.org",
      severity: "high",
      points: 3,
      reason: "high",
    };

    const merged = pickBestLookalikeMatch(weaker, stronger);
    assert.equal(merged.severity, "high");
  });

  it("docs-google-login.com produces one high-severity match", () => {
    const result = detectLookalikeDomains(["docs-google-login.com"], refs);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.severity, "high");
  });

  it("slightly-weird demo does not stack duplicate lookalike score reasons", () => {
    const scenario = getDemoScenarioById("slightly-weird-unknown-link");
    const { scoreResult } = scanScenario(scenario, lists, settings);
    const lookalikeReasons = scoreResult.reasons.filter((reason) =>
      reason.label.includes("Lookalike")
    );

    const domains = lookalikeReasons.map((reason) => {
      const match = reason.detail.match(/Domain "([^"]+)"/);
      return match?.[1] ?? reason.detail;
    });

    assert.equal(domains.length, new Set(domains).size);
    assert.equal(lookalikeReasons.length, 1);
  });
});
