import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const workflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/release-rc-qualification.yml"),
  "utf8",
);

test("RC qualification is exact-tag, four-target, fresh-only, and non-publishing", () => {
  const document = YAML.parseDocument(workflow, { uniqueKeys: true });
  assert.deepEqual(document.errors.map((error) => error.message), [], "RC qualification workflow must be valid YAML");

  assert.match(workflow, /candidate_run_id:/);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /release-candidate-ref\.mjs/);
  assert.match(workflow, /--policy candidate/);
  assert.match(workflow, /RELEASE_LANE.*rc/s);
  assert.match(workflow, /--workflow-path \.github\/workflows\/release-qa\.yml/);
  assert.match(workflow, /--name pupu-release-candidate/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-update-qualification\.yml/);
  for (const target of ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"]) {
    assert.match(workflow, new RegExp(target));
  }
  assert.match(workflow, /build-release-qualification\.mjs/);
  assert.match(workflow, /--reports-dir installed-reports/);
  assert.match(workflow, /name: pupu-release-qualification/);
  assert.match(workflow, /pupu\.release-qualification\.v1|generic non-promotable/);

  assert.doesNotMatch(workflow, /from_tag|restart-update|restart_update|secrets: inherit/);
  assert.doesNotMatch(workflow, /contents: write|gh release (create|upload|edit|delete)|electron-builder/);
  assert.doesNotMatch(workflow, /release-stage|release-publish|update-readme-download-links/);
});
