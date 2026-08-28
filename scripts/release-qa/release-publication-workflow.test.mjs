import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const assertValidYaml = (source, label) => {
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  assert.deepEqual(document.errors.map((error) => error.message), [], `${label} must be valid YAML with unique keys`);
};

test("electron-builder uses canonical architecture-bearing names and every package command blocks implicit publish", () => {
  const packageJson = JSON.parse(read("package.json"));
  const scripts = packageJson.scripts;
  const packagedBuilds = [
    ["build:electron", "npm run build:unchain"],
    ["build:electron:mac", "npm run build:unchain:mac"],
    ["build:electron:mac:unsigned", "npm run build:unchain:mac"],
    ["build:electron:mac:release", "npm run build:unchain:mac"],
    ["build:electron:mac:intel", "npm run build:unchain:mac:intel"],
    ["build:electron:mac:intel:unsigned", "npm run build:unchain:mac:intel"],
    ["build:electron:mac:intel:release", "npm run build:unchain:mac:intel"],
    ["build:electron:linux", "npm run build:unchain:linux"],
  ];
  for (const [scriptName, unchainCommand] of packagedBuilds) {
    const command = scripts[scriptName];
    assert.match(command, /--publish never/, `${scriptName} must never implicitly publish`);
    assert.doesNotMatch(
      command,
      /cross-env-shell/,
      `${scriptName} must not use the command-dropping cross-env-shell wrapper`,
    );
    assert.match(
      command,
      /cross-env PUPU_VERSION_PREPARED=1 npm run build:web/,
      `${scriptName} must make the controlled feature snapshot mandatory for the Web build`,
    );

    const orderedCommands = [
      "npm run version:prepare-build",
      unchainCommand,
      "cross-env PUPU_VERSION_PREPARED=1 npm run build:web",
      "npm run notices:check",
      "electron-builder",
    ];
    let previousIndex = -1;
    for (const expectedCommand of orderedCommands) {
      const commandIndex = command.indexOf(expectedCommand);
      assert.ok(
        commandIndex > previousIndex,
        `${scriptName} must execute ${expectedCommand} after the preceding package stage`,
      );
      previousIndex = commandIndex;
    }
  }
  for (const scriptName of [
    "build:win:chain",
    "build:win:chain:unsigned",
    "build:win:chain:unpacked",
  ]) {
    assert.match(scripts[scriptName], /--publish never/, `${scriptName} must never implicitly publish`);
  }
  assert.match(scripts["build:electron:win:unpacked"], /build:win:chain:unpacked/);
  assert.equal(packageJson.build.mac.artifactName, "${productName}-${version}-macos-${arch}.${ext}");
  assert.equal(packageJson.build.nsis.artifactName, "${productName}-${version}-windows-${arch}-setup.${ext}");
  assert.equal(packageJson.build.linux.artifactName, "${productName}-${version}-linux-x64.${ext}");
  assert.equal(packageJson.build.linux.publish, null, "Linux must not generate updater metadata before #200");
});

