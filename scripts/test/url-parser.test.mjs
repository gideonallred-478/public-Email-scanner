import { describe, it } from "node:test";
import { parseEmail, parseLink } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import {
  addDomainToList,
  getDefaultSiteLists,
} from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { assert } from "./helpers.mjs";

const settings = getDefaultScoringSettings();

describe("URL userinfo phishing", () => {
  it("parseLink flags userinfo and still extracts hostname", () => {
    const link = parseLink("http://attacker@school.edu/phish");
    assert.equal(link.isValidUrl, true);
    assert.equal(link.hasUserinfo, true);
    assert.equal(link.domain, "school.edu");
  });

  it("does not grant trusted link bonus for userinfo URLs", () => {
    let lists = addDomainToList(getDefaultSiteLists(), "trusted", "school.edu");

    const trustedOnly = parseEmail({
      sender: "teacher@school.edu",
      subject: "Resource",
      body: "https://school.edu/resource",
      hasAttachment: false,
      spreadCount: 1,
      studentReportCount: 0,
      verifiedSchoolAccount: false,
    });

    const userinfoDisguise = parseEmail({
      sender: "attacker@evil.com",
      subject: "Resource",
      body: "http://attacker@school.edu/phish",
      hasAttachment: false,
      spreadCount: 1,
      studentReportCount: 0,
      verifiedSchoolAccount: false,
    });

    const trustedScore = scoreEmail(trustedOnly, lists, settings);
    const disguiseScore = scoreEmail(userinfoDisguise, lists, settings);

    assert.ok(
      trustedScore.reasons.some((r) => r.label === "Trusted link domain"),
      "plain trusted link should receive trusted bonus"
    );
    assert.ok(
      !disguiseScore.reasons.some((r) => r.label === "Trusted link domain"),
      "userinfo link must not receive trusted bonus"
    );
    assert.ok(
      disguiseScore.reasons.some((r) => r.label === "Misleading URL userinfo"),
      "userinfo link should add misleading URL reason"
    );
    assert.ok(
      disguiseScore.score > trustedScore.score,
      "userinfo disguise should score higher risk than plain trusted link"
    );
  });
});

describe("sender parsing", () => {
  it("extracts domain from display-name sender format", () => {
    const parsed = parseEmail({
      sender: "Demo Reviewer <reviewer@example.invalid>",
      subject: "Hello",
      body: "Test",
      hasAttachment: false,
      spreadCount: 1,
    });
    assert.equal(parsed.senderDomain, "example.invalid");
  });
});

describe("scholarship scam without link", () => {
  it("scores self-sent scholarship pitch as review band, not safe", () => {
    const parsed = parseEmail({
      sender: "Demo Reviewer <reviewer@example.invalid>",
      subject: "Free Scholarship Opportunity",
      body: `If you give us 5 minuets of your time and use this link to our secure website we can see if you are available to receive our free scholarship. Hurry and fill out the form now because there are limited slots available. Claim your slot today`,
      hasAttachment: false,
      spreadCount: 1,
    });
    const scoreResult = scoreEmail(parsed, getDefaultSiteLists(), settings);

    assert.ok(
      scoreResult.score >= 5,
      `expected review-band score >= 5, got ${scoreResult.score}`
    );
    assert.ok(
      scoreResult.score <= 7,
      `expected score <= 7 without a malicious link, got ${scoreResult.score}`
    );
    assert.notEqual(scoreResult.riskLevel, "Safe");
  });

  it("treats fill out the form and limited slots as weak signals alone", () => {
    const parsed = parseEmail({
      sender: "office@lincoln-high.edu",
      subject: "Field trip permission",
      body: "Please fill out the form by Friday. Limited slots remain for chaperones.",
      hasAttachment: false,
      spreadCount: 1,
    });
    const scoreResult = scoreEmail(parsed, getDefaultSiteLists(), settings);

    assert.ok(
      scoreResult.score <= 2,
      `expected low score for routine school wording, got ${scoreResult.score}`
    );
    assert.ok(
      scoreResult.reasons.some((r) => r.label === "Routine form language"),
      "should apply soft context phrase scoring"
    );
  });
});
