import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";

const executor = fs.readFileSync(new URL("./run-restart-update-qualification.mjs", import.meta.url), "utf8");
const installer = fs.readFileSync(new URL("./installed-package-qualification.mjs", import.meta.url), "utf8");

// Execute the complete production orchestrator and Windows adapter, not a
// reconstructed call sequence. Isolate OS installation, preflight, and process
// launch so this regression never starts PuPu or a local model on the host.
function declaration(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `production declaration missing: ${start}`);
  return source.slice(first, last).replace(/^export /, "");
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // Rejections can be scheduled before the second installation is reached.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function exercise(t) {
  const candidate = deferred();
  const fixture = deferred();
  t.after(() => { candidate.resolve(); fixture.resolve(); });
  const events = [];
  const completed = new Set();
  const runtimeBoundary = new Error("controlled stop at real-runtime boundary");
  const manifest = { assets: [{ target_id: "windows-x64", role: "installer", format: "exe", name: "candidate.exe" }] };
  const kind = (location) => location.includes("expected-n") ? "candidate" : "fixture";
  const sandbox = {
    ROOT: "/repo", path: path.posix, os: { tmpdir: () => "/tmp" },
    process: { platform: "win32", pid: 999, ppid: 998 },
    setTimeout, clearTimeout, console: { error() {} },
    fs: {
      mkdtempSync: () => "/tmp/restart-sequence",
      readFileSync(location) {
        assert.ok(completed.has("fixture"), "cannot inspect fixture before its installation resolves");
        assert.equal(location, "/tmp/restart-sequence/installed-n-minus-one/installed/resources/app-update.yml");
        events.push("validate:fixture");
        return "provider: generic\nurl: http://127.0.0.1:38193/\nupdaterCacheDirName: pupu-updater\n";
      },
      rmSync: () => events.push("cleanup"),
    },
    validateRestartUpdateRuntimeInputs: () => {},
    preflightRestartWindowsProfile: () => {},
    readReleaseArtifactContract: () => ({}),
    readJson: () => manifest,
    validateReleaseAssetManifest: () => {},
    verifyReleaseAssetDirectory: () => {},
    validateRestartUpdateFixtureEvidence: () => ({ from_version: "0.1.10" }),
    async runWindowsNsisInstaller(installerPath, installRoot) {
      const name = kind(installRoot);
      assert.equal(installerPath, name === "candidate" ? "/candidate/assets/candidate.exe" : "/fixture.exe");
      events.push(`install:${name}`);
      await (name === "candidate" ? candidate.promise : fixture.promise);
      completed.add(name);
      events.push(`installed:${name}`);
    },
    appRootFromAsar: (installRoot) => path.posix.join(installRoot, "resources"),
    inspectResources(options) {
      assert.deepEqual(Object.keys(options).sort(), ["executablePath", "resourceRoot", "sidecarPlatform"]);
      const name = kind(options.resourceRoot);
      assert.ok(completed.has(name), "identity inspection requires completed installation");
      assert.equal(options.sidecarPlatform, "windows");
      events.push(`inspect:${name}`);
      return {
        asarPath: path.posix.join(options.resourceRoot, "app.asar"),
        executablePath: options.executablePath,
        sidecarPath: path.posix.join(options.resourceRoot, "sidecar.exe"),
        hashes: { executable_sha256: "e", app_asar_sha256: "a", sidecar_sha256: "s", snapshot_sha256: "f" },
        snapshot: { fingerprint: "snapshot" },
      };
    },
    validateQualificationFixtureAppUpdate,
    buildQualificationFeed: () => events.push("feed"),
    startQualificationFeedServer: async () => ({ url: "http://127.0.0.1:38193", close: async () => {} }),
    startFixtureRuntime: async () => { events.push("runtime"); throw runtimeBoundary; },
    readProcessTable: () => [], descendantPids: () => [], terminateProcesses: async () => {},
    processAlive: () => false,
    waitFor: async (predicate) => assert.equal(await predicate(), true),
  };
  vm.createContext(sandbox);
  vm.runInContext([
    declaration(installer, "export const installWindowsNsis =", "const executableFromLinuxRoot ="),
    declaration(executor, "const normalizePath =", "const hashFile ="),
    declaration(executor, "const targetPackage =", "const connectRenderer ="),
    declaration(executor, "const expectedIdentity =", "const assertUpdatedIdentity ="),
    declaration(executor, "const restartDiagnosticText =", "export async function runRestartUpdateQualification"),
    declaration(executor, "export async function runRestartUpdateQualification", "export const validateRestartUpdateRuntimeInputs ="),
    "this.run = runRestartUpdateQualification;",
  ].join("\n"), sandbox);
  const outcome = sandbox.run({
    candidateDir: "/candidate", fixturePath: "/fixture.exe", fixtureEvidencePath: "/fixture.json",
    targetId: "windows-x64", feedPort: 38193,
  }).then(() => null, (error) => error);
  return { candidate, fixture, events, outcome, runtimeBoundary };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("real upgrade orchestrator awaits both delayed Windows installations before inspection or launch", async (t) => {
  const f = exercise(t);
  await settle();
  assert.deepEqual(f.events, ["install:candidate"]);
  f.candidate.resolve();
  await settle();
  assert.deepEqual(f.events, ["install:candidate", "installed:candidate", "inspect:candidate", "install:fixture"]);
  f.fixture.resolve();
  assert.equal(await f.outcome, f.runtimeBoundary);
  assert.deepEqual(f.events, [
    "install:candidate", "installed:candidate", "inspect:candidate", "install:fixture",
    "installed:fixture", "inspect:fixture", "validate:fixture", "feed", "runtime", "cleanup",
  ]);
});

test("candidate installation rejection retains its cause and cannot start fixture, feed, or runtime", async (t) => {
  const f = exercise(t);
  const failure = new Error("NSIS candidate exhausted retries: status=1");
  f.candidate.reject(failure);
  assert.equal(await f.outcome, failure);
  assert.deepEqual(f.events, ["install:candidate", "cleanup"]);
});

test("fixture installation rejection retains its cause and cannot read updater config or start runtime", async (t) => {
  const f = exercise(t);
  f.candidate.resolve();
  await settle();
  const failure = new Error("NSIS fixture exhausted retries: status=2");
  f.fixture.reject(failure);
  assert.equal(await f.outcome, failure);
  assert.deepEqual(f.events, ["install:candidate", "installed:candidate", "inspect:candidate", "install:fixture", "cleanup"]);
});

test("already-resolved asynchronous installer results are still awaited", async (t) => {
  const f = exercise(t);
  f.candidate.resolve();
  f.fixture.resolve();
  assert.equal(await f.outcome, f.runtimeBoundary);
  assert.equal(f.events.filter((event) => event === "runtime").length, 1);
  assert.equal(f.events.at(-1), "cleanup");
});
