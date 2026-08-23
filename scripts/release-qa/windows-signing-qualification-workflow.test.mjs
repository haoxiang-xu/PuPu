import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const workflowPath = path.join(ROOT, ".github/workflows/windows-signing-qualification.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

test("Windows signing qualification is an explicit, protected, non-publishing Artifact Signing check", () => {
  const document = YAML.parseDocument(workflow, { uniqueKeys: true });
  assert.deepEqual(document.errors.map((error) => error.message), []);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /SIGN_WINDOWS_QUALIFICATION/);
  assert.match(workflow, /environment: release-signing/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /\$env:RUNNER_TEMP/);
  assert.doesNotMatch(workflow, /\$\{\{\s*runner\.temp\s*\}\}/);
  assert.match(workflow, /Checkout Unchain source for the qualification build/);
  assert.match(workflow, /repository: haoxiang-xu\/unchain/);
  assert.match(workflow, /ref: dev/);
  assert.match(workflow, /path: \.qualification-unchain/);
  assert.match(workflow, /UNCHAIN_ARTIFACT_SOURCE_PATH: \$\{\{ github\.workspace \}\}\/.qualification-unchain/);
  assert.match(workflow, /UNCHAIN_ARTIFACT_SOURCE_REF: dev/);
  assert.match(workflow, /Install Python runtime dependencies for wheel manifest inspection/);
  assert.match(workflow, /python -m pip install -r unchain_runtime\/server\/requirements\.txt/);
  assert.match(workflow, /azure\/login@v3/);
  assert.equal((workflow.match(/azure\/artifact-signing-action@v2/g) || []).length, 2);
  assert.match(workflow, /AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME/);
  assert.match(workflow, /Resolve non-interactive build version/);
  assert.match(workflow, /PUPU_BUILD_VERSION=\$buildVersion/);
  assert.match(workflow, /package\.json did not provide a build version/);
  assert.match(workflow, /build:electron:win:unpacked/);
  assert.match(workflow, /--prepackaged/);
  assert.match(workflow, /--publish never/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /Status -ne "Valid"/);
  assert.match(workflow, /pupu\.windows-signing-qualification\.v1/);
  assert.match(workflow, /name: windows-signing-qualification/);
  assert.match(workflow, /path: windows-signing-qualification\.v1\.json/);
  const evidenceUploadStep = workflow.slice(workflow.indexOf("- name: Upload signing qualification evidence only"));
  assert.match(evidenceUploadStep, /if:\s*\$\{\{ success\(\) \}\}/);
  assert.doesNotMatch(evidenceUploadStep, /if:\s*always\(\)/);
  assert.doesNotMatch(workflow, /gh release (create|upload|edit|delete)/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /path:\s*(dist|\$\{\{ github\.workspace \}\})\s*$/m);
});
