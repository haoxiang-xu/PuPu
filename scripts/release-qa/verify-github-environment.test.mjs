import assert from "node:assert/strict";
import test from "node:test";

import { assertProtectedReleaseEnvironment } from "./verify-github-environment.mjs";

test("release environments fail closed without reviewer protection", () => {
  assert.throws(
    () => assertProtectedReleaseEnvironment({ name: "release-signing", protection_rules: [] }, "release-signing"),
    /require reviewers/,
  );
  assert.throws(
    () => assertProtectedReleaseEnvironment({ name: "wrong", protection_rules: [{ type: "required_reviewers" }] }, "release-signing"),
    /expected GitHub Environment/,
  );
  assert.equal(
    assertProtectedReleaseEnvironment({
      name: "release-signing",
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "owner" } }] }],
    }, "release-signing").name,
    "release-signing",
  );
});
