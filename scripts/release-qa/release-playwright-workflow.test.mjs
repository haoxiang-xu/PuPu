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
  const smokeStep = steps.find((step) => step.id === "playwright");
  const reportStep = steps.find((step) => step.name === "Write Playwright QA report");

  assert.equal(caller.jobs["playwright-electron"].needs, "deterministic-checks");
  assert.equal(caller.jobs["playwright-electron"].permissions.actions, "read");
  assert.equal(shared.jobs.playwright.permissions.actions, "read");
  assert.equal(downloadStep.with.name, "unchain-release-artifact");
  assert.equal(downloadStep.with.path, ".release-qa/unchain-artifact");
  assert.match(artifactStep.run, /--installed true/);
  assert.match(artifactStep.run, /unchain_runtime\/server\/requirements\.txt/);
  assert.equal(smokeStep.env.UNCHAIN_PYTHON_BIN, "${{ steps.artifact_verify.outputs.python_command }}");
  assert.equal(
    reportStep.env.QA_UNCHAIN_ARTIFACT_EVIDENCE_PATH,
    "${{ steps.artifact_verify.outputs.evidence_path }}",
  );
});

test("Playwright QA report checks are valid JSON after Actions expressions resolve", () => {
  const shared = YAML.parse(read(".github/workflows/_shared-release-playwright.yml"));
  const reportStep = shared.jobs.playwright.steps.find((step) => step.name === "Write Playwright QA report");
  const resolved = reportStep.env.QA_CHECKS_JSON
    .replace(/\$\{\{ steps\.artifact_verify\.outcome \}\}/g, "success")
    .replace(/\$\{\{ steps\.artifact_verify\.outputs\.executed_tests \|\| 0 \}\}/g, "2")
    .replace(/\$\{\{ steps\.playwright\.outcome \}\}/g, "success")
    .replace(/\$\{\{ steps\.playwright_evidence\.outputs\.executed_tests \|\| 0 \}\}/g, "2");
  const checks = JSON.parse(resolved);

  assert.deepEqual(
    checks.map((check) => check.name),
    ["Unchain artifact continuity", "Playwright Electron release smoke"],
  );
  assert.deepEqual(
    JSON.parse(reportStep.env.QA_REQUIRED_CHECKS_JSON),
    ["Unchain artifact continuity", "Playwright Electron release smoke"],
  );
});
