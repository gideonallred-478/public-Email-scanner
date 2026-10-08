import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessTab,
  canClearAllAlerts,
  canEditSiteLists,
  canManageNotificationSettings,
  canReviewSiteListSuggestions,
  canSuggestSiteLists,
  getDefaultTabForRole,
  getTabsForRole,
} from "../../src/auth/rolePermissions.js";
import { USER_ROLES } from "../../src/auth/authConfig.js";

test("admin can access settings and edit site lists", () => {
  assert.equal(canAccessTab(USER_ROLES.ADMIN, "settings"), true);
  assert.equal(canEditSiteLists(USER_ROLES.ADMIN), true);
});

test("teacher cannot access settings but can edit site lists", () => {
  assert.equal(canAccessTab(USER_ROLES.TEACHER, "settings"), false);
  assert.equal(canAccessTab(USER_ROLES.TEACHER, "site-lists"), true);
  assert.equal(canEditSiteLists(USER_ROLES.TEACHER), true);
});

test("teacher tabs exclude settings and demo", () => {
  const tabIds = getTabsForRole(USER_ROLES.TEACHER).map((tab) => tab.id);
  assert.ok(tabIds.includes("alerts"));
  assert.ok(!tabIds.includes("settings"));
  assert.ok(!tabIds.includes("demo"));
});

test("only admin can access demo tab", () => {
  assert.equal(canAccessTab(USER_ROLES.ADMIN, "demo"), true);
  assert.equal(canAccessTab(USER_ROLES.IT, "demo"), false);
  assert.equal(canAccessTab(USER_ROLES.TEACHER, "demo"), false);
});

test("admin and it can access tracker tab", () => {
  assert.equal(canAccessTab(USER_ROLES.ADMIN, "tracker"), true);
  assert.equal(canAccessTab(USER_ROLES.IT, "tracker"), true);
  assert.equal(canAccessTab(USER_ROLES.TEACHER, "tracker"), false);
});

test("it can access settings and edit site lists", () => {
  assert.equal(canAccessTab(USER_ROLES.IT, "settings"), true);
  assert.equal(canEditSiteLists(USER_ROLES.IT), true);
});

test("getDefaultTabForRole falls back to alerts", () => {
  assert.equal(getDefaultTabForRole(USER_ROLES.TEACHER), "alerts");
});

test("student only sees site lists tab", () => {
  const tabIds = getTabsForRole(USER_ROLES.STUDENT).map((tab) => tab.id);
  assert.deepEqual(tabIds, ["site-lists"]);
  assert.equal(getDefaultTabForRole(USER_ROLES.STUDENT), "site-lists");
  assert.equal(canEditSiteLists(USER_ROLES.STUDENT), false);
  assert.equal(canSuggestSiteLists(USER_ROLES.STUDENT), true);
  assert.equal(canReviewSiteListSuggestions(USER_ROLES.STUDENT), false);
});

test("teacher can edit but not suggest or review site list suggestions", () => {
  assert.equal(canEditSiteLists(USER_ROLES.TEACHER), true);
  assert.equal(canSuggestSiteLists(USER_ROLES.TEACHER), false);
  assert.equal(canReviewSiteListSuggestions(USER_ROLES.TEACHER), false);
});

test("admin and it can review site list suggestions", () => {
  assert.equal(canReviewSiteListSuggestions(USER_ROLES.ADMIN), true);
  assert.equal(canReviewSiteListSuggestions(USER_ROLES.IT), true);
});

test("only administrators can clear shared alert history", () => {
  assert.equal(canClearAllAlerts(USER_ROLES.ADMIN), true);
  assert.equal(canClearAllAlerts(USER_ROLES.IT), false);
  assert.equal(canClearAllAlerts(USER_ROLES.TEACHER), false);
  assert.equal(canClearAllAlerts(USER_ROLES.PRINCIPAL), false);
});

test("only admin and IT can manage notification delivery", () => {
  assert.equal(canManageNotificationSettings(USER_ROLES.ADMIN), true);
  assert.equal(canManageNotificationSettings(USER_ROLES.IT), true);
  assert.equal(canManageNotificationSettings(USER_ROLES.TEACHER), false);
  assert.equal(canManageNotificationSettings(USER_ROLES.PRINCIPAL), false);
  assert.equal(canManageNotificationSettings(USER_ROLES.STUDENT), false);
});
