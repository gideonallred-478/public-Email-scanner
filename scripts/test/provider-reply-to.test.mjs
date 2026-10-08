import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGraphMessage } from "../../server/providers/graphProvider.js";
import { parseImapMessageSource } from "../../server/providers/imapProvider.js";

test("Graph normalization preserves every Reply-To mailbox", () => {
  const normalized = normalizeGraphMessage(
    {
      id: "graph-1",
      from: { emailAddress: { name: "Payroll", address: "notice@district.example" } },
      replyTo: [
        { emailAddress: { name: "Payroll", address: "reply@district.example" } },
        { emailAddress: { name: "Review", address: "case@external.example" } },
      ],
      subject: "Review",
      body: { content: "Body" },
      receivedDateTime: "2026-08-12T12:00:00.000Z",
    },
    "user@district.example"
  );

  assert.equal(
    normalized.replyTo,
    "Payroll <reply@district.example>, Review <case@external.example>"
  );
});

test("IMAP source parsing preserves every Reply-To mailbox", async () => {
  const parsed = await parseImapMessageSource(
    Buffer.from(
      [
        "From: Payroll <notice@district.example>",
        "Reply-To: Payroll <reply@district.example>, Review <case@external.example>",
        "Subject: Review",
        "Message-ID: <imap-1@district.example>",
        "",
        "Body",
      ].join("\r\n")
    )
  );

  assert.equal(
    parsed.replyTo,
    "Payroll <reply@district.example>, Review <case@external.example>"
  );
});
