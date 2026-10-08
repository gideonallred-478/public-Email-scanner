import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGmailAppPassword,
  readEnvFileValue,
} from "../../server/envFile.js";

test("normalizeGmailAppPassword strips spaces and quotes", () => {
  assert.equal(normalizeGmailAppPassword("abcd efgh ijkl mnop"), "abcdefghijklmnop");
  assert.equal(normalizeGmailAppPassword('"abcd efgh ijkl mnop"'), "abcdefghijklmnop");
});

test("readEnvFileValue keeps spaced app password from file line", () => {
  const value = readEnvFileValue("IMAP_PASSWORD");
  assert.equal(typeof value, "string");
  if (value) {
    assert.ok(value.length >= 4);
  }
});
