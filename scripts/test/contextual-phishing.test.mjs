import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { isValidSiteListEntry } from "../../src/scanner/domainUtils.js";

const settings = getDefaultScoringSettings();
const lists = getDefaultSiteLists();

function scan(input) {
  return scoreEmail(parseEmail(input), lists, settings);
}

const trickyPayroll = {
  sender: "Avery Collins, Payroll Operations <payroll-notices@district-benefits.invalid>",
  replyTo: "case-review@employee-services.invalid",
  subject: "Follow-up required: direct-deposit exception before Thursday payroll close",
  body: `Hi demo-admin,

I’m following up on an exception generated during this morning’s payroll reconciliation. Your employee profile is active and your most recent deposit was not rejected, but the account-verification record attached to the next payroll batch does not match the abbreviated routing record retained after the district’s benefits-system migration.

This usually happens when an account was added before the migration or when a bank changes the internal identifier used for ACH verification. We have not changed your payment destination, and no funds have been removed. However, the batch closes Thursday at 4:30 PM, so the record needs to be acknowledged before then to avoid the payment being held for manual review.

Please open the Employee Services review page below and confirm the masked account ending in 1842:

https://portal.accounts-review.invalid/district/payroll/case/PR-48217

The review page will first ask you to sign in with your normal district account and then confirm whether the displayed bank name and last four digits are correct. Do not enter a complete bank account number. If the information is wrong, choose “Report mismatch” and Payroll Operations will contact you using the phone number already on file.

Case details
-------------
Case: PR-48217
Employee record: Demo Employee
Department: Technology Services
Status: Awaiting acknowledgment
Batch: Thursday supplemental payroll
Current action: Confirm masked destination

Why you are receiving this
--------------------------
The migration retained the bank name and final four digits, but a validation checksum from the previous provider was not transferred. Most employees can clear the exception in under two minutes. If no acknowledgment is received by the cutoff, the system automatically routes the payment to a manual queue; it does not cancel the payment.

If you have already completed this review from another notification, no further action is required. You can verify the case number by contacting the internal service desk through the number on your staff ID rather than replying to this message.

Thank you,
Avery Collins
Payroll Operations | Employee Services
Reference: PR-48217

---
AUTHORIZED LOCAL PHISHING-SCANNER SIMULATION
All domains in this message use the reserved .invalid suffix and cannot resolve on the public Internet. Do not enter credentials.`,
};

test("coordinated payroll credential phishing reaches high-risk score", () => {
  const parsed = parseEmail(trickyPayroll);
  const result = scoreEmail(parsed, lists, settings);

  assert.equal(parsed.replyToDomain, "employee-services.invalid");
  assert.equal(parsed.requestsAuthentication, true);
  assert.equal(parsed.hasDeadlinePressure, true);
  assert.equal(parsed.highRiskWorkflow, "payroll");
  assert.equal(parsed.authorityRole, "payroll");
  assert.ok(!parsed.detectedSensitiveRequests.includes("bank account"));
  assert.equal(result.score, 8, JSON.stringify(result.reasons));
  assert.ok(
    !result.reasons.some((reason) => reason.label === "Sensitive information request")
  );
  assert.ok(
    result.reasons.some((reason) => reason.label === "Coordinated social-engineering pattern")
  );
  assert.equal(
    result.reasons.reduce((sum, reason) => sum + reason.points, 0),
    result.score,
    "reason points must match the bounded score"
  );
});

test("negated sensitive language is ignored but a separate direct request still counts", () => {
  const negated = parseEmail({
    sender: "support@district.example",
    subject: "Safety reminder",
    body: "Do not enter a complete bank account number.",
  });
  const requested = parseEmail({
    sender: "support@district.example",
    subject: "Account review",
    body: "Do not enter a complete bank account number on untrusted sites. Provide your bank account to complete this form.",
  });

  assert.ok(!negated.detectedSensitiveRequests.includes("bank account"));
  assert.ok(requested.detectedSensitiveRequests.includes("bank account"));
});

test("repeated descriptive denials do not become sensitive-data requests", () => {
  const parsed = parseEmail({
    sender: "support@district.example",
    subject: "Safety reminder",
    body: "Do not provide your bank account. The policy repeats: bank account details are never requested.",
  });

  assert.ok(!parsed.detectedSensitiveRequests.includes("bank account"));
});

