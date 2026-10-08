import { describe, it } from "node:test";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import {
  appendSiteListSuggestion,
  buildSiteListSuggestion,
  listPendingSiteListSuggestions,
  SUGGESTION_STATUS,
  updateSiteListSuggestionStatus,
} from "../../src/scanner/siteListSuggestions.js";
import { assert } from "./helpers.mjs";

describe("site list suggestions", () => {
  it("creates pending suspicious suggestions without touching lists", () => {
    const lists = getDefaultSiteLists();
    const result = buildSiteListSuggestion(
      lists,
      [],
      "suspicious",
      "fake-login.example.com",
      { suggestedBy: "Demo Teacher", note: "Phishing link" }
    );

    assert.equal(result.ok, true);
    assert.equal(result.entry.status, SUGGESTION_STATUS.PENDING);
    assert.equal(result.entry.domain, "fake-login.example.com");
    assert.equal(lists.suspiciousSites.includes("fake-login.example.com"), false);
  });

  it("blocks duplicate pending suggestions", () => {
    const lists = getDefaultSiteLists();
    const first = buildSiteListSuggestion(
      lists,
      [],
      "dangerous",
      "evil.example.com"
    );
    const entries = appendSiteListSuggestion([], first.entry);
    const second = buildSiteListSuggestion(
      lists,
      entries,
      "dangerous",
      "evil.example.com"
    );

    assert.equal(second.ok, false);
    assert.equal(second.reason, "duplicate_pending");
  });

  it("marks suggestions approved or dismissed", () => {
    const created = buildSiteListSuggestion(
      getDefaultSiteLists(),
      [],
      "suspicious",
      "review-me.example.com"
    );
    const pending = appendSiteListSuggestion([], created.entry);
    assert.equal(listPendingSiteListSuggestions(pending).length, 1);

    const dismissed = updateSiteListSuggestionStatus(
      pending,
      created.entry.id,
      SUGGESTION_STATUS.DISMISSED
    );
    assert.equal(listPendingSiteListSuggestions(dismissed).length, 0);
  });
});
