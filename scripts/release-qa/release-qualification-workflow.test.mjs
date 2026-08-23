import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/release-qualification.yml"), "utf8");

test("installed qualification workflow verifies retained bytes and seals a non-publishing receipt", () => {
  const document = YAML.parseDocument(workflow, { uniqueKeys: true });
  assert.deepEqual(document.errors.map((error) => error.message), []);
  assert.match(workflow, /candidate_run_id:/);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /defaults:\s+run:\s+shell: bash/);
  assert.match(workflow, /--workflow-path \.github\/workflows\/release-qa\.yml/);
  assert.match(workflow, /--name pupu-release-candidate/);
  assert.match(workflow, /macos-arm64/);
  assert.match(workflow, /macos-x64/);
  assert.match(workflow, /windows-x64/);
  assert.match(workflow, /linux-x64/);
  assert.match(workflow, /installed-package-qualification\.mjs/);
  assert.match(workflow, /build-release-qualification\.mjs/);
  assert.match(workflow, /name: pupu-release-qualification/);
  assert.match(workflow, /QUALIFICATION_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /electron-builder|gh release (create|upload|edit)|contents: write/);
});
