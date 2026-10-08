import { describe, it } from "node:test";
import {
  isSubdomainOf,
  isValidSiteListEntry,
} from "../../src/scanner/domainUtils.js";
import {
  addDomainToList,
  findDuplicateSiteListEntry,
  getDefaultSiteLists,
  getDomainCategory,
} from "../../src/scanner/trustedLinksStore.js";
import { assert } from "./helpers.mjs";

describe("site list domain validation", () => {
  it("rejects bare TLD entries", () => {
    assert.equal(isValidSiteListEntry("com"), false);
    assert.equal(isValidSiteListEntry("edu"), false);
    assert.equal(isValidSiteListEntry("school.edu"), true);
  });

  it("does not add bare TLDs to lists", () => {
    const before = getDefaultSiteLists();
    const after = addDomainToList(before, "trusted", "com");
    assert.deepEqual(after.trusted, before.trusted);
  });

  it("isSubdomainOf does not match entire TLDs", () => {
    assert.equal(isSubdomainOf("evil.com", "com"), false);
    assert.equal(isSubdomainOf("student.university.edu", "edu"), false);
    assert.equal(isSubdomainOf("mail.school.edu", "school.edu"), true);
  });

  it("adding a valid parent domain matches subdomains only", () => {
    let lists = addDomainToList(getDefaultSiteLists(), "trusted", "school.edu");
    assert.equal(getDomainCategory("school.edu", lists), "trusted");
    assert.equal(getDomainCategory("docs.school.edu", lists), "trusted");
    assert.equal(getDomainCategory("notschool.edu", lists), "unknown");
    assert.equal(getDomainCategory("evil.com", lists), "unknown");
  });

  it("findDuplicateSiteListEntry detects same-category duplicates", () => {
    const lists = getDefaultSiteLists();
    const duplicate = findDuplicateSiteListEntry(
      lists,
      "trusted",
      "lincoln-high.edu"
    );
    assert.equal(duplicate?.domain, "lincoln-high.edu");
    assert.match(duplicate?.message ?? "", /already on the/i);

    const fresh = findDuplicateSiteListEntry(
      lists,
      "trusted",
      "brand-new-example.org"
    );
    assert.equal(fresh, null);
  });
});