test("release QA keeps its public candidate contract while delegating package execution", () => {
  const workflow = read(".github/workflows/release-qa.yml");
  const sharedDeterministic = read(".github/workflows/_shared-release-deterministic.yml");
  const sharedPlaywright = read(".github/workflows/_shared-release-playwright.yml");
  const sharedPackage = read(".github/workflows/_shared-release-package.yml");
  const sharedReport = read(".github/workflows/_shared-release-report.yml");
  assertValidYaml(workflow, "release QA workflow");
  assertValidYaml(sharedDeterministic, "shared deterministic workflow");
  assertValidYaml(sharedPlaywright, "shared Playwright workflow");
  assertValidYaml(sharedPackage, "shared release package workflow");
  assertValidYaml(sharedReport, "shared release report workflow");
  assert.match(workflow, /- release-candidate/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-deterministic\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-playwright\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-package\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-report\.yml/);
  assert.match(workflow, /source_ref: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /source_sha: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /release_tag: \$\{\{ github\.ref_name \}\}/);
  assert.match(sharedPackage, /environment: \$\{\{ inputs\.qa_mode == 'release-candidate' && 'release-signing' \|\| 'release-qa' \}\}/);
  assert.match(sharedPackage, /Validate closed shared package inputs/);
  for (const [label, source] of [
    ["deterministic", sharedDeterministic],
    ["package", sharedPackage],
    ["Playwright", sharedPlaywright],
    ["report", sharedReport],
  ]) {
    assert.match(source, /release-candidate-ref\.mjs/, `${label} workflow must use the closed RC identity parser`);
    assert.match(source, /effectiveVersion/, `${label} workflow must propagate the full effective RC version`);
  }
  assert.match(sharedPackage, /build:electron:mac:release/);
  assert.match(sharedPackage, /build:electron:mac:intel:release/);
  assert.match(sharedPackage, /--config\.mac\.bundleShortVersion="\$QA_BASE_VERSION"/);
  assert.match(sharedPackage, /--config\.mac\.bundleVersion="\$QA_BASE_VERSION"/);
  assert.match(sharedPackage, /CFBundleShortVersionString/);
  assert.match(sharedPackage, /CFBundleVersion/);
  assert.match(sharedPackage, /build:electron:win:unpacked/);
  assert.match(sharedPackage, /working-directory: pupu\n        shell: bash/, "Windows package commands use Bash syntax");
  assert.match(sharedPackage, /release-signing\.mjs/);
  assert.match(sharedPackage, /uses: \.\/pupu\/\.github\/actions\/windows-artifact-signing/);
  assert.match(sharedPackage, /name: pupu-package-\$\{\{ inputs\.platform_name \}\}/);
  assert.match(sharedPackage, /name: release-qa-job-report-\$\{\{ inputs\.platform_name \}\}/);
  assert.match(sharedPackage, /retention-days: 7/);
  assert.match(sharedDeterministic, /Validate closed shared deterministic inputs/);
  assert.match(sharedDeterministic, /Unsupported shared deterministic mode/);
  assert.match(sharedDeterministic, /name: unchain-release-artifact/);
  assert.match(sharedDeterministic, /name: memory-v2-build-feature-snapshot/);
  assert.match(sharedPlaywright, /Validate closed shared Playwright inputs/);
  assert.match(sharedPlaywright, /Unsupported shared Playwright input tuple/);
  assert.match(sharedPlaywright, /lite:ubuntu-latest/);
  assert.match(sharedPlaywright, /release-candidate:windows-latest/);
  assert.match(sharedPlaywright, /name: release-qa-job-report-playwright-\$\{\{ runner\.os \}\}/);
  assert.match(sharedPlaywright, /name: playwright-evidence-\$\{\{ runner\.os \}\}/);
  assert.match(workflow, /verify-github-environment\.mjs --environment release-signing/);
  assert.match(sharedReport, /Validate closed shared final-report inputs/);
  assert.match(sharedReport, /Unsupported shared final-report mode/);
  assert.match(sharedReport, /Unsupported upstream result/);
  assert.match(sharedReport, /assemble-release-candidate\.mjs/);
  assert.ok(sharedReport.indexOf("Resolve final QA version") < sharedReport.indexOf("assemble-release-candidate.mjs"));
  assert.match(sharedReport, /name: pupu-release-candidate/);
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(sharedReport, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(workflow, /gh release (create|upload|edit)/);
  assert.doesNotMatch(sharedPackage, /gh release (create|upload|edit)/);
  assert.doesNotMatch(sharedReport, /gh release (create|upload|edit)/);
});

test("shared package workflow delegates the closed Windows signing chain to the shared action", () => {
  const sharedPackage = read(".github/workflows/_shared-release-package.yml");
  const start = sharedPackage.indexOf("- name: Prepare Windows payload for Artifact Signing");
  const end = sharedPackage.indexOf("- name: Write package QA report", start);
  assert.ok(start >= 0 && end > start, "Windows candidate signing chain must be present before its QA report");
  const chain = sharedPackage.slice(start, end);

  assert.match(sharedPackage, /Unsupported shared package input tuple/);
  assert.match(sharedPackage, /Source identity mismatch/);
  assert.match(chain, /id: windows_payload/);
  assert.match(chain, /Sign and verify the Windows release candidate payload/);
  assert.match(chain, /id: windows_artifact_signing/);
  assert.match(chain, /uses: \.\/pupu\/\.github\/actions\/windows-artifact-signing/);
  assert.match(chain, /signing-root-path: \.release-qa/);
  assert.match(chain, /payload-path: \.release-qa\/windows-unpacked/);
  assert.match(chain, /evidence-schema: pupu\.windows-release-candidate-signing\.v1/);
  assert.match(chain, /evidence-output: windows-signing-evidence\.v1\.json/);
  assert.doesNotMatch(chain, /azure\/artifact-signing-action/);
  assert.doesNotMatch(chain, /Get-AuthenticodeSignature/);

  const completionGuard = sharedPackage.slice(sharedPackage.indexOf("- name: Enforce package build result"));
  assert.match(completionGuard, /steps\.windows_payload\.outcome/);
  assert.match(completionGuard, /steps\.windows_artifact_signing\.outcome/);
  assert.doesNotMatch(completionGuard, /windows_signature_verification/);
});

test("stage workflow only promotes verified retained candidate bytes into a Draft Release", () => {
  const workflow = read(".github/workflows/release-stage.yml");
  assertValidYaml(workflow, "release stage workflow");
  assert.match(workflow, /environment: release-stage/);
  assert.match(workflow, /verify-github-environment\.mjs --environment release-stage/);
  assert.match(workflow, /group: release-promotion-\$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /Require dispatch from the exact release tag/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /--name pupu-release-candidate/);
  assert.match(workflow, /--name pupu-release-qualification/);
  assert.match(workflow, /QUALIFICATION_RUN_ID: \$\{\{ inputs\.qualification_run_id \}\}/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$CANDIDATE_RUN_ID"/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$QUALIFICATION_RUN_ID"/);
  assert.match(workflow, /verify-actions-run-provenance\.mjs/);
  assert.match(workflow, /--workflow-path \.github\/workflows\/release-qa\.yml/);
  assert.match(workflow, /--workflow-path "\$QUALIFICATION_WORKFLOW_PATH"/);
  assert.match(workflow, /qualification-provenance\.mjs/);
  assert.match(workflow, /verify-release-candidate\.mjs/);
  assert.match(workflow, /--require-qualification true/);
  assert.match(workflow, /--require-restart-qualification true/);
  assert.match(workflow, /candidate\/windows-signing-evidence\.v1\.json/);
  assert.match(workflow, /--allow-extra windows-signing-evidence\.v1\.json/);
  assert.match(workflow, /--candidate-run-id "\$CANDIDATE_RUN_ID"/);
  assert.match(workflow, /--qualification-run-id "\$QUALIFICATION_RUN_ID"/);
  assert.match(workflow, /Distinct run ID holding an eligible update or v0\.1\.10 bootstrap qualification receipt/);
  assert.doesNotMatch(workflow, /#218/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--policy promotion/);
  for (const mutation of ["gh release create", "gh release edit", "gh release upload"]) {
    assert.ok(workflow.indexOf("--policy promotion") < workflow.indexOf(mutation));
  }
  assert.match(workflow, /--draft/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /gh release download/);
  assert.doesNotMatch(workflow, /electron-builder|npm run build/);
});

test("publish workflow has a protected manual transition and cannot rebuild or upload", () => {
  const workflow = read(".github/workflows/release-publish.yml");
  assertValidYaml(workflow, "release publish workflow");
  assert.match(workflow, /environment: release-publish/);
  assert.match(workflow, /verify-github-environment\.mjs --environment release-publish/);
  assert.match(workflow, /group: release-promotion-\$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /Require dispatch from the exact release tag/);
  assert.match(workflow, /confirmation/);
  assert.match(workflow, /CONFIRMATION.*PUBLISH/s);
  assert.match(workflow, /gh release download/);
  assert.match(workflow, /--policy promotion/);
  assert.ok(workflow.indexOf("--policy promotion") < workflow.indexOf("gh release download"));
  assert.ok(workflow.indexOf("--policy promotion") < workflow.indexOf("gh release edit"));
  assert.match(workflow, /verify-release-candidate\.mjs/);
  assert.match(workflow, /actions\/runs\/\$CANDIDATE_RUN_ID/);
  assert.match(workflow, /actions\/runs\/\$QUALIFICATION_RUN_ID/);
  assert.match(workflow, /publish-draft:[\s\S]*?permissions:\s+contents: write\s+actions: read/);
  assert.match(workflow, /qualification-provenance\.mjs/);
  assert.match(workflow, /--workflow-path "\$QUALIFICATION_WORKFLOW_PATH"/);
  assert.match(workflow, /--candidate-run-id "\$CANDIDATE_RUN_ID"/);
  assert.match(workflow, /--qualification-run-id "\$QUALIFICATION_RUN_ID"/);
  assert.match(workflow, /--allow-extra windows-signing-evidence\.v1\.json/);
  assert.match(workflow, /--bootstrap-policy contracts\/release\/release-bootstrap-policy\.v1\.json/);
  assert.match(workflow, /gh release edit .*--draft=false --latest/);
  assert.match(workflow, /render-readme:/);
  assert.match(workflow, /needs: publish-draft/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/update-readme-download-links\.yml/);
  assert.match(workflow, /release_tag: \$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /pull-requests: write/);
  assert.doesNotMatch(workflow, /actions: write|secrets: inherit|gh workflow run|repository_dispatch/);
  assert.doesNotMatch(workflow, /electron-builder|npm run build|gh release upload|gh release create/);
});

test("README workflow is explicitly called after publication and never regex-rewrites a guessed version", () => {
  const workflow = read(".github/workflows/update-readme-download-links.yml");
  assertValidYaml(workflow, "README workflow");
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /required: true/);
  assert.doesNotMatch(workflow, /\n  release:|github\.event\.release|workflow_run/);
  assert.match(workflow, /gh release download/);
  assert.match(workflow, /--policy promotion/);
  assert.ok(workflow.indexOf("--policy promotion") < workflow.indexOf("gh release download"));
  assert.match(workflow, /verify-release-candidate\.mjs/);
  assert.match(workflow, /--allow-extra windows-signing-evidence\.v1\.json/);
  assert.match(workflow, /--bootstrap-policy contracts\/release\/release-bootstrap-policy\.v1\.json/);
  assert.match(workflow, /update-readme-links\.cjs --manifest/);
  assert.match(workflow, /inputs\.release_tag/);
  assert.ok(workflow.indexOf("verify-release-candidate.mjs") < workflow.indexOf("update-readme-links.cjs"));
  assert.ok(workflow.indexOf("update-readme-links.cjs") < workflow.indexOf("Create documentation pull request"));
  assert.doesNotMatch(workflow, /actions: write|gh workflow run|repository_dispatch|secrets: inherit/);
  assert.doesNotMatch(workflow, /\bsed\b|OLD_VERSION|package\.json|releases\/latest\/download/);
});
