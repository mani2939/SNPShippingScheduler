import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { adminConfigured, credentialsMatch } from "../lib/credentials.ts";
test("admin login requires both correct username and password and fails closed without configuration", () => {
  const before = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  try {
    process.env.ADMIN_USERNAME = "dispatch-admin";
    process.env.ADMIN_PASSWORD_HASH =
      "test-salt:" +
      scryptSync("test-password", "test-salt", 64).toString("hex");
    process.env.SESSION_SECRET = "a".repeat(48);
    assert.equal(adminConfigured(), true);
    assert.equal(credentialsMatch("dispatch-admin", "test-password"), true);
    assert.equal(credentialsMatch("wrong-user", "test-password"), false);
    assert.equal(credentialsMatch("dispatch-admin", "wrong-password"), false);
    assert.equal(credentialsMatch(undefined, "test-password"), false);
    assert.equal(credentialsMatch("dispatch-admin", undefined), false);
    delete process.env.ADMIN_USERNAME;
    assert.equal(adminConfigured(), false);
    assert.equal(credentialsMatch("dispatch-admin", "test-password"), false);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
