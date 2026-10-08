import { describe, it } from "node:test";
import { getFocusableElements } from "../../src/utils/focusTrap.js";
import { assert } from "./helpers.mjs";

describe("focus trap helpers", () => {
  it("returns an empty list for a missing container", () => {
    assert.deepEqual(getFocusableElements(null), []);
  });
});
