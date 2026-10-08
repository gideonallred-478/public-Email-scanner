import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";

const settings = getDefaultScoringSettings();
const lists = getDefaultSiteLists();

function reasonsFor(input) {
  const result = scoreEmail(parseEmail(input), lists, settings);
  return new Set(result.reasons.map((r) => r.label));
}

test("benign domains containing suspicious words as substrings are not flagged", () => {
  // "supporting" must not trip the "support" keyword.
  const supporting = reasonsFor({
    sender: "team@supporting-docs.example.com",
    subject: "Quarterly documentation update",
    body: "Here are the updated docs.",
  });
  assert.equal(supporting.has("Suspicious sender domain"), false);

  // "grants" must not trip "grant".
  const grants = reasonsFor({
    sender: "awards@grants.gov",
    subject: "Grant application status",
    body: "Your application is under review.",
  });
  assert.equal(grants.has("Suspicious sender domain"), false);

  // "insecure-page.com" must not trip "secure" (substring inside "insecure").
  const insecure = reasonsFor({
    sender: "info@insecure-page.com",
    subject: "Account overview",
    body: "Summary attached.",
  });
  assert.equal(insecure.has("Suspicious sender domain"), false);
});

test("whole-label suspicious domains are still flagged", () => {
  const support = reasonsFor({
    sender: "help@support.example.com",
    subject: "Verify your account",
    body: "Please sign in.",
  });
  assert.equal(support.has("Suspicious sender domain"), true);
});
