import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const workflowPath = path.join(ROOT, ".github/workflows/macos-signing-qualification.yml");

test("macOS signing qualification is explicit, dual-architecture, protected, and non-publishing", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const document = YAML.parseDocument(workflow, { uniqueKeys: true });

  assert.deepEqual(document.errors.map((error) => error.message), []);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /SIGN_MACOS_QUALIFICATION/);
  assert.match(workflow, /expected_commit/);
  assert.match(workflow, /unchain_ref/);
  assert.match(workflow, /qualification must run from refs\/heads\/dev/);
  assert.match(workflow, /expected_commit must equal the dispatched commit/);
  assert.match(workflow, /unchain_ref must be a full immutable commit SHA/);
  assert.match(workflow, /macos-arm64/);
  assert.match(workflow, /macos-x64/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /macos-15-intel/);
  assert.match(workflow, /environment: macos-signing-qualification/);
  assert.doesNotMatch(workflow, /environment: release-signing/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /verify-github-environment\.mjs/);
  assert.match(workflow, /--environment macos-signing-qualification/);
  assert.match(workflow, /repository: haoxiang-xu\/unchain/);
  assert.match(workflow, /ref: \$\{\{ inputs\.unchain_ref \}\}/);
  assert.match(workflow, /path: \.qualification-unchain/);
  assert.match(workflow, /UNCHAIN_ARTIFACT_SOURCE_PATH: \$\{\{ github\.workspace \}\}\/.qualification-unchain/);
  assert.match(workflow, /UNCHAIN_ARTIFACT_SOURCE_REF: \$\{\{ inputs\.unchain_ref \}\}/);
  assert.match(workflow, /build:electron:mac:release/);
  assert.match(workflow, /build:electron:mac:intel:release/);
  assert.match(workflow, /release-signing\.mjs --platform macos/);
  assert.match(workflow, /macos-signing-evidence\.mjs/);
  assert.match(workflow, /pupu\.macos-signing-qualification\.v1/);
  assert.match(workflow, /secret-material-denylist\.mjs/);
  assert.match(workflow, /Upload sanitized macOS signing evidence only/);
  assert.doesNotMatch(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /gh release (create|upload|edit|delete)/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);
  assert.doesNotMatch(workflow, /path:\s*(dist|\$\{\{ github\.workspace \}\})\s*$/m);
});
