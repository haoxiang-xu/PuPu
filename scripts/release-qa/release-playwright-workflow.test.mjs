import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("Playwright release QA consumes Deterministic QA's exact sidecar artifact", () => {
  const caller = YAML.parse(read(".github/workflows/release-qa.yml"));
  const shared = YAML.parse(read(".github/workflows/_shared-release-playwright.yml"));
  const steps = shared.jobs.playwright.steps;
  const downloadStep = steps.find((step) => step.name === "Download the deterministic Unchain artifact");
  const artifactStep = steps.find((step) => step.id === "artifact_verify");
  const sessionGuardSmokeStep = steps.find((step) => step.id === "session_guard_smoke");
  const playwrightStep = steps.find((step) => step.id === "playwright");
  const reportStep = steps.find((step) => step.name === "Write Playwright QA report");
  const reportUploadIndex = steps.findIndex(
    (step) => step.name === "Upload Playwright QA report",
  );
  const evidenceUploadIndex = steps.findIndex(
    (step) => step.name === "Upload Playwright evidence",
  );
  const evidenceUploadStep = steps[evidenceUploadIndex];
  const enforcementIndex = steps.findIndex(
    (step) => step.name === "Enforce Playwright QA result",
  );
  const enforcementStep = steps[enforcementIndex];

  assert.equal(caller.jobs["playwright-electron"].needs, "deterministic-checks");
  assert.equal(caller.jobs["playwright-electron"].permissions.actions, "read");
  assert.equal(shared.jobs.playwright.permissions.actions, "read");
  assert.equal(downloadStep.with.name, "unchain-release-artifact");
  assert.equal(downloadStep.with.path, ".release-qa/unchain-artifact");
  assert.match(artifactStep.run, /--installed true/);
  assert.match(artifactStep.run, /unchain_runtime\/server\/requirements\.txt/);
  assert.match(artifactStep.run, /evidence_path=%s/);
  assert.match(artifactStep.run, /executed_tests=1/);
  assert.equal(
    sessionGuardSmokeStep.env.UNCHAIN_PYTHON_BIN,
    "${{ steps.artifact_verify.outputs.python_command }}",
  );
  assert.equal(
    sessionGuardSmokeStep.env.UNCHAIN_DATA_DIR,
    "${{ runner.temp }}/pupu-session-guard-smoke",
  );
  assert.equal(
    sessionGuardSmokeStep.env.SESSION_GUARD_SMOKE_EVIDENCE_PATH,
    "test-results/session-guard-smoke.json",
  );
  assert.match(sessionGuardSmokeStep.run, /windows-session-guard-smoke\.py/);
  assert.equal(
    playwrightStep.env.UNCHAIN_PYTHON_BIN,
    "${{ steps.artifact_verify.outputs.python_command }}",
  );
  assert.equal(
    playwrightStep.env.PUPU_SESSION_GUARD_DIAGNOSTICS,
    "${{ runner.os == 'Windows' && '1' || '0' }}",
  );
  assert.equal(
    reportStep.env.QA_UNCHAIN_ARTIFACT_EVIDENCE_PATH,
    "${{ steps.artifact_verify.outputs.evidence_path }}",
  );
  assert.deepEqual(
    JSON.parse(reportStep.env.QA_ARTIFACT_GLOBS_JSON),
    [
      "playwright-report/**/*",
      "test-results/playwright/**/*",
      "test-results/session-guard-smoke.json",
    ],
  );
  assert.match(
    evidenceUploadStep.with.path,
    /test-results\/session-guard-smoke\.json/,
  );
  assert.ok(enforcementIndex > reportUploadIndex);
  assert.ok(enforcementIndex > evidenceUploadIndex);
  assert.equal(enforcementStep.if, "always()");
  assert.equal(enforcementStep.shell, "bash");
  assert.deepEqual(enforcementStep.env, {
    ARTIFACT_VERIFY_OUTCOME: "${{ steps.artifact_verify.outcome }}",
    SESSION_GUARD_SMOKE_OUTCOME:
      "${{ steps.session_guard_smoke.outcome }}",
    PLAYWRIGHT_OUTCOME: "${{ steps.playwright.outcome }}",
    PLAYWRIGHT_EVIDENCE_OUTCOME:
      "${{ steps.playwright_evidence.outcome }}",
  });
  assert.match(enforcementStep.run, /exit 1/);
  assert.match(
    enforcementStep.run,
    /-f test-results\/session-guard-smoke\.json/,
  );
});

