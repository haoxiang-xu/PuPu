import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const packageWorkflow = read(".github/workflows/_shared-release-package.yml");
const signingQualification = read(".github/workflows/windows-signing-qualification.yml");
const restartWorkflow = read(".github/workflows/_shared-release-windows-restart-update.yml");
const diagnosticWorkflow = read(".github/workflows/_shared-windows-upgrade-diagnostic.yml");
const signingAction = read(".github/actions/windows-artifact-signing/action.yml");
const installedQualification = read("scripts/release-qa/installed-package-qualification.mjs");
const restartQualification = read("scripts/release-qa/run-restart-update-qualification.mjs");

test("production release prepares updater config before signing", () => {
  const steps = YAML.parse(packageWorkflow).jobs.package.steps;
  const isolate = steps.findIndex((step) => step.id === "windows_payload");
  const prepare = steps.findIndex((step) => step.name === "Prepare production Windows updater binding");
  const sign = steps.findIndex((step) => step.id === "windows_artifact_signing");
  assert.ok(isolate >= 0 && isolate < prepare && prepare < sign);
  assert.match(steps[prepare].run, /production-app-update\.mjs prepare/);
  assert.match(steps[prepare].run, /resources\\app-update\.yml/);
  assert.equal(steps[sign].with["app-update-contract"], "production");
});

test("signing qualification exercises the production updater contract", () => {
  const steps = YAML.parse(signingQualification).jobs["windows-signing-qualification"].steps;
  const copy = steps.findIndex((step) => step.name === "Copy the exact payload into an isolated signing directory");
  const prepare = steps.findIndex((step) => step.name === "Prepare production updater binding in the isolated payload");
  const sign = steps.findIndex((step) => step.id === "windows_artifact_signing");
  assert.ok(copy >= 0 && copy < prepare && prepare < sign);
  assert.match(steps[prepare].run, /production-app-update\.mjs prepare/);
  assert.equal(steps[sign].with["app-update-contract"], "production");
});

test("shared signing action closes production and fixture updater profiles", () => {
  const action = YAML.parse(signingAction);
  assert.equal(action.inputs["app-update-contract"].required, true);
  assert.match(signingAction, /production-app-update\.mjs validate/);
  assert.match(signingAction, /qualification-fixture/);
  assert.ok(
    (signingAction.match(/production-app-update\.mjs validate/g) || []).length >= 2,
    "production payload must be revalidated before both prepackaged installer builds",
  );

  const restartSteps = YAML.parse(restartWorkflow).jobs["windows-restart-update"].steps;
  const fixtureSign = restartSteps.find((step) => step.id === "fixture_signing");
  assert.equal(fixtureSign.with["app-update-contract"], "qualification-fixture");

  const diagnosticSteps = YAML.parse(diagnosticWorkflow).jobs["windows-upgrade-diagnostic"].steps;
  const diagnosticFixtureSign = diagnosticSteps.find((step) => step.id === "fixture_signing");
  assert.equal(diagnosticFixtureSign.with["app-update-contract"], "qualification-fixture");
});

test("exact installed candidate and post-update N validate production updater config", () => {
  assert.match(installedQualification, /validateProductionAppUpdateFile/);
  assert.match(installedQualification, /path\.dirname\(installed\.identity\.asarPath\)/);
  assert.match(restartQualification, /validateProductionAppUpdateFile/);
  assert.match(restartQualification, /targetId === "windows-x64"/);
  assert.match(restartQualification, /path\.dirname\(installed\.identity\.asarPath\)/);
});

test("release signing cannot select the fixture profile to bypass production validation", () => {
  const firstStep = YAML.parse(signingAction).runs.steps[0].run;
  const releaseBranch = firstStep.slice(
    firstStep.indexOf('if ($env:EVIDENCE_SCHEMA -eq "pupu.windows-release-candidate-signing.v1")'),
    firstStep.indexOf('} elseif ($env:PACKAGE_VERSION'),
  );
  assert.match(releaseBranch, /if \(\$env:APP_UPDATE_CONTRACT -ne "production"\)/);
  assert.match(releaseBranch, /throw "release-candidate signing requires the production updater config contract"/);
});

test("both Windows packaging entrypoints run updater contract tests before building", () => {
  for (const workflow of [packageWorkflow, signingQualification]) {
    const jobs = YAML.parse(workflow).jobs;
    const steps = (jobs.package || jobs["windows-signing-qualification"]).steps;
    const contract = steps.findIndex((step) => step.name === "Verify Windows production updater contract");
    const build = steps.findIndex((step) => ["Build package", "Build an unsigned unpacked Windows payload"].includes(step.name));
    assert.ok(contract >= 0 && contract < build);
    assert.match(steps[contract].run, /production-app-update-integration\.test\.mjs/);
    assert.match(steps[contract].run, /production-app-update-admission\.test\.mjs/);
    if (jobs.package) assert.equal(steps[contract].if, "inputs.target_id == 'windows-x64'");
  }
});
