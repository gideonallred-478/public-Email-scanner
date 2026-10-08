import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import {
  pollLocalSmtpInbox,
  verifyLocalSmtpInboxConnection,
} from "../../server/providers/localSmtpInboxProvider.js";
import { isMailboxConfigured, MAILBOX_PROVIDERS } from "../../server/config.js";
import { assert } from "./helpers.mjs";

describe("local smtp inbox provider", () => {
  it("detects configured local-smtp-inbox without IMAP credentials", () => {
    assert.equal(
      isMailboxConfigured({
        provider: MAILBOX_PROVIDERS.LOCAL_SMTP_INBOX,
        localSmtpInbox: { path: "C:\\tmp\\smtp-inbox" },
        imap: {},
        microsoftGraph: {},
      }),
      true
    );
  });

  it("polls new .eml files from the harness inbox", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "smtp-inbox-"));
    const inbox = join(dir, "inbox");
    await mkdir(inbox, { recursive: true });
    process.env.SMTP_INBOX_STATE_PATH = join(dir, "delivered.json");

    t.after(() => {
      delete process.env.SMTP_INBOX_STATE_PATH;
    });

    await writeFile(
      join(inbox, "message-test.eml"),
      [
        "From: Payroll Operations <scammer@fake.example>",
        "Reply-To: payroll@fake.example, case-review@other.example",
        "To: tester@localhost",
        "Subject: Urgent scholarship claim",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Click here to claim your free scholarship now.",
      ].join("\r\n"),
      "utf8"
    );

    const config = {
      mailbox: "tester@localhost",
      localSmtpInbox: { path: inbox },
    };

    const verify = await verifyLocalSmtpInboxConnection(config);
    assert.equal(verify.ok, true);

    const first = await pollLocalSmtpInbox(config);
    assert.equal(first.length, 1);
    assert.equal(first[0].subject, "Urgent scholarship claim");
    assert.match(first[0].from, /scammer@fake.example/);
    assert.equal(
      first[0].replyTo,
      "payroll@fake.example, case-review@other.example"
    );

    const second = await pollLocalSmtpInbox(config);
    assert.equal(second.length, 0);
  });
});
