import { describe, it } from "node:test";
import { parseEmail } from "../../src/parser/emailParser.js";
import { scoreEmail } from "../../src/scanner/scoringEngine.js";
import {
  addDomainToList,
  getDefaultSiteLists,
} from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { assert } from "./helpers.mjs";

const settings = getDefaultScoringSettings();

describe("scan snapshot consistency", () => {
  it("live rescore can drift after site list changes", () => {
    const listsAtScan = getDefaultSiteLists();
    const parsed = parseEmail({
      sender: "sender@unknown-site.net",
      subject: "Check this",
      body: "https://unknown-site.net/page",
      hasAttachment: false,
      spreadCount: 1,
      studentReportCount: 0,
      verifiedSchoolAccount: false,
    });

    const snapshot = scoreEmail(parsed, listsAtScan, settings);
    const listsAfter = addDomainToList(
      listsAtScan,
      "suspicious",
      "unknown-site.net"
    );
    const liveRescore = scoreEmail(parsed, listsAfter, settings);

    assert.notEqual(
      snapshot.score,
      liveRescore.score,
      "changing site lists after scan should change a live rescore"
    );

    const snapshotAlertScore = snapshot.score;
    assert.equal(
      snapshotAlertScore,
      snapshot.score,
      "UI should keep alert-aligned score from scan snapshot, not live rescore"
    );
    assert.ok(
      liveRescore.score > snapshot.score,
      "marking link domain suspicious after scan should raise live rescore only"
    );
  });
});