test("repeated sign-in instructions associate each nearby destination", () => {
  const result = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Sign in at https://login.district.example/review. Then sign in at https://evil.example/confirm.",
  });

  assert.ok(
    result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("reason points reconcile to a score capped at ten", () => {
  const cappedSettings = structuredClone(settings);
  cappedSettings.context.externalAuthenticationLink = 20;
  const result = scoreEmail(parseEmail(trickyPayroll), lists, cappedSettings);

  assert.equal(result.score, 10);
  assert.equal(
    result.reasons.reduce((sum, reason) => sum + reason.points, 0),
    result.score
  );
});

test("additional contextual edge cases remain bounded and canonical", () => {
  for (const body of [
    "We will never ask for your password.",
    "Do not disclose your password.",
  ]) {
    const parsed = parseEmail({
      sender: "support@district.example",
      subject: "Safety reminder",
      body,
    });
    assert.ok(!parsed.detectedSensitiveRequests.includes("password"), body);
  }

  const multiPortal = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Sign in using one of these portals: https://portal.district.example or https://evil.example.",
  });
  assert.ok(
    multiPortal.reasons.some((reason) => reason.label === "External authentication destination")
  );

  const unicodeDomain = scan({
    sender: "IT <notice@bücher.de>",
    replyTo: "support@bücher.de",
    subject: "Account review",
    body: "Sign in at https://portal.bücher.de/review.",
  });
  assert.ok(
    !unicodeDomain.reasons.some((reason) =>
      ["Reply-To domain mismatch", "External authentication destination"].includes(reason.label)
    )
  );

  const fractionalSettings = structuredClone(settings);
  fractionalSettings.context.authenticationRequest = 0.5;
  const rounded = scoreEmail(
    parseEmail({
      sender: "IT <notice@district.example>",
      subject: "Account review",
      body: "Sign in at https://portal.district.example/review.",
    }),
    lists,
    fractionalSettings
  );
  assert.equal(rounded.score, 1);
  assert.ok(rounded.reasons.some((reason) => reason.label === "Score rounded"));
  assert.ok(!rounded.reasons.some((reason) => reason.label === "Score floored at 0"));
});

test("negated authentication and deadline statements remain benign", () => {
  const authWarning = scan({
    sender: "IT <notice@district.example>",
    subject: "Safety reminder",
    body: "Never sign in at https://evil.example/ from an unsolicited email.",
  });
  const reassuringPayroll = scan({
    sender: "Payroll <notice@district.example>",
    subject: "Payroll status",
    body: "Your payment will not be held for manual review.",
  });

  assert.ok(
    !authWarning.reasons.some((reason) =>
      ["Authentication requested through a link", "External authentication destination"].includes(reason.label)
    )
  );
  assert.ok(
    !reassuringPayroll.reasons.some((reason) => reason.label === "Restrained deadline pressure")
  );
});

test("intermediary warning verbs negate authentication without hiding later requests", () => {
  const warningOnly = scan({
    sender: "IT <notice@district.example>",
    subject: "Safety reminder",
    body: "We will never ask you to authenticate at https://evil.example.",
  });
  const warningThenRequest = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "We will never ask you to authenticate from an unsolicited email. For this requested review, sign in at https://portal.district.example/review.",
  });

  assert.ok(
    !warningOnly.reasons.some((reason) =>
      ["Authentication requested through a link", "External authentication destination"].includes(reason.label)
    )
  );
  assert.ok(
    warningThenRequest.reasons.some((reason) => reason.label === "Authentication requested through a link")
  );
});

