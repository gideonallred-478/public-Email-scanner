import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authenticateLocalUser,
  formatRoleLabel,
  LOCAL_DEV_USERS,
  USER_ROLES,
} from "../../src/auth/authConfig.js";

test("browser-shipped local credentials cannot authenticate", () => {
  assert.equal(authenticateLocalUser("demo-admin", "123456789"), null);
  assert.equal(authenticateLocalUser("teacher", "anything"), null);
});

test("display fixtures contain no browser-visible passwords", () => {
  assert.equal(LOCAL_DEV_USERS.length > 0, true);
  assert.equal(LOCAL_DEV_USERS.every((user) => !("password" in user)), true);
});

test("formatRoleLabel maps known roles", () => {
  assert.equal(formatRoleLabel(USER_ROLES.TEACHER), "Teacher");
});
