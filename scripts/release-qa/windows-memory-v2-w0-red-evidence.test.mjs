import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readRepoFile = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

// The first three tests intentionally describe unfixed W0 baseline gaps. The
// snapshot, smoke, protocol-parity, and stop-policy tests are green regression guards whose
// preceding red states are preserved in the W0 direct-plan record and #195 comments.
test("W0-03 GREEN: release build requires an explicit feature snapshot", () => {
  const source = readRepoFile("scripts/build-web.cjs");

  assert.match(
    source,
    /process\.env\.PUPU_VERSION_PREPARED === "1"/,
  );
  assert.match(source, /snapshot is required but missing/);
  assert.match(source, /PUPU_BUILD_FEATURE_SNAPSHOT_PATH/);
});

test("W0-03 GREEN: packaged sidecar smoke reuses the immutable build snapshot", () => {
  const source = readRepoFile("scripts/release-qa/package-sidecar-smoke.mjs");

  assert.doesNotMatch(source, /PUPU_FEATURE_MEMORY_V2:\s*"all"/);
  assert.doesNotMatch(source, /PUPU_MEMORY_V2_MODE:\s*"all"/);
  assert.match(source, /build feature snapshot is required/);
  assert.match(source, /snapshot_fingerprint/);
  assert.match(source, /validateSnapshotRolloutProjection/);
});

test("W0 RED: Vault decrypts before a Windows containment admission can reject", () => {
  const source = readRepoFile("electron/main/services/memory_vault/service.js");
  const decrypt = source.indexOf("plaintext: decryptCiphertextForSink(handleRow.ciphertext)");
  const execute = source.indexOf("const executorResult = await executor({", decrypt);

  assert.ok(decrypt >= 0, "red baseline must locate Vault decryption");
  assert.ok(execute >= 0, "red baseline must locate the executor invocation");
  assert.ok(
    decrypt < execute,
    "the current baseline decrypts before the executor can enforce containment",
  );
});

test("W0 RED: release Playwright launches source Electron, not an installed candidate", () => {
  const source = readRepoFile("e2e/fixtures/pupu_app.js");

  assert.match(source, /spawn\(\s*require\("electron"\)/s);
  assert.match(source, /cwd:\s*REPO_ROOT/);
  assert.match(source, /PUPU_E2E:\s*"1"/);
});

test("W0-06 GREEN: final release enforcement uses a frozen mode-aware report topology", () => {
  const workflow = readRepoFile(".github/workflows/release-qa.yml");
  const sharedReport = readRepoFile(".github/workflows/_shared-release-report.yml");
  const enforcement = sharedReport.slice(sharedReport.indexOf("- name: Enforce final required report topology"));

  assert.match(workflow, /deterministic_result:\s*\$\{\{ needs\.deterministic-checks\.result \}\}/);
  assert.match(workflow, /playwright_result:\s*\$\{\{ needs\.playwright-electron\.result \}\}/);
  assert.match(workflow, /package_result:\s*\$\{\{ needs\.package-matrix\.result \}\}/);
  assert.match(sharedReport, /DETERMINISTIC_JOB_RESULT: \$\{\{ inputs\.deterministic_result \}\}/);
  assert.match(sharedReport, /PLAYWRIGHT_JOB_RESULT: \$\{\{ inputs\.playwright_result \}\}/);
  assert.match(sharedReport, /PACKAGE_JOB_RESULT: \$\{\{ inputs\.package_result \}\}/);
  assert.match(enforcement, /\$DETERMINISTIC_JOB_RESULT/);
  assert.match(enforcement, /\$PLAYWRIGHT_JOB_RESULT/);
  assert.match(enforcement, /\$PACKAGE_JOB_RESULT/);
  assert.match(sharedReport, /release-qa-report-topology\.v1\.json/);
  assert.doesNotMatch(workflow, /windows-active-qualification/);
});

test("W0-08 GREEN: unavailable rollback authority blocks promotion and requires a Shadow descendant", () => {
  const policy = JSON.parse(readRepoFile(
    "contracts/memory-v2/windows-rollout-stop-policy.v1.json",
  ));

  assert.equal(policy.schema, "pupu.windows-rollout-stop-policy.v1");
  for (const channel of ["internal", "public"]) {
    assert.equal(policy.channels[channel].authority, "unavailable");
    assert.equal(policy.channels[channel].promotion_allowed, false);
    assert.equal(policy.channels[channel].rollback_mode, "shadow");
  }
});

test("W0-04 GREEN: Electron, sidecar, and release artifact require the same context-memory feature", () => {
  const electron = readRepoFile("electron/main/services/unchain/memory_v2_rollout.js");
  const sidecar = readRepoFile(
    "unchain_runtime/server/context_memory_v2_capability.py",
  );
  const releaseArtifact = readRepoFile("scripts/release-qa/unchain-artifact.mjs");
  const requirementStart = electron.indexOf(
    "const UNCHAIN_RUNTIME_PROTOCOL_REQUIRED_PROTOCOLS",
  );
  const contextRequirementStart = electron.indexOf(
    "  Object.freeze({",
    requirementStart,
  );
  const nextRequirement = electron.indexOf(
    "  Object.freeze({",
    contextRequirementStart + 1,
  );
  const electronContextRequirement = electron.slice(
    contextRequirementStart,
    nextRequirement,
  );

  assert.ok(requirementStart >= 0, "must locate Electron requirements");
  assert.ok(
    contextRequirementStart >= 0,
    "must locate context-memory requirements",
  );
  assert.ok(nextRequirement >= 0, "must isolate context-memory requirements");
  assert.match(electronContextRequirement, /tool_output_management_v1/);
  assert.match(sidecar, /"tool_output_management_v1"/);
  assert.match(releaseArtifact, /"tool_output_management_v1"/);
});
