import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

const workflowRoot = path.resolve(import.meta.dirname, "../../.github/workflows");
const readWorkflow = (name) => {
  const document = YAML.parseDocument(fs.readFileSync(path.join(workflowRoot, name), "utf8"), { uniqueKeys: true });
  assert.deepEqual(document.errors.map((error) => error.message), [], `${name} must parse without duplicate keys`);
  return document.toJSON();
};
const packageWorkflow = readWorkflow("_shared-release-package.yml");
const fixtureWorkflow = readWorkflow("_shared-release-macos-restart-update.yml");
const qualificationWorkflow = readWorkflow("macos-signing-qualification.yml");
const packageJob = Object.values(packageWorkflow.jobs).find((job) => job.steps?.some((step) => step.id === "package"));
const fixtureJob = fixtureWorkflow.jobs["macos-restart-update"];
const qualificationJob = qualificationWorkflow.jobs["macos-signing-qualification"];
const shell = (step) => String(step?.run || "").replace(/\\\r?\n\s*/g, " ");
const stepWith = (job, fragment) => {
  const matches = job.steps.filter((step) => String(step.run || "").includes(fragment));
  assert.equal(matches.length, 1, `expected one command step containing ${fragment}`);
  return matches[0];
};
const intelBuildCase = (step) => {
  const body = shell(step).match(/macos-x64\)([\s\S]*?);;/)?.[1];
  assert.ok(body, "signed Intel build case must exist");
  return body;
};

test("Candidate Intel build keeps bounded build retry inside the scoped TCP lifecycle", () => {
  const build = packageJob.steps.find((step) => step.id === "package");
  assert.match(intelBuildCase(build), /node scripts\/release-qa\/macos-intel-tcp\.mjs\s+--\s+node scripts\/release-qa\/macos-release-build-retry\.mjs\s+--max-attempts 2 --delay-ms 30000\s+--\s+npm run build:electron:mac:intel:release\b/);
  assert.match(build.run, /if \[ "\$QA_MODE" = "release-candidate" \]/);
  assert.match(intelBuildCase(build), /--config\.mac\.bundleShortVersion="\$QA_BASE_VERSION"/);
  assert.match(intelBuildCase(build), /--config\.mac\.bundleVersion="\$QA_BASE_VERSION"/);
});

test("Candidate native verification independently covers its later CloudKit validation", () => {
  const verification = packageJob.steps.find((step) => step.id === "release_signing");
  assert.match(shell(verification), /node scripts\/release-qa\/macos-intel-tcp\.mjs\s+--\s+node scripts\/release-qa\/external-network-retry\.mjs\s+--profile apple-ticket --max-attempts 3 --delay-ms 15000\s+--\s+xcrun stapler validate "\$APP_PATH"/);
  assert.match(verification.run, /codesign --verify --deep --strict/);
  assert.match(verification.run, /spctl --assess --type execute/);
  assert.match(verification.if, /release-candidate/);
});

test("historical Intel fixture build takes its TCP helper from frozen qualification tools", () => {
  const build = stepWith(fixtureJob, "build:electron:mac:intel:release");
  assert.equal(build["working-directory"], "fixture-source");
  assert.match(intelBuildCase(build), /node \.\.\/pupu\/scripts\/release-qa\/macos-intel-tcp\.mjs\s+--\s+npm run build:electron:mac:intel:release\b/);
  assert.match(build.run, /node \.\.\/pupu\/scripts\/release-qa\/release-signing\.mjs --platform macos/);
  assert.match(intelBuildCase(build), /--config "\$GITHUB_WORKSPACE\/fixture-build-config\.json"/);
});

test("historical fixture signing evidence wraps all native CloudKit checks", () => {
  const evidence = stepWith(fixtureJob, "macos-signing-evidence.mjs");
  assert.equal(evidence["working-directory"], "pupu");
  assert.match(shell(evidence), /node scripts\/release-qa\/macos-intel-tcp\.mjs\s+--\s+node scripts\/release-qa\/macos-signing-evidence\.mjs\s+--schema pupu\.macos-restart-fixture-signing\.v1/);
  assert.match(evidence.run, /--expected-commit "\$FROM_COMMIT"/);
  assert.match(evidence.run, /--dist-dir \.\.\/fixture-source\/dist/);
  assert.match(evidence.run, /seal-macos-restart-fixture\.mjs/);
});

test("standalone macOS qualification also covers its Intel signed build", () => {
  const build = stepWith(qualificationJob, "build:electron:mac:intel:release");
  assert.match(intelBuildCase(build), /node scripts\/release-qa\/macos-intel-tcp\.mjs\s+--\s+npm run build:electron:mac:intel:release\b/);
  assert.equal(build.env.APPLE_TEAM_ID, "${{ secrets.APPLE_TEAM_ID }}");
  assert.equal(build.env.APPLE_APP_SPECIFIC_PASSWORD, "${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}");
});

test("standalone macOS qualification covers native evidence verification separately", () => {
  const evidence = stepWith(qualificationJob, "macos-signing-evidence.mjs");
  assert.match(shell(evidence), /node scripts\/release-qa\/macos-intel-tcp\.mjs\s+--\s+node scripts\/release-qa\/macos-signing-evidence\.mjs/);
  assert.match(evidence.run, /--schema pupu\.macos-signing-qualification\.v1/);
  assert.match(evidence.run, /--expected-commit "\$EXPECTED_COMMIT"/);
});

test("TCP integration does not replace protected signing or immutable release boundaries", () => {
  assert.equal(fixtureJob.environment, "release-signing");
  assert.equal(qualificationJob.environment, "macos-signing-qualification");
  assert.ok(packageJob.environment, "Candidate retains its protected environment binding");
  const qualificationCommands = qualificationJob.steps.map(shell).join("\n");
  assert.match(qualificationCommands, /QUALIFICATION_REF.*refs\/heads\/dev/);
  assert.match(qualificationCommands, /EXPECTED_COMMIT.*QUALIFICATION_SHA/);
  assert.match(qualificationCommands, /release-signing\.mjs --platform macos/);
  assert.match(fixtureJob.steps.map(shell).join("\n"), /N-1 tag moved after preflight/);
});

test("workflows delegate PF lifecycle to the bounded helper rather than modifying global firewall state", () => {
  for (const workflow of [packageWorkflow, fixtureWorkflow, qualificationWorkflow]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps || []) {
        assert.doesNotMatch(shell(step), /\b(?:pfctl|tcpdump)\b/, step.name);
      }
    }
  }
});