test("broader governing negations and same-sentence documentation remain benign", () => {
  for (const body of [
    "We will not ask you to sign in at https://evil.example.",
    "You do not need to sign in at https://evil.example.",
    "Your payment is not expected to be held for manual review.",
    "You are not required to provide your password.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Safety reminder",
      body,
    });
    assert.ok(
      !result.reasons.some((reason) =>
        [
          "Authentication requested through a link",
          "External authentication destination",
          "Restrained deadline pressure",
          "Sensitive information request",
        ].includes(reason.label)
      ),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }

  const documentation = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Sign in at https://login.district.example/review and see documentation at https://docs.vendor.example/help.",
  });
  assert.ok(
    !documentation.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("routine security terminology and indirect reassurance stay benign", () => {
  for (const body of [
    "There is no need to sign in at https://evil.example.",
    "Never attempt to sign in at https://evil.example.",
    "There is no risk that your payment will be held for manual review.",
    "Your password was changed yesterday.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Routine notice",
      body,
    });
    assert.ok(
      !result.reasons.some((reason) =>
        [
          "Authentication requested through a link",
          "External authentication destination",
          "Restrained deadline pressure",
          "Sensitive information request",
        ].includes(reason.label)
      ),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }
});

test("passive governing negations stay benign", () => {
  for (const body of [
    "You will not be asked to sign in at https://evil.example.",
    "You are not expected to be asked to sign in at https://evil.example.",
    "You will not be asked to provide your password.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Safety reminder",
      body,
    });
    assert.ok(
      !result.reasons.some((reason) =>
        [
          "Authentication requested through a link",
          "External authentication destination",
          "Sensitive information request",
        ].includes(reason.label)
      ),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }
});

test("credential verbs, safe trust entries, and policy notices are classified correctly", () => {
  for (const body of [
    "Verify your account at https://evil.example.",
    "Enter your username and password at https://evil.example.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Account review",
      body,
    });
    assert.ok(
      result.reasons.some((reason) => reason.label === "External authentication destination"),
      body
    );
  }

  for (const body of [
    "Password is required to be at least 14 characters.",
    "Please confirm password requirements with the service desk.",
    "Bank account information is required for payroll records, but do not send it by email.",
  ]) {
    const result = scan({ sender: "HR <hr@district.example>", subject: "Policy", body });
    assert.ok(
      !result.reasons.some((reason) => reason.label === "Sensitive information request"),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }

  for (const body of [
    "There is no need for you to sign in at https://evil.example.",
    "There is no risk your access will be locked for review.",
    "Sign in to the district portal, not https://evil.example.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Safety reminder",
      body,
    });
    assert.ok(
      !result.reasons.some((reason) =>
        ["External authentication destination", "Restrained deadline pressure"].includes(reason.label)
      ),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }
});

test("site-list entries reject suffixes and IP literals", () => {
  for (const value of ["co.uk", "github.io", "127.0.0.1"]) {
    assert.equal(isValidSiteListEntry(value), false, value);
  }
  assert.equal(isValidSiteListEntry("district.co.uk"), true);
  assert.equal(isValidSiteListEntry("school.github.io"), true);
});

test("multiline auth destinations and direct credential requests resist evasion", () => {
  const multiline = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Sign in using the link below:\nhttps://evil.example/login",
  });
  assert.ok(
    multiline.reasons.some((reason) => reason.label === "External authentication destination")
  );

  for (const body of [
    "Please complete the form with your password.",
    "We need your password to continue.",
  ]) {
    const result = scan({ sender: "IT <notice@district.example>", subject: "Request", body });
    assert.ok(
      result.reasons.some((reason) => reason.label === "Sensitive information request"),
      body
    );
  }
});

test("modal and contrastive negations remain benign", () => {
  for (const body of [
    "You won't have to sign in at https://evil.example.",
    "You are not going to be asked to sign in at https://evil.example.",
    "You are unlikely to be asked to sign in at https://evil.example.",
    "Enter the code, not your password.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Safety reminder",
      body,
    });
    assert.ok(
      !result.reasons.some((reason) =>
        ["External authentication destination", "Sensitive information request"].includes(
          reason.label
        )
      ),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }
});

test("credential vocabulary and URL-path isolation avoid misses and false positives", () => {
  for (const body of [
    "Enter your password at https://evil.example.",
    "Provide your credentials at https://evil.example.",
    "Submit your username and password at https://evil.example.",
  ]) {
    const result = scan({
      sender: "IT <notice@district.example>",
      subject: "Account review",
      body,
    });
    assert.ok(
      result.reasons.some((reason) => reason.label === "External authentication destination"),
      `${body}: ${JSON.stringify(result.reasons)}`
    );
  }

  const documentation = scan({
    sender: "IT <notice@district.example>",
    subject: "Documentation",
    body: "Documentation is at https://evil.example/login/help.",
  });
  assert.ok(
    !documentation.reasons.some((reason) =>
      [
        "Authentication requested through a link",
        "External authentication destination",
      ].includes(reason.label)
    ),
    JSON.stringify(documentation.reasons)
  );

  const excluded = scan({
    sender: "IT <notice@district.example>",
    subject: "Safety reminder",
    body: "Sign in to the district portal, not https://evil.example.",
  });
  assert.ok(
    !excluded.reasons.some((reason) =>
      [
        "Authentication requested through a link",
        "External authentication destination",
      ].includes(reason.label)
    ),
    JSON.stringify(excluded.reasons)
  );
});

test("period-terminated preceding auth page remains explicitly associated", () => {
  const result = scan({
    sender: "Payroll <notice@district.example>",
    replyTo: "review@external.example",
    subject: "Payroll review before Friday",
    body:
      "Visit https://evil.example. This page asks you to enter your password before Friday.",
  });

  assert.ok(
    result.reasons.some((reason) => reason.label === "External authentication destination")
  );
  assert.ok(
    result.reasons.some((reason) => reason.label === "Coordinated social-engineering pattern")
  );
});

