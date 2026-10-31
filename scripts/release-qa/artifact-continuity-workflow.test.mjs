import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");

for (const dependencyExit of [0, 29]) {
  test(`artifact verification follows a successful dependency check only (${dependencyExit})`, (t) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-dependency-gate-"));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const bin = path.join(temporary, "bin");
    fs.mkdirSync(bin);
    const trace = path.join(temporary, "trace.log");
    const artifact = path.join(temporary, "candidate.whl");
    const evidence = path.join(temporary, "evidence.json");
    fs.writeFileSync(artifact, "fixture wheel");
    fs.writeFileSync(evidence, "{}");
    // Exercise the real workflow shell; only its executables are substituted.
    fs.writeFileSync(path.join(bin, "python"),
      '#!/bin/sh\nprintf "python:%s\\n" "$*" >> "$QA_TRACE_PATH"\n' +
      'if [ "$*" = "-m pip check" ]; then exit "$QA_DEPENDENCY_EXIT"; fi\n' +
      'if [ "$1" = "-I" ]; then printf "UNCHAIN_SOURCE_PATH=fixture-site\\n"; fi\nexit 0\n',
      { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "node"),
      '#!/bin/sh\nprintf "verify:%s\\n" "$*" >> "$QA_TRACE_PATH"\nexit 0\n',
      { mode: 0o755 });
    const workflow = YAML.parse(fs.readFileSync(
      path.join(ROOT, ".github/workflows/_shared-release-deterministic.yml"), "utf8",
    ));
    const step = workflow.jobs.deterministic.steps.find((entry) => entry.id === "artifact_verify");
    const script = step.run
      .replaceAll("${{ steps.unchain_artifact.outputs.artifact_path }}", artifact)
      .replaceAll("${{ steps.unchain_artifact.outputs.evidence_path }}", evidence);
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", script], {
      cwd: temporary, encoding: "utf8", timeout: 5000,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        QA_TRACE_PATH: trace, QA_DEPENDENCY_EXIT: String(dependencyExit),
        GITHUB_ENV: path.join(temporary, "github-env") },
    });
    assert.equal(result.status, dependencyExit, result.stderr);
    const calls = fs.readFileSync(trace, "utf8");
    assert.match(calls, /python:-m pip check/);
    assert.equal(calls.includes("verify:"), dependencyExit === 0);
    assert.ok(calls.includes(artifact));
  });
}

test("sidecar builders resolve the same wheel's dependencies before verifying it", () => {
  for (const file of ["build_unchain_server.sh", "build_unchain_server.ps1"]) {
    const source = fs.readFileSync(path.join(ROOT, "unchain_runtime/scripts", file), "utf8");
    const install = source.indexOf("--force-reinstall --no-deps");
    const resolve = source.indexOf("--constraint", install);
    const check = source.indexOf("-m pip check", resolve);
    const verify = source.indexOf("verify-unchain-artifact.mjs", check);
    assert.ok(install >= 0 && resolve > install && check > resolve && verify > check, file);
  }
});

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
  const deterministicSteps = YAML.parse(sharedDeterministic).jobs.deterministic.steps;
  const artifactVerifyIndex = deterministicSteps.findIndex(
    (step) => step.id === "artifact_verify",
  );
  assert.notEqual(artifactVerifyIndex, -1);
  const artifactVerify = deterministicSteps[artifactVerifyIndex];
  assert.match(
    artifactVerify.run,
    /--installed true[\s\S]*import unchain[\s\S]*unchain\.__file__[\s\S]*GITHUB_ENV/,
    "after byte verification, tests must bind to the imported installed artifact",
  );
  assert.match(artifactVerify.run, /UNCHAIN_SOURCE_PATH=/);
  assert.doesNotMatch(
    artifactVerify.run,
    /UNCHAIN_SOURCE_PATH=.*(?:\.\.\/unchain|github\.workspace)/,
    "a sibling checkout must not replace the verified installed wheel",
  );
  for (const id of ["python", "context_v2_contract", "run_bundle_contract"]) {
    assert.ok(
      deterministicSteps.findIndex((step) => step.id === id) > artifactVerifyIndex,
      `${id} must run after the verified artifact is bound`,
    );
  }
  const pythonStep = deterministicSteps.find((step) => step.id === "python");
  assert.equal(
    pythonStep.env?.PYTHONPATH,
    undefined,
    "host tests must inherit the verified installed distribution; a wheel ZIP import hides toolkit metadata files",
  );
  assert.match(sharedDeterministic, /Create the single controlled Memory V2 build snapshot/);
  assert.match(sharedDeterministic, /--profile docs\/contracts\/memory-v2\/release-profile\.all\.v2\.json/);
  assert.match(sharedDeterministic, /name: memory-v2-build-feature-snapshot/);
  assert.match(
    sharedDeterministic,
    /Web build and version check[\s\S]*PUPU_BUILD_FEATURE_SNAPSHOT_PATH: \$\{\{ steps\.build_feature_snapshot\.outputs\.snapshot_path \}\}/,
    "deterministic Web QA must consume the snapshot it produced",
  );
  assert.match(workflow, /uses: \.\/\.github\/workflows\/_shared-release-package\.yml/);
  assert.match(sharedPackage, /Download the immutable Memory V2 build snapshot/);
  assert.match(sharedPackage, /Verify the downloaded Memory V2 build snapshot bytes/);
  assert.match(sharedPackage, /PUPU_BUILD_FEATURE_SNAPSHOT_PATH=/);
  assert.match(sharedPackage, /Download the deterministic Unchain artifact/);
  assert.match(sharedPackage, /UNCHAIN_ARTIFACT_PATH/);
  assert.match(sharedPackage, /UNCHAIN_ARTIFACT_EVIDENCE_PATH/);
  assert.match(sharedPackage, /package-sidecar-smoke\.mjs/);
  assert.match(sharedPackage, /--snapshot "\$PUPU_BUILD_FEATURE_SNAPSHOT_PATH"/);
  assert.match(sharedPackage, /Probe packaged Windows Vault supervisor containment/);
  assert.match(sharedPackage, /windows-packaged-vault-supervisor-probe\.py/);
  assert.match(sharedPackage, /verify-windows-packaged-vault-supervisor-evidence\.py/);
  assert.match(sharedPackage, /packaged Windows Vault supervisor containment/);
  assert.match(sharedPackage, /steps\.packaged_vault_supervisor\.outcome/);
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

test("all sidecar builders pin PyInstaller and freeze the private vault entries", () => {
  for (const relativePath of [
    "unchain_runtime/scripts/build_unchain_server.sh",
    "unchain_runtime/scripts/build_unchain_server.ps1",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert.match(source, /PYINSTALLER_VERSION[=\s]+["']?6\.22\.1/);
    assert.match(source, /pyinstaller==\$?PYINSTALLER_VERSION/);
    assert.doesNotMatch(source, /pyinstaller>=/);
    assert.match(source, /hidden-import[", ]+durable_job_runtime/);
    assert.match(source, /hidden-import[", ]+vault_sink_job_supervisor/);
    assert.match(source, /hidden-import[", ]+vault_sink_worker/);
  }
  const windowsBuilder = fs.readFileSync(
    path.join(ROOT, "unchain_runtime/scripts/build_unchain_server.ps1"),
    "utf8",
  );
  assert.match(
    windowsBuilder,
    /System\.Security\.Cryptography\.SHA256/,
    "Windows provenance hashing must work when powershell.exe lacks Get-FileHash",
  );
  assert.doesNotMatch(windowsBuilder, /Get-FileHash\s+-Algorithm/);
});
