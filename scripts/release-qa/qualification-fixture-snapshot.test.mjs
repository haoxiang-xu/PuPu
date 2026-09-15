import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { finished } from "node:stream/promises";
import test from "node:test";
import asar from "@electron/asar";
import YAML from "yaml";
import {
  prepareFixtureReleaseSnapshot, resolveFixtureSnapshotProfile, verifyFixtureReleaseSnapshot,
} from "./qualification-fixture-snapshot.mjs";
import { inspectResources } from "./installed-package-qualification.mjs";

const snapshotTestRoot = path.resolve(import.meta.dirname, "../..");
const oldReleaseCommit = "020d898de56d1cdebafb136f6176c4d10bbfdcf8";

function snapshotFixture(t, revision = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-fixture-snapshot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const profile = revision ? "contracts/memory-v2/release-profile.all.v2.json"
    : "docs/contracts/memory-v2/release-profile.all.v1.json";
  for (const name of ["scripts/write-build-feature-snapshot.cjs", "scripts/build-web.cjs",
    "electron/main/services/unchain/memory_v2_rollout.js",
    ".github/workflows/_shared-release-deterministic.yml", profile]) {
    const contents = revision ? spawnSync("git", ["show", `${revision}:${name}`], {
      cwd: snapshotTestRoot, encoding: "utf8",
    }) : { status: 0, stdout: fs.readFileSync(path.join(snapshotTestRoot, name), "utf8") };
    assert.equal(contents.status, 0, contents.stderr);
    fs.mkdirSync(path.dirname(path.join(sourceRoot, name)), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, name), contents.stdout);
  }
  return { root, sourceRoot, snapshotPath: path.join(root, "snapshot.json"), profile };
}

// Run the REAL build-web entry point and snapshot writer. Only expensive React
// bundling is replaced; this does not claim UI/Windows/signing acceptance.
function runFixtureWebBuild(f, env) {
  const script = path.join(f.sourceRoot, "scripts/build-web.cjs");
  const originalRequire = createRequire(script);
  const exit = Symbol("exit");
  let status;
  let bundledFlags;
  try {
    vm.runInNewContext(fs.readFileSync(script, "utf8"), {
      __dirname: path.dirname(script), console: { log() {}, warn() {}, error() {} },
      process: { env, argv: [process.execPath, script], platform: "linux", execPath: process.execPath,
        exit(code) { status = code; throw exit; } },
      require(name) {
        if (name !== "child_process") return originalRequire(name);
        return { spawnSync(_exe, _args, options) {
          bundledFlags = JSON.parse(options.env.REACT_APP_BUILD_FEATURE_FLAGS);
          fs.mkdirSync(path.join(f.sourceRoot, "build"), { recursive: true });
          return { status: 0 };
        } };
      },
    }, { filename: script });
  } catch (error) { if (error !== exit) throw error; }
  return { status, bundledFlags };
}

async function packSnapshotFixture(f) {
  const resourceRoot = path.join(f.root, "resources");
  fs.mkdirSync(path.join(resourceRoot, "unchain_runtime/dist/linux"), { recursive: true });
  fs.writeFileSync(path.join(resourceRoot, "unchain_runtime/dist/linux/unchain-server"), "test-sidecar");
  const executablePath = path.join(f.root, "test-executable");
  fs.writeFileSync(executablePath, "test-executable");
  const asarPath = path.join(resourceRoot, "app.asar");
  // This pinned ASAR version resolves with out.end(), before the destination
  // stream necessarily finishes. Await the stream, not a timing-based retry.
  const archiveStream = await asar.createPackage(f.sourceRoot, asarPath);
  await finished(archiveStream);
  return { asarPath, resourceRoot, executablePath, sidecarPlatform: "linux" };
}

async function exerciseSnapshotBoundary(t, revision) {
  const f = snapshotFixture(t, revision);
  // Red: the previous workflow silently builds Memory V2 off. The existing
  // installed consumer rejects a real ASAR containing that actual build output.
  assert.deepEqual(runFixtureWebBuild(f, {}).bundledFlags.enable_memory_v2, false);
  const broken = await packSnapshotFixture(f);
  assert.throws(() => inspectResources(broken), /no valid enabled release build snapshot/);
  asar.uncacheAll();

  assert.equal(resolveFixtureSnapshotProfile(f.sourceRoot), path.join(f.sourceRoot, f.profile));
  const produced = prepareFixtureReleaseSnapshot(f);
  assert.match(produced.sha256, /^[0-9a-f]{64}$/);
  assert.equal(runFixtureWebBuild(f, { PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT: "1",
    PUPU_BUILD_FEATURE_SNAPSHOT_PATH: path.join(f.root, "missing.json") }).status, 1);
  const built = runFixtureWebBuild(f, { PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT: "1",
    PUPU_BUILD_FEATURE_SNAPSHOT_PATH: f.snapshotPath,
    PUPU_FEATURE_MEMORY_V2: "shadow", PUPU_MEMORY_V2_MODE: "shadow" });
  assert.equal(built.status, 0);
  assert.equal(built.bundledFlags.enable_memory_v2, true);
  if (revision) assert.equal(built.bundledFlags.enable_theme_color_customization, true);
  const packaged = await packSnapshotFixture(f);
  assert.deepEqual(verifyFixtureReleaseSnapshot({ ...f, ...packaged }), { sha256: produced.sha256 });
  assert.equal(inspectResources(packaged).snapshot.sha256, `sha256:${produced.sha256}`);
  const snapshot = JSON.parse(fs.readFileSync(f.snapshotPath, "utf8"));
  assert.equal(snapshot._pupu_memory_v2_release.sidecar_environment.PUPU_MEMORY_V2_MODE, "all");
  // Repeat remains deterministic, and runtime bytes are untouched by verification.
  assert.equal(prepareFixtureReleaseSnapshot(f).sha256, produced.sha256);
  assert.deepEqual(verifyFixtureReleaseSnapshot({ ...f, ...packaged }), { sha256: produced.sha256 });
  asar.uncacheAll();
  fs.writeFileSync(path.join(f.sourceRoot, "build/build_feature_flags.json"), JSON.stringify({
    ...snapshot, unexpected_flag: true,
  }));
  const drifted = await packSnapshotFixture(f);
  assert.throws(() => verifyFixtureReleaseSnapshot({ ...f, ...drifted }), /differs from its release producer/);
  fs.appendFileSync(f.snapshotPath, " ");
  assert.throws(() => verifyFixtureReleaseSnapshot({ ...f, ...drifted }), /checksum mismatch/);
  asar.uncacheAll();
}

