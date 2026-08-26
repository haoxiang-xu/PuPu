import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("release builds Unchain once and every test/package consumes the same bytes", () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, ".github/workflows/release-qa.yml"),
    "utf8",
  );
  const sharedPackage = fs.readFileSync(
    path.join(ROOT, ".github/workflows/_shared-release-package.yml"),
    "utf8",
  );
  const sharedDeterministic = fs.readFileSync(
    path.join(ROOT, ".github/workflows/_shared-release-deterministic.yml"),
    "utf8",
  );
  assert.equal(
    sharedDeterministic.match(/build-unchain-artifact\.mjs/g)?.length,
    1,
    "the selected source must be built exactly once",
  );
  assert.equal(
    sharedDeterministic.match(/repository: haoxiang-xu\/unchain/g)?.length,
    1,
    "only the deterministic producer may checkout Unchain",
  );
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-deterministic\.yml/);
  assert.match(sharedDeterministic, /Validate closed shared deterministic inputs/);
  assert.match(sharedDeterministic, /name: unchain-release-artifact/);
  assert.match(sharedDeterministic, /Create the single controlled Memory V2 build snapshot/);
  assert.match(sharedDeterministic, /--profile contracts\/memory-v2\/release-profile\.shadow\.v1\.json/);
  assert.match(sharedDeterministic, /name: memory-v2-build-feature-snapshot/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-package\.yml/);
  assert.match(sharedPackage, /Download the immutable Memory V2 build snapshot/);
  assert.match(sharedPackage, /Verify the downloaded Memory V2 build snapshot bytes/);
  assert.match(sharedPackage, /PUPU_BUILD_FEATURE_SNAPSHOT_PATH=/);
  assert.match(sharedPackage, /Download the deterministic Unchain artifact/);
  assert.match(sharedPackage, /UNCHAIN_ARTIFACT_PATH/);
  assert.match(sharedPackage, /UNCHAIN_ARTIFACT_EVIDENCE_PATH/);
  assert.match(sharedPackage, /package-sidecar-smoke\.mjs/);
  assert.match(sharedPackage, /--snapshot "\$PUPU_BUILD_FEATURE_SNAPSHOT_PATH"/);
  assert.match(sharedPackage, /executed_tests/);
  assert.match(sharedPackage, /--bytes-only true/);
  assert.match(
    sharedPackage,
    /UNCHAIN_ARTIFACT_PATH: \$\{\{ steps\.artifact_verify\.outputs\.artifact_path \}\}/,
  );
  assert.match(
    sharedPackage,
    /UNCHAIN_ARTIFACT_EVIDENCE_PATH: \$\{\{ steps\.artifact_verify\.outputs\.evidence_path \}\}/,
  );
  assert.doesNotMatch(workflow, /UNCHAIN_ARTIFACT_PATH=\$PWD/);
  assert.doesNotMatch(
    workflow,
    /resolve-unchain-revision|verify-pinned-unchain|pinned Unchain checkout|UNCHAIN_LOCKED_SHA|UNCHAIN_TESTED_SHA/,
  );
  for (const [label, source] of [
    ["release workflow", workflow],
    ["shared deterministic workflow", sharedDeterministic],
    ["shared package workflow", sharedPackage],
  ]) {
    const parsed = YAML.parseDocument(source, { uniqueKeys: true });
    assert.deepEqual(
      parsed.errors.map((error) => error.message),
      [],
      `${label} must be valid YAML with unique mapping keys`,
    );
  }
});

test("active build and local QA paths contain no compatibility lock or dirty bypass", () => {
  const activeFiles = [
    "package.json",
    "scripts/release-qa/run-local-gate.mjs",
    "scripts/release-qa/local-gate-checks.mjs",
    "unchain_runtime/scripts/build_unchain_server.sh",
    "unchain_runtime/scripts/build_unchain_server.ps1",
  ];
  const source = activeFiles.map((file) =>
    fs.readFileSync(path.join(ROOT, file), "utf8")
  ).join("\n");
  assert.doesNotMatch(
    source,
    /unchain-core\.lock|exact_sha|dev_bypass|ALLOW_DIRTY_UNCHAIN|UNCHAIN_SOURCE_PATH/,
  );
  assert.match(source, /--force-reinstall --no-deps/);
  assert.match(source, /--installed true/);
  for (const relativePath of [
    "unchain_runtime/unchain-core.lock.json",
    "scripts/release-qa/resolve-unchain-revision.mjs",
    "scripts/release-qa/unchain-checkout.mjs",
    "scripts/release-qa/verify-pinned-unchain.mjs",
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false);
  }
});

test("every local package chain prepares or reuses one immutable artifact", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const scripts = packageJson.scripts;
  for (const name of [
    "build:unchain",
    "build:unchain:mac",
    "build:unchain:mac:intel",
    "build:unchain:linux",
    "build:unchain:win",
  ]) {
    assert.match(scripts[name], /run-with-unchain-artifact\.mjs/);
  }
  assert.match(scripts["build:electron"], /npm run build:unchain/);
  assert.match(scripts["build:electron:mac:unsigned"], /npm run build:unchain:mac/);
  assert.match(scripts["build:win:chain"], /npm run build:unchain:win/);
  assert.match(scripts["build:electron:linux"], /npm run build:unchain:linux/);

  const wrapper = fs.readFileSync(
    path.join(ROOT, "scripts", "release-qa", "run-with-unchain-artifact.mjs"),
    "utf8",
  );
  assert.match(wrapper, /build-unchain-artifact\.mjs/);
  assert.match(wrapper, /readAndVerifyUnchainArtifactEvidence/);
  assert.match(wrapper, /UNCHAIN_ARTIFACT_PATH: path\.resolve\(artifactPath\)/);
  assert.match(wrapper, /UNCHAIN_ARTIFACT_EVIDENCE_PATH: path\.resolve\(evidencePath\)/);
  assert.match(wrapper, /process\.env\.npm_execpath/);
  assert.match(wrapper, /Windows npm execution requires npm_execpath/);
  assert.match(wrapper, /\[npmExecPath, \.\.\.childArgs\]/);
  assert.doesNotMatch(wrapper, /npm\.cmd/);
});

test("active AI release review requires artifact and protocol continuity, never a SHA lock", () => {
  const prompt = fs.readFileSync(
    path.join(ROOT, "scripts", "release-qa", "release-review-prompt.md"),
    "utf8",
  );
  assert.match(prompt, /same immutable Unchain wheel SHA-256 and artifact evidence/);
  assert.match(prompt, /runtime\s+protocol manifest digest matches that evidence/);
  assert.match(
    prompt,
    /selected source\s+provenance is clean and revision-consistent/,
  );
  assert.doesNotMatch(
    prompt,
    /tested Unchain SHA|exact SHA|runtime lock|compatibility SHA/i,
  );
});
