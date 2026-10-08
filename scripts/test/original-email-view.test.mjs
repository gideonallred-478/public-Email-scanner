import { describe, it } from "node:test";
import {
  buildOriginalEmailViewModel,
  ORIGINAL_EMAIL_DEFAULT_OPEN,
} from "../../src/scanner/originalEmailView.js";
import { assert } from "./helpers.mjs";

describe("original email view", () => {
  it("starts collapsed so long emails do not dominate the analysis panel", () => {
    assert.equal(ORIGINAL_EMAIL_DEFAULT_OPEN, false);
  });

  it("preserves exact message fields for display", () => {
    const record = {
      timestamp: "2026-08-12T16:26:14.000Z",
      email: {
        messageId: "<message@example.test>",
        mailbox: "tester@localhost",
        receivedAt: "2026-08-12T16:26:13.000Z",
        sender: "Records Team <records@example.test>",
        replyTo: "case-review@example.test",
        subject: "Quarterly access continuity check",
        body: "First line.\n\nSecond line with exact spacing.",
        hasAttachment: false,
      },
    };

    assert.deepEqual(buildOriginalEmailViewModel(record), {
      messageId: "<message@example.test>",
      from: "Records Team <records@example.test>",
      replyTo: "case-review@example.test",
      to: "tester@localhost",
      subject: "Quarterly access continuity check",
      receivedAt: "2026-08-12T16:26:13.000Z",
      body: "First line.\n\nSecond line with exact spacing.",
      hasAttachment: false,
    });
  });

  it("returns null when the record has no linked email", () => {
    assert.equal(buildOriginalEmailViewModel({ subject: "Legacy" }), null);
  });
});
