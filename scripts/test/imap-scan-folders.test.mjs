import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatScanFolderLabel,
  resolveImapScanFolders,
} from "../../server/providers/imapScanFolders.js";

test("resolveImapScanFolders includes inbox and junk special-use folder", () => {
  const folders = resolveImapScanFolders([
    { path: "INBOX", specialUse: null },
    { path: "[Gmail]/Spam", specialUse: "\\Junk" },
    { path: "[Gmail]/Sent Mail", specialUse: "\\Sent" },
  ]);

  assert.deepEqual(folders, ["INBOX", "[Gmail]/Spam"]);
});

test("resolveImapScanFolders falls back to known junk folder names", () => {
  const folders = resolveImapScanFolders([
    { path: "INBOX", specialUse: null },
    { path: "Junk Email", specialUse: null },
  ]);

  assert.deepEqual(folders, ["INBOX", "Junk Email"]);
});

test("resolveImapScanFolders always includes inbox even when not listed", () => {
  const folders = resolveImapScanFolders([]);
  assert.deepEqual(folders, ["INBOX"]);
});

test("formatScanFolderLabel maps common folder paths", () => {
  assert.equal(formatScanFolderLabel("INBOX"), "Inbox");
  assert.equal(formatScanFolderLabel("[Gmail]/Spam"), "Spam");
  assert.equal(formatScanFolderLabel("Junk Email"), "Spam");
});
