import { describe, it } from "node:test";
import {
  buildDocumentTitle,
  getDocumentTitleForTab,
} from "../../src/utils/documentTitle.js";
import { assert } from "./helpers.mjs";

describe("document title", () => {
  it("builds titles with app name", () => {
    assert.equal(buildDocumentTitle("Scanner"), "Scanner · Phishing Detector");
  });

  it("maps tab ids to labels", () => {
    assert.equal(getDocumentTitleForTab("alerts"), "Alerts · Phishing Detector");
    assert.equal(getDocumentTitleForTab("site-lists"), "Site Lists · Phishing Detector");
  });
});
