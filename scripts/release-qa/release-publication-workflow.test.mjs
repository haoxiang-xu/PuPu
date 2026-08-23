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
  for (const scriptName of [
    "build:electron",
    "build:electron:mac",
    "build:electron:mac:unsigned",
    "build:electron:mac:release",
    "build:electron:mac:intel",
    "build:electron:mac:intel:unsigned",
    "build:electron:mac:intel:release",
    "build:win:chain",
    "build:win:chain:unsigned",
    "build:win:chain:unpacked",
    "build:electron:linux",
  ]) {
    assert.match(scripts[scriptName], /--publish never/, `${scriptName} must never implicitly publish`);
  }
  assert.match(scripts["build:electron:win:unpacked"], /build:win:chain:unpacked/);
  assert.equal(packageJson.build.mac.artifactName, "${productName}-${version}-macos-${arch}.${ext}");
  assert.equal(packageJson.build.nsis.artifactName, "${productName}-${version}-windows-${arch}-setup.${ext}");
  assert.equal(packageJson.build.linux.artifactName, "${productName}-${version}-linux-${arch}.${ext}");
  assert.equal(packageJson.build.linux.publish, null, "Linux must not generate updater metadata before #200");
});

test("release QA has an explicit signed, non-publishing candidate mode and seals candidate bytes", () => {
  const workflow = read(".github/workflows/release-qa.yml");
  assertValidYaml(workflow, "release QA workflow");
  assert.match(workflow, /- release-candidate/);
  assert.match(workflow, /environment: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.qa_mode == 'release-candidate' && 'release-signing'/);
  const modeExpression = "QA_MODE: ${{ github.event_name == 'workflow_dispatch' && inputs.qa_mode || (startsWith(github.ref, 'refs/tags/v') && 'release') || 'lite' }}";
  assert.equal(workflow.split(modeExpression).length - 1, 5, "all jobs must resolve manual candidate mode before tag fallback");
  assert.match(workflow, /build:electron:mac:release/);
  assert.match(workflow, /build:electron:mac:intel:release/);
  assert.match(workflow, /build:electron:win:unpacked/);
  assert.match(workflow, /release-signing\.mjs/);
  assert.match(workflow, /verify-github-environment\.mjs --environment release-signing/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /xcrun stapler validate/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /azure\/login@v3/);
  assert.match(workflow, /azure\/artifact-signing-action@v2/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME/);
  assert.match(workflow, /Sign unpacked Windows payload with Artifact Signing/);
  assert.match(workflow, /Build installer from Azure-signed Windows payload/);
  assert.match(workflow, /Sign Windows installer with Artifact Signing/);
  assert.doesNotMatch(workflow, /secrets\.WIN_CSC_LINK|secrets\.WIN_CSC_KEY_PASSWORD/);
  assert.match(workflow, /verify-release-package-output\.mjs/);
  assert.match(workflow, /assemble-release-candidate\.mjs/);
  assert.ok(workflow.indexOf("Resolve final QA version") < workflow.indexOf("assemble-release-candidate.mjs"));
  assert.match(workflow, /echo "QA_VERSION=\$PACKAGE_VERSION" >> "\$GITHUB_ENV"/);
  const finalAssemblySetup = workflow.slice(
    workflow.indexOf("Set up Node for final candidate assembly"),
    workflow.indexOf("assemble-release-candidate.mjs"),
  );
  assert.match(finalAssemblySetup, /node-version: 20/);
  assert.match(finalAssemblySetup, /Install final candidate assembly dependencies/);
  assert.match(finalAssemblySetup, /working-directory: pupu\s+run: npm ci/);
  const packageJobEnvironment = workflow.slice(
    workflow.indexOf("  package-matrix:"),
    workflow.indexOf("    steps:", workflow.indexOf("  package-matrix:")),
  );
  assert.doesNotMatch(packageJobEnvironment, /\b(CSC_LINK|WIN_CSC_LINK|APPLE_API_KEY)\b/);
  const signingStep = workflow.slice(
    workflow.indexOf("Require immutable tag and signing credentials"),
    workflow.indexOf("Start packaged sidecar", workflow.indexOf("Require immutable tag and signing credentials")),
  );
  assert.match(signingStep, /matrix\.signing_platform == 'macos'/);
  assert.match(signingStep, /matrix\.signing_platform == 'windows'/);
  assert.match(workflow, /name: pupu-release-candidate/);
  assert.doesNotMatch(workflow, /gh release (create|upload|edit)/);
  assert.doesNotMatch(workflow, /head -1/);
});

test("stage workflow only promotes verified retained candidate bytes into a Draft Release", () => {
  const workflow = read(".github/workflows/release-stage.yml");
  assertValidYaml(workflow, "release stage workflow");
  assert.match(workflow, /environment: release-stage/);
  assert.match(workflow, /verify-github-environment\.mjs --environment release-stage/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /--name pupu-release-candidate/);
  assert.match(workflow, /--name pupu-release-qualification/);
  assert.match(workflow, /QUALIFICATION_RUN_ID: \$\{\{ inputs\.qualification_run_id \|\| inputs\.candidate_run_id \}\}/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$CANDIDATE_RUN_ID"/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$QUALIFICATION_RUN_ID"/);
  assert.match(workflow, /verify-actions-run-provenance\.mjs/);
  assert.match(workflow, /--workflow-path \.github\/workflows\/release-qa\.yml/);
  assert.match(workflow, /--workflow-path "\$QUALIFICATION_WORKFLOW_PATH"/);
  assert.match(workflow, /verify-release-candidate\.mjs/);
  assert.match(workflow, /--require-qualification true/);
  assert.match(workflow, /--candidate-run-id "\$CANDIDATE_RUN_ID"/);
  assert.match(workflow, /--qualification-run-id "\$QUALIFICATION_RUN_ID"/);
  assert.match(workflow, /gh release create/);
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
  assert.match(workflow, /confirmation/);
  assert.match(workflow, /CONFIRMATION.*PUBLISH/s);
  assert.match(workflow, /gh release download/);
  assert.match(workflow, /verify-release-candidate\.mjs/);
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
  assert.match(workflow, /verify-release-candidate\.mjs/);
  assert.match(workflow, /update-readme-links\.cjs --manifest/);
  assert.match(workflow, /inputs\.release_tag/);
  assert.ok(workflow.indexOf("verify-release-candidate.mjs") < workflow.indexOf("update-readme-links.cjs"));
  assert.ok(workflow.indexOf("update-readme-links.cjs") < workflow.indexOf("Create documentation pull request"));
  assert.doesNotMatch(workflow, /actions: write|gh workflow run|repository_dispatch|secrets: inherit/);
  assert.doesNotMatch(workflow, /\bsed\b|OLD_VERSION|package\.json|releases\/latest\/download/);
});