test("fixture snapshot real producer/build/ASAR/strict installed consumer reproduces and repairs omission", async (t) => {
  await exerciseSnapshotBoundary(t, null);
});

test("exact published 0.1.10 source preserves its v2 theme flag and active profile", async (t) => {
  // GitHub's shallow checkout does not contain old release objects; never fetch
  // or substitute current source to claim historical coverage there.
  const available = spawnSync("git", ["cat-file", "-e", `${oldReleaseCommit}^{commit}`], {
    cwd: snapshotTestRoot, encoding: "utf8",
  });
  if (available.status !== 0) return t.skip("exact historical source unavailable in shallow checkout");
  await exerciseSnapshotBoundary(t, oldReleaseCommit);
});

test("fixture profile selection fails closed on missing, dynamic, duplicate or escaping inputs", (t) => {
  const f = snapshotFixture(t);
  const workflowPath = path.join(f.sourceRoot, ".github/workflows/_shared-release-deterministic.yml");
  for (const argument of ["", "$PROFILE", "../outside.json", "/outside.json",
    `${f.profile} --profile ${f.profile}`]) {
    fs.writeFileSync(workflowPath, YAML.stringify({ jobs: { build: { steps: [{
      id: "build_feature_snapshot",
      run: `node scripts/write-build-feature-snapshot.cjs --profile ${argument}\n`,
    }] } } }));
    assert.throws(() => prepareFixtureReleaseSnapshot(f), /literal release snapshot profile|inside its source checkout/);
  }
});

test("old producer rejects unknown profile keys and unsupported schema before build", (t) => {
  const f = snapshotFixture(t);
  const profilePath = path.join(f.sourceRoot, f.profile);
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  for (const changed of [{ ...profile, unknown: true }, { ...profile, schema: "unknown.v99" }]) {
    fs.writeFileSync(profilePath, JSON.stringify(changed));
    assert.throws(() => prepareFixtureReleaseSnapshot(f), /N-1 snapshot producer failed/);
  }
});

test("workflow CLI prepares, verifies, and fails nonzero for missing packaged snapshot", async (t) => {
  const f = snapshotFixture(t);
  const cli = path.join(snapshotTestRoot, "scripts/release-qa/qualification-fixture-snapshot.mjs");
  const prepared = spawnSync(process.execPath, [cli, "prepare", "--source", f.sourceRoot,
    "--snapshot", f.snapshotPath], { encoding: "utf8" });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(runFixtureWebBuild(f, { PUPU_BUILD_FEATURE_SNAPSHOT_PATH: f.snapshotPath,
    PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT: "1" }).status, 0);
  const packaged = await packSnapshotFixture(f);
  const args = [cli, "verify", "--asar", packaged.asarPath, "--snapshot", f.snapshotPath];
  assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 0);
  fs.unlinkSync(path.join(f.sourceRoot, "build/build_feature_flags.json"));
  asar.uncacheAll();
  await packSnapshotFixture(f);
  assert.notEqual(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 0);
  asar.uncacheAll();
});

test("workflow wires required old snapshot and validates packaged bytes before and after signing", () => {
  const workflow = YAML.parse(fs.readFileSync(path.join(snapshotTestRoot,
    ".github/workflows/_shared-release-windows-restart-update.yml"), "utf8"));
  const steps = workflow.jobs["windows-restart-update"].steps;
  const prepare = steps.findIndex((s) => s.run?.includes("qualification-fixture-snapshot.mjs prepare"));
  const build = steps.findIndex((s) => s.id === "build_fixture");
  const sign = steps.findIndex((s) => s.id === "fixture_signing");
  const verifications = steps.flatMap((s, i) => s.run?.includes("qualification-fixture-snapshot.mjs verify") ? [i] : []);
  assert.ok(prepare >= 0 && prepare < build);
  assert.equal(steps[build].env.PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT, "1");
  assert.equal(steps[build].env.PUPU_BUILD_FEATURE_SNAPSHOT_PATH,
    ".release-qa/build-feature-snapshot/build_feature_flags.snapshot.json");
  assert.match(steps[prepare].run, /--source \.\.\/fixture-source/);
  assert.ok(steps[build].run.indexOf("--print-flags") < steps[build].run.indexOf("npm run build:unchain:win"));
  assert.equal(verifications.length, 2);
  assert.ok(build < verifications[0] && verifications[0] < sign && sign < verifications[1]);
  for (const i of [prepare, ...verifications]) assert.equal(steps[i]["continue-on-error"], undefined);
});
