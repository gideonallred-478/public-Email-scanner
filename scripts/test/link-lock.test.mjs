import { describe, it } from "node:test";
import {
  defangUrl,
  defangUrlsInText,
  isUrgentRecord,
  shouldLockLinks,
} from "../../src/scanner/linkLock.js";
import { getDemoScenarioById } from "../../src/samples/demoScenarios.js";
import { getDefaultSiteLists } from "../../src/scanner/trustedLinksStore.js";
import { getDefaultScoringSettings } from "../../src/scanner/scoringSettings.js";
import { assert, scanScenario } from "./helpers.mjs";

describe("link lock", () => {
  it("defangs http and https URLs", () => {
    assert.equal(
      defangUrl("https://evil.example.com/path"),
      "hxxps://evil[.]example[.]com/path"
    );
    assert.equal(defangUrl("http://bad.test"), "hxxp://bad[.]test");
  });

  it("defangs URLs inside message body text", () => {
    const body = "Click https://evil.example.com now";
    assert.equal(
      defangUrlsInText(body),
      "Click hxxps://evil[.]example[.]com now"
    );
  });

  it("locks links at configured minimum score", () => {
    assert.ok(isUrgentRecord({ score: 8, flags: {} }));
    assert.ok(isUrgentRecord({ score: 6, flags: { linksLocked: true } }));
    assert.ok(!isUrgentRecord({ score: 7, flags: {} }));
    assert.ok(shouldLockLinks({ scoreResult: { score: 9 } }));
    assert.ok(!shouldLockLinks({ scoreResult: { score: 7 } }));
  });

  it("sets linksLocked on urgent demo alerts", () => {
    const scenario = getDemoScenarioById("fake-password-reset");
    const { alert } = scanScenario(
      scenario,
      getDefaultSiteLists(),
      getDefaultScoringSettings()
    );
    assert.ok(alert);
    assert.ok(alert.flags?.urgentPopup);
    assert.equal(alert.flags?.linksLocked, true);
  });
});