test("Playwright QA report checks are valid JSON after Actions expressions resolve", () => {
  const shared = YAML.parse(read(".github/workflows/_shared-release-playwright.yml"));
  const reportStep = shared.jobs.playwright.steps.find((step) => step.name === "Write Playwright QA report");
  const resolved = reportStep.env.QA_CHECKS_JSON
    .replace(/\$\{\{ steps\.artifact_verify\.outcome \}\}/g, "success")
    .replace(/\$\{\{ steps\.artifact_verify\.outputs\.executed_tests \|\| 0 \}\}/g, "2")
    .replace(/\$\{\{ steps\.session_guard_smoke\.outcome \}\}/g, "success")
    .replace(/\$\{\{ steps\.session_guard_smoke\.outcome == 'success' && 1 \|\| 0 \}\}/g, "1")
    .replace(/\$\{\{ steps\.playwright\.outcome \}\}/g, "success")
    .replace(/\$\{\{ steps\.playwright_evidence\.outputs\.executed_tests \|\| 0 \}\}/g, "2");
  const checks = JSON.parse(resolved);

  assert.deepEqual(
    checks.map((check) => check.name),
    [
      "Unchain artifact continuity",
      "Session guard startup smoke",
      "Playwright Electron release smoke",
    ],
  );
  assert.deepEqual(
    JSON.parse(reportStep.env.QA_REQUIRED_CHECKS_JSON),
    [
      "Unchain artifact continuity",
      "Session guard startup smoke",
      "Playwright Electron release smoke",
    ],
  );
});

test("manual Windows Playwright scope reuses deterministic QA and skips packaging", () => {
  const caller = YAML.parse(read(".github/workflows/release-qa.yml"));
  const sharedPackage = YAML.parse(
    read(".github/workflows/_shared-release-package.yml"),
  );
  const scope = caller.on.workflow_dispatch.inputs.qa_scope;

  assert.equal(scope.type, "choice");
  assert.equal(scope.default, "standard");
  assert.deepEqual(scope.options, ["standard", "windows-playwright"]);

  const deterministic = caller.jobs["deterministic-checks"];
  const playwright = caller.jobs["playwright-electron"];
  assert.equal(playwright.needs, "deterministic-checks");
  assert.match(
    deterministic.with.qa_mode,
    /inputs\.qa_scope == 'windows-playwright' && 'release'/,
  );
  assert.match(
    playwright.with.qa_mode,
    /inputs\.qa_scope == 'windows-playwright' && 'release'/,
  );
  assert.match(
    playwright.strategy.matrix.os,
    /inputs\.qa_scope == 'windows-playwright'.*\["windows-latest"\]/,
  );

  for (const jobName of [
    "release-candidate-environment-preflight",
    "package-non-windows",
    "package-windows",
    "package-matrix",
  ]) {
    assert.match(
      caller.jobs[jobName].if,
      /inputs\.qa_scope != 'windows-playwright'/,
    );
  }
  assert.match(
    caller.jobs["final-report"].if,
    /inputs\.qa_scope != 'windows-playwright'/,
  );
  assert.equal(caller.permissions.contents, "read");
  assert.equal(caller.permissions.actions, "read");
  assert.equal(sharedPackage.jobs.package["timeout-minutes"], 60);
});
