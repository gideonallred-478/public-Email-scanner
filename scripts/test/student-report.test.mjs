import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDashboardRecordRescan,
  createDashboardRecordFromScan,
  ALERT_STATUS,
} from "../../src/scanner/alertEngine.js";
import { incrementStudentReports } from "../../src/scanner/recordRescan.js";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import { getActionPlan } from "../../src/scanner/actionEngine.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";

test("incrementStudentReports bumps count", () => {
  assert.deepEqual(incrementStudentReports({ studentReportCount: 2 }), {
    studentReportCount: 3,
  });
});

test("applyDashboardRecordRescan keeps alert id and adds report metadata", () => {
  const siteLists = getDefaultSiteLists();
  const settings = getDefaultScoringSettings();
  const input = {
    sender: "trusted@school.edu",
    subject: "Classroom link",
    body: "Please review https://classroom.google.com/c/abc",
    spreadCount: 85,
    studentReportCount: 0,
    verifiedSchoolAccount: true,
  };

  const parsed = parseEmail(input);
  const scoreResult = scoreEmail(parsed, siteLists, settings);
  const actionPlan = getActionPlan(scoreResult, parsed);

  const original = createDashboardRecordFromScan(
    parsed,
    scoreResult,
    actionPlan,
    scoreResult.trustDecay,
    scoreResult.lookalikeResult,
    siteLists,
    { scanSnapshot: null }
  );

  const reportedInput = incrementStudentReports(input);
  const reparsed = parseEmail(reportedInput);
  const rescored = scoreEmail(reparsed, siteLists, settings);
  const replan = getActionPlan(rescored, reparsed);

  const updated = applyDashboardRecordRescan(
    { ...original, id: "alert-test-1" },
    {
      parsed: reparsed,
      scoreResult: rescored,
      actionPlan: replan,
      trustDecay: rescored.trustDecay,
      lookalikeResult: rescored.lookalikeResult,
      scanSnapshot: null,
      siteLists,
      reporterName: "demo-admin",
    }
  );

  assert.equal(updated.id, "alert-test-1");
  assert.equal(updated.scanInput.studentReportCount, 1);
  assert.equal(updated.userReports?.length, 1);
  assert.equal(updated.flags.userReported, true);
  assert.ok(updated.score >= original.score);
});

test("dashboard scan snapshots preserve Reply-To for later rescoring", () => {
  const siteLists = getDefaultSiteLists();
  const settings = getDefaultScoringSettings();
  const input = {
    sender: "Payroll <notice@district.example>",
    replyTo: "reply@district.example, case@external.example",
    subject: "Payroll review",
    body: "Sign in at https://portal.district.example/review",
  };
  const parsed = parseEmail(input);
  const scoreResult = scoreEmail(parsed, siteLists, settings);
  const record = createDashboardRecordFromScan(
    parsed,
    scoreResult,
    getActionPlan(scoreResult, parsed),
    scoreResult.trustDecay,
    scoreResult.lookalikeResult,
    siteLists
  );

  assert.equal(record.scanInput.replyTo, input.replyTo);
  const rescored = scoreEmail(parseEmail(record.scanInput), siteLists, settings);
  assert.ok(
    rescored.reasons.some((reason) => reason.label === "Reply-To domain mismatch")
  );
});

test("applyDashboardRecordRescan reopens resolved alerts after report", () => {
  const siteLists = getDefaultSiteLists();
  const settings = getDefaultScoringSettings();
  const input = {
    sender: "a@b.com",
    subject: "Hello",
    body: "Normal message",
    studentReportCount: 4,
  };

  const parsed = parseEmail(input);
  const scoreResult = scoreEmail(parsed, siteLists, settings);
  const actionPlan = getActionPlan(scoreResult, parsed);
  const fresh = createDashboardRecordFromScan(
    parsed,
    scoreResult,
    actionPlan,
    scoreResult.trustDecay,
    scoreResult.lookalikeResult,
    siteLists
  );

  const updated = applyDashboardRecordRescan(
    { ...fresh, id: "alert-test-2", status: ALERT_STATUS.RESOLVED },
    {
      parsed,
      scoreResult,
      actionPlan,
      trustDecay: scoreResult.trustDecay,
      lookalikeResult: scoreResult.lookalikeResult,
      siteLists,
    }
  );

  assert.equal(updated.status, ALERT_STATUS.UNDER_REVIEW);
});