test("any external Reply-To mailbox triggers mismatch even when a same-domain address is first", () => {
  const parsed = parseEmail({
    sender: "Payroll <notice@district.example>",
    replyTo: "Payroll <reply@district.example>, Review <case@external.example>",
    subject: "Payroll account review",
    body: "Sign in at https://portal.district.example/review",
  });
  const result = scoreEmail(parsed, lists, settings);

  assert.deepEqual(parsed.replyToDomains, ["district.example", "external.example"]);
  assert.ok(
    result.reasons.some((reason) => reason.label === "Reply-To domain mismatch")
  );
});

test("Reply-To parsing ignores email-like display names and preserves punycode domains", () => {
  const parsed = parseEmail({
    sender: "IT <notice@example.xn--p1ai>",
    replyTo: '"Escalate via old@external.example" <reply@example.xn--p1ai>',
    subject: "Account review",
    body: "Sign in at https://example.xn--p1ai/review",
  });
  const result = scoreEmail(parsed, lists, settings);

  assert.deepEqual(parsed.replyToDomains, ["example.xn--p1ai"]);
  assert.ok(
    !result.reasons.some((reason) => reason.label === "Reply-To domain mismatch")
  );
});

test("different organizations sharing a multi-label suffix still mismatch", () => {
  const result = scan({
    sender: "Payroll <notice@district.co.uk>",
    subject: "Payroll account review",
    body: "Sign in with your work account at https://portal.evil.co.uk/review",
  });

  assert.ok(
    result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("sibling subdomains of the same registrable organization do not mismatch", () => {
  const result = scan({
    sender: "Payroll <notice@mail.district.co.uk>",
    subject: "Payroll account review",
    body: "Sign in with your work account at https://portal.district.co.uk/review",
  });

  assert.ok(
    !result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("sender parent and link subdomain are the same organization", () => {
  const result = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Sign in at https://portal.district.example/review",
  });
  assert.ok(
    !result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("sender subdomain and link parent are the same organization", () => {
  const result = scan({
    sender: "IT <notice@mail.district.example>",
    subject: "Account review",
    body: "Sign in at https://district.example/review",
  });
  assert.ok(
    !result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("unrelated external help link is not treated as the authentication destination", () => {
  const result = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Sign in at https://login.district.example/review. For vendor documentation, see https://docs.vendor.example/help.",
  });

  assert.ok(
    !result.reasons.some((reason) => reason.label === "External authentication destination")
  );
  assert.ok(
    !result.reasons.some((reason) => reason.label === "Coordinated social-engineering pattern")
  );
});

test("overlapping authentication phrases do not capture preceding documentation links", () => {
  const result = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Documentation: https://docs.vendor.example/help. Sign in using your district account at https://login.district.example/review.",
  });

  assert.ok(
    !result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("explicitly referenced preceding auth page is retained alongside following help", () => {
  const result = scan({
    sender: "IT <notice@district.example>",
    subject: "Account review",
    body: "Visit https://evil.example; this page will ask you to sign in, or see https://district.example/help.",
  });

  assert.ok(
    result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("legitimate external payroll provider does not create a coordinated attack by itself", () => {
  const result = scan({
    sender: "Payroll Operations <payroll@district.example>",
    replyTo: "payroll@district.example",
    subject: "Payroll portal access",
    body: "Sign in to the district payroll provider at https://benefits.vendor.example/login. No deadline applies and no payroll changes are requested.",
  });

  assert.equal(result.score, 2);
  assert.ok(
    !result.reasons.some((reason) => reason.label === "Coordinated social-engineering pattern")
  );
});

test("missing or malformed domains do not fabricate mismatch reasons", () => {
  for (const input of [
    { sender: "unknown", body: "Sign in at https://district.example/review" },
    { sender: "IT <notice@district.example>", replyTo: "not-an-address", body: "Sign in at https://district.example/review" },
  ]) {
    const result = scan({ subject: "Account review", ...input });
    assert.ok(
      !result.reasons.some((reason) => reason.label === "Reply-To domain mismatch")
    );
  }
});

test("private-suffix sites are compared as separate organizations", () => {
  const result = scan({
    sender: "IT <notice@school-one.github.io>",
    subject: "Account review",
    body: "Sign in at https://school-two.github.io/review",
  });
  assert.ok(
    result.reasons.some((reason) => reason.label === "External authentication destination")
  );
});

test("routine same-domain payroll notice does not become suspicious from context alone", () => {
  const result = scan({
    sender: "Payroll Operations <payroll@district.example>",
    replyTo: "payroll@district.example",
    subject: "Thursday payroll schedule",
    body: "Thursday payroll will be processed at 4:30 PM. No action is required. View the schedule at https://staff.district.example/payroll.",
  });

  assert.equal(result.score, 0);
  assert.ok(
    !result.reasons.some((reason) =>
      ["Reply-To domain mismatch", "External authentication destination"].includes(reason.label)
    )
  );
});
