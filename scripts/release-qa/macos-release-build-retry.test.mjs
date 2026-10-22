import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isTransientMacNotarizationFailure,
  runMacReleaseBuildWithRetry,
} from "./macos-release-build-retry.mjs";

// Sanitized failure shape from Candidate 39717773778, mac-intel job 119626754989.
// These optional-library diagnostics did not stop PyInstaller or code signing.
const OBSERVED_OPTIONAL_DEPENDENCY_WARNINGS = [
  "ERROR: Hidden import 'unchain.runtime.engine' not found",
  "WARNING: Hidden import 'pycparser.lextab' not found!",
  "WARNING: Library user32 not found",
];
const OBSERVED_NOTARY_TIMEOUT = [
  "Failed to notarize via notarytool. Failed with unexpected result:",
  'Error: HTTPError(statusCode: nil, error: Error Domain=NSURLErrorDomain Code=-1001 "The request timed out."',
  "NSErrorFailingURLStringKey=https://appstoreconnect.apple.com/notary/v2/submissions/sanitized-submission-id?",
].join("\n");
const OBSERVED_NOISY_BUILD_TIMEOUT = [
  ...OBSERVED_OPTIONAL_DEPENDENCY_WARNINGS,
  "Packaged MCP runtime staged and verified: darwin-x64",
  "signing file=dist/mac/PuPu.app identityName=Developer ID Application: Example Developer keychain=temporary-signing.keychain-db",
  OBSERVED_NOTARY_TIMEOUT,
].join("\n");

test("retries the observed mac-intel notary timeout despite earlier optional-library diagnostics", () => {
  for (const warning of OBSERVED_OPTIONAL_DEPENDENCY_WARNINGS) {
    assert.equal(
      isTransientMacNotarizationFailure(`${warning}\n${OBSERVED_NOTARY_TIMEOUT}`),
      true,
      warning,
    );
  }
  assert.equal(isTransientMacNotarizationFailure(OBSERVED_NOISY_BUILD_TIMEOUT), true);
});

test("does not mistake a successful signing keychain field for a keychain failure", () => {
  const output = [
    "signing file=dist/mac/PuPu.app keychain=temporary-signing.keychain-db",
    OBSERVED_NOTARY_TIMEOUT,
  ].join("\n");

  assert.equal(isTransientMacNotarizationFailure(output), true);
});

test("actual signing, authentication and rejected-notary errors still block retry in mixed logs", () => {
  for (const permanentFailure of [
    "Error: HTTP status code: 401. Invalid credentials for notarization.",
    "codesign: invalid signature (code or signature have been modified)",
    "security: keychain permission denied",
    "Error: The specified item could not be found in the keychain.",
    "notarytool submission status: Invalid; issues: the binary is rejected",
  ]) {
    assert.equal(
      isTransientMacNotarizationFailure(`${OBSERVED_NOISY_BUILD_TIMEOUT}\n${permanentFailure}`),
      false,
      permanentFailure,
    );
  }
});

test("mixed mac-intel build warnings and timeout trigger cleanup and a second successful attempt", async () => {
  const events = [];
  const result = await runMacReleaseBuildWithRetry({
    command: process.execPath,
    maxAttempts: 2,
    delayMs: 0,
    runner: async ({ attempt }) => {
      events.push(`run:${attempt}`);
      return attempt === 1
        ? { status: 17, output: OBSERVED_NOISY_BUILD_TIMEOUT }
        : { status: 0, output: "package complete" };
    },
    cleanGeneratedDist: async () => events.push("clean"),
    wait: async (delayMs) => events.push(`wait:${delayMs}`),
  });

  assert.equal(result.status, 0);
  assert.equal(result.attempts, 2);
  assert.deepEqual(events, ["run:1", "clean", "wait:0", "run:2"]);
});

test("mixed mac-intel timeouts exhaust the bounded retry without hiding failure", async () => {
  const events = [];
  const result = await runMacReleaseBuildWithRetry({
    command: process.execPath,
    maxAttempts: 2,
    delayMs: 0,
    runner: async ({ attempt }) => {
      events.push(`run:${attempt}`);
      return { status: 17, output: OBSERVED_NOISY_BUILD_TIMEOUT };
    },
    cleanGeneratedDist: async () => events.push("clean"),
    wait: async () => events.push("wait"),
  });

  assert.equal(result.status, 17);
  assert.equal(result.attempts, 2);
  assert.equal(result.output, OBSERVED_NOISY_BUILD_TIMEOUT);
  assert.deepEqual(events, ["run:1", "clean", "wait", "run:2"]);
});

for (const recoverOnSecondAttempt of [true, false]) {
  test(`real mac retry CLI ${recoverOnSecondAttempt ? "recovers" : "fails closed after two attempts"} with noisy build output`, (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-mac-retry-"));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(temporaryDirectory, "unrelated-marker"), "keep me");
    const childPath = path.join(temporaryDirectory, "fake-build.mjs");
    fs.writeFileSync(childPath, [
      'import fs from "node:fs";',
      'const attempt = fs.existsSync("attempts") ? Number(fs.readFileSync("attempts", "utf8")) + 1 : 1;',
      'fs.writeFileSync("attempts", String(attempt));',
      'if (attempt > 1 && fs.existsSync("dist/partial-artifact")) {',
      '  console.error("stale generated dist was not cleaned"); process.exit(91);',
      '}',
      'fs.mkdirSync("dist", { recursive: true });',
      `if (attempt === 1 || !${JSON.stringify(recoverOnSecondAttempt)}) {`,
      '  fs.writeFileSync("dist/partial-artifact", "incomplete");',
      `  process.stdout.write(${JSON.stringify(`${OBSERVED_NOISY_BUILD_TIMEOUT}\n`)});`,
      '  process.exitCode = 17;',
      '} else {',
      '  fs.writeFileSync("dist/package-complete", "verified package fixture");',
      '  console.log("package complete on attempt 2");',
      '}',
    ].join("\n"));
    const retryCliPath = fileURLToPath(new URL("./macos-release-build-retry.mjs", import.meta.url));

    const result = spawnSync(process.execPath, [
      retryCliPath, "--max-attempts", "2", "--delay-ms", "0", "--", process.execPath, childPath,
    ], { cwd: temporaryDirectory, encoding: "utf8", timeout: 20_000 });

    assert.ifError(result.error);
    assert.equal(result.status, recoverOnSecondAttempt ? 0 : 17, result.stderr);
    assert.equal(fs.readFileSync(path.join(temporaryDirectory, "attempts"), "utf8"), "2");
    assert.equal(fs.readFileSync(path.join(temporaryDirectory, "unrelated-marker"), "utf8"), "keep me");
    assert.match(result.stderr, /Transient Apple notarization failure/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /stale generated dist was not cleaned/);
    assert.equal(
      fs.existsSync(path.join(temporaryDirectory, "dist", "package-complete")),
      recoverOnSecondAttempt,
    );
    assert.equal(
      fs.existsSync(path.join(temporaryDirectory, "dist", "partial-artifact")),
      !recoverOnSecondAttempt,
    );
  });
}

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
