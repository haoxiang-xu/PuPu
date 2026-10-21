import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  isTransientMacNotarizationFailure,
  runMacReleaseBuildWithRetry,
} from "./macos-release-build-retry.mjs";

test("classifies the observed Apple CloudKit stapling disconnect as retryable", () => {
  const output = [
    "Failed to staple your application with code: 68",
    "NSURLErrorDomain Code=-1005 The network connection was lost.",
    "https://api.apple-cloudkit.com/database/1/com.apple.gk.ticket-delivery/production/public/records/lookup",
  ].join("\n");

  assert.equal(isTransientMacNotarizationFailure(output), true);
});

test("does not retry permanent signing or notarization failures", () => {
  for (const output of [
    "Error: The specified item could not be found in the keychain.",
    "Error: HTTP status code: 401. Invalid credentials.",
    "status: Invalid; issues: The binary is not signed with a valid Developer ID certificate.",
    "Failed to staple your application with code: 65",
  ]) {
    assert.equal(isTransientMacNotarizationFailure(output), false, output);
  }
});

test("retries one transient failure after cleaning generated dist and then succeeds", async () => {
  const results = [
    {
      status: 1,
      output: "stapler: NSURLErrorDomain Code=-1005 The network connection was lost at api.apple-cloudkit.com",
    },
    { status: 0, output: "package complete" },
  ];
  const events = [];

  const result = await runMacReleaseBuildWithRetry({
    command: "npm",
    args: ["run", "build:electron:mac:intel:release"],
    maxAttempts: 2,
    delayMs: 30_000,
    runner: async () => {
      events.push("run");
      return results.shift();
    },
    cleanGeneratedDist: async () => events.push("clean"),
    wait: async (delayMs) => events.push(`wait:${delayMs}`),
  });

  assert.equal(result.status, 0);
  assert.equal(result.attempts, 2);
  assert.deepEqual(events, ["run", "clean", "wait:30000", "run"]);
});

test("fails closed without retrying a permanent failure", async () => {
  let attempts = 0;
  const result = await runMacReleaseBuildWithRetry({
    command: "npm",
    args: ["run", "build:electron:mac:release"],
    runner: async () => {
      attempts += 1;
      return { status: 1, output: "Invalid credentials for notarization" };
    },
    cleanGeneratedDist: async () => assert.fail("permanent failures must not clean or retry"),
    wait: async () => assert.fail("permanent failures must not wait or retry"),
  });

  assert.equal(result.status, 1);
  assert.equal(result.attempts, 1);
  assert.equal(attempts, 1);
});

test("shared package workflow wires the bounded retry only into signed macOS candidate builds", () => {
  const workflow = fs.readFileSync(".github/workflows/_shared-release-package.yml", "utf8");

  assert.match(
    workflow,
    /macos-arm64\)[\s\S]*?macos-release-build-retry\.mjs[\s\S]*?build:electron:mac:release/,
  );
  assert.match(
    workflow,
    /macos-x64\)[\s\S]*?macos-release-build-retry\.mjs[\s\S]*?build:electron:mac:intel:release/,
  );
  assert.match(workflow, /--max-attempts 2 --delay-ms 30000 --[\s\\]*npm run/);
  assert.doesNotMatch(
    workflow,
    /windows-x64\).*macos-release-build-retry|linux-x64\).*macos-release-build-retry/,
  );
});
