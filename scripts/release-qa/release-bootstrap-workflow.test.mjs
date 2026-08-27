import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("bootstrap qualification is exact-tag, approval-gated, fresh-only, and non-publishing", () => {
  const workflow = read(".github/workflows/release-bootstrap-qualification.yml");
  YAML.parse(workflow, { uniqueKeys: true });
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /BOOTSTRAP_V0_1_11/);
  assert.match(workflow, /environment: release-qualification/);
  assert.match(workflow, /verify-github-environment\.mjs --environment release-qualification/);
  assert.match(workflow, /RELEASE_TAG" != "v0\.1\.11/);
  assert.match(workflow, /validate-legacy-release-gap\.mjs/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-update-qualification\.yml/);
  for (const target of ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"]) assert.match(workflow, new RegExp(target));
  assert.match(workflow, /build-release-bootstrap-qualification\.mjs/);
  assert.match(workflow, /name: pupu-release-qualification/);
  assert.doesNotMatch(workflow, /from_tag|restart-update-qualification|gh release (create|upload|edit)|electron-builder/);
});

test("promotion resolves receipt schema to one workflow and preserves the bootstrap warning", () => {
  const stage = read(".github/workflows/release-stage.yml");
  const publish = read(".github/workflows/release-publish.yml");
  const readme = read(".github/workflows/update-readme-download-links.yml");
  for (const [label, workflow] of [["stage", stage], ["publish", publish], ["README", readme]]) {
    YAML.parse(workflow, { uniqueKeys: true });
    assert.match(workflow, /--bootstrap-policy contracts\/release\/release-bootstrap-policy\.v1\.json/, `${label} must use the frozen bootstrap policy`);
  }
  assert.match(stage, /qualification-provenance\.mjs/);
  assert.match(publish, /qualification-provenance\.mjs/);
  assert.match(stage, /required: true[\s\S]*Distinct run ID/);
  assert.doesNotMatch(stage, /inputs\.qualification_run_id \|\| inputs\.candidate_run_id/);
  assert.match(stage, /Existing v0\.1\.9 and v0\.1\.10 users may need to install this version manually/);
  assert.match(stage, /automatic update was not qualified/);
});
