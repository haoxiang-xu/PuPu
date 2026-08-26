import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertProtectedReleaseEnvironment } from "./verify-github-environment.mjs";

const environmentVerifierScript = fileURLToPath(new URL("./verify-github-environment.mjs", import.meta.url));

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

test("environment verifier executes its fail-closed CLI entrypoint with a portable URL guard", () => {
  const result = spawnSync(process.execPath, [environmentVerifierScript, "--environment", "release-signing"], {
    encoding: "utf8",
    input: JSON.stringify({ name: "release-signing", protection_rules: [] }),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must require reviewers/);
  assert.match(fs.readFileSync(environmentVerifierScript, "utf8"), /pathToFileURL\(process\.argv\[1\]\)\.href/);
});
