import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/release-qualification.yml"), "utf8");
const sharedWorkflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/_shared-release-update-qualification.yml"),
  "utf8",
);
const windowsRestartWorkflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/_shared-release-windows-restart-update.yml"),
  "utf8",
);

test("installed qualification workflow verifies retained bytes and seals a non-publishing receipt", () => {
  for (const [label, source] of [
    ["installed qualification workflow", workflow],
    ["shared installed qualification workflow", sharedWorkflow],
    ["shared Windows restart-update workflow", windowsRestartWorkflow],
  ]) {
    const document = YAML.parseDocument(source, { uniqueKeys: true });
    assert.deepEqual(document.errors.map((error) => error.message), [], `${label} must be valid YAML`);
  }
  assert.match(workflow, /candidate_run_id:/);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /from_tag:/);
  assert.match(workflow, /defaults:\s+run:\s+shell: bash/);
  assert.match(workflow, /--workflow-path \.github\/workflows\/release-qa\.yml/);
  assert.match(workflow, /--name pupu-release-candidate/);
  assert.match(workflow, /Resolve exact signed N-1 fixture source/);
  assert.match(workflow, /git fetch --no-tags origin "refs\/tags\/\$FROM_TAG:refs\/tags\/\$FROM_TAG"/);
  assert.match(workflow, /validate-update-fixture-source\.mjs/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-update-qualification\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-windows-restart-update\.yml/);
  assert.match(workflow, /windows-restart-update/);
  assert.match(workflow, /WINDOWS_RESTART_UPDATE_RESULT/);
  assert.match(workflow, /secrets: inherit/);
  assert.match(sharedWorkflow, /Validate closed shared installed-qualification inputs/);
  assert.match(sharedWorkflow, /Unsupported shared installed-qualification input tuple/);
  assert.match(workflow, /macos-arm64/);
  assert.match(workflow, /macos-x64/);
  assert.match(workflow, /windows-x64/);
  assert.match(workflow, /linux-x64/);
  assert.match(sharedWorkflow, /installed-package-qualification\.mjs/);
  assert.match(workflow, /build-release-update-qualification\.mjs/);
  assert.match(workflow, /pattern: restart-update-qualification-\*/);
  assert.match(workflow, /--fresh-reports-dir installed-reports/);
  assert.match(workflow, /--restart-reports-dir restart-reports/);
  assert.match(workflow, /--from-tag "\$\{\{ needs\.candidate-preflight\.outputs\.fixture_tag \}\}"/);
  assert.match(sharedWorkflow, /name: installed-qualification-\$\{\{ inputs\.target_id \}\}/);
  assert.match(workflow, /name: pupu-release-qualification/);
  assert.match(workflow, /QUALIFICATION_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(windowsRestartWorkflow, /environment: release-signing/);
  assert.match(windowsRestartWorkflow, /id-token: write/);
  assert.match(windowsRestartWorkflow, /FEED_PORT: "38193"/);
  assert.match(windowsRestartWorkflow, /gh release download "\$FROM_TAG"/);
  assert.match(windowsRestartWorkflow, /repository: haoxiang-xu\/unchain/);
  assert.match(windowsRestartWorkflow, /write-qualification-fixture-build-config\.mjs/);
  assert.match(windowsRestartWorkflow, /validate-qualification-fixture-app-update\.mjs/);
  assert.match(windowsRestartWorkflow, /uses: \.\/pupu\/\.github\/actions\/windows-artifact-signing/);
  assert.match(windowsRestartWorkflow, /restart-update-fixture-evidence\.mjs/);
  assert.match(windowsRestartWorkflow, /run-restart-update-qualification\.mjs/);
  assert.match(windowsRestartWorkflow, /restart-update-qualification-windows-x64/);
  assert.doesNotMatch(windowsRestartWorkflow, /gh release (create|upload|edit|delete)|contents: write/);
  assert.doesNotMatch(windowsRestartWorkflow, /macos-(arm64|x64)|macos-latest|macos-15-intel/);
  assert.doesNotMatch(workflow, /electron-builder|gh release (create|upload|edit)|contents: write/);
});
