import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loginWithCredentials, getUserFromSession } from "../../server/authSessions.js";

test("shared data auth creates a session for provisioned users", () => {
  const testPassword = `student-${"s".repeat(24)}`;
  process.env.SHARED_AUTH_USERS_JSON = JSON.stringify([
    {
      username: "student",
      password: testPassword,
      role: "student",
      displayName: "Student",
    },
  ]);
  const result = loginWithCredentials("student", testPassword);
  assert.equal(result.ok, true);
  assert.ok(result.token);
  assert.equal(result.user.role, "student");

  const restored = getUserFromSession(result.token);
  assert.equal(restored?.username, "student");
});

test("shared site lists persist on the server", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "email-scanner-shared-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  process.env.SITE_LISTS_DATA_PATH = join(dir, "site-lists.json");
  process.env.SITE_LIST_SUGGESTIONS_DATA_PATH = join(dir, "site-list-suggestions.json");

  const { addSiteListDomain, getSiteLists } = await import(
    "../../server/siteListsService.js"
  );
  const { createSiteListSuggestion, reviewSiteListSuggestion } = await import(
    "../../server/siteListSuggestionsService.js"
  );

  const added = await addSiteListDomain("suspicious", "cross-device.example.com");
  assert.equal(added.ok, true);

  const loaded = await getSiteLists();
  assert.ok(
    loaded.lists.suspiciousSites.includes("cross-device.example.com")
  );

  const suggested = await createSiteListSuggestion("dangerous", "evil-shared.example.com", {
    suggestedBy: "Demo Student",
    note: "Phishing",
  });
  assert.equal(suggested.ok, true);

  const approved = await reviewSiteListSuggestion(suggested.entry.id, "approve");
  assert.equal(approved.ok, true);
  assert.ok(approved.lists.dangerousSites.includes("evil-shared.example.com"));
});
