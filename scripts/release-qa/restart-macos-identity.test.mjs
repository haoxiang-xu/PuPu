import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { buildRestartRuntimeLaunch } from "./run-restart-update-qualification.mjs";
import { matchesMacRestartImage, preflightMacRestartProfile, inspectMacRestartProfile } from "./macos-restart-identity.mjs";

const source = fs.readFileSync(new URL("./run-restart-update-qualification.mjs", import.meta.url), "utf8");
const declaration = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
// Minimized process evidence from both architectures in run 35403504906.
const app = "/var/folders/qa/installed-n-minus-one/installed/PuPu.app";
const executable = `${app}/Contents/MacOS/PuPu`;
const sidecar = `${app}/Contents/Resources/unchain_runtime/dist/macos/unchain-server`;
const installed = { executablePath: executable, candidateNeedle: app, sidecarNeedle: sidecar };
const canonical = (value) => value.startsWith("/var/") ? `/private${value}` : value;
const shipit = { pid: 53095, ppid: 1, command: `${app}/Contents/Frameworks/Squirrel.framework/Resources/ShipIt com.red.pupu.ShipIt /Users/runner/Library/Caches/com.red.pupu.ShipIt/ShipItState.plist` };
const root = { pid: 53163, ppid: 1, command: canonical(executable) };
const server = { pid: 53246, ppid: root.pid, command: canonical(sidecar) };

function replay(tables, extras = {}) {
  let index = 0;
  const sandbox = {
    fs: { realpathSync: { native: canonical } }, path,
    process: { platform: "darwin" }, RESTART_UPDATE_TIMEOUTS: { relaunch: 1, sidecar: 1 },
    readProcessTable: () => tables[Math.min(index++, tables.length - 1)],
    matchesMacRestartImage: (row, expected) => matchesMacRestartImage(row, expected, canonical),
    waitFor: async (predicate) => {
      for (let attempt = 0; attempt < tables.length; attempt++) { const found = await predicate(); if (found) return found; }
      throw new Error("test polling exhausted");
    },
    ...extras,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    declaration("const normalizePath =", "const hashFile ="),
    declaration("const descendantPids =", "const processAlive ="),
    declaration("const findRelaunchedRoot =", "export const assertFeedRequests ="),
    "this.find = findRelaunchedRoot; this.sidecar = assertRelaunchedSidecar;",
  ].join("\n"), sandbox);
  return sandbox;
}

test("macOS replay must wait past ShipIt for the actual relaunched app", async () => {
  const f = replay([[shipit], [root, server]]);
  assert.equal((await f.find({ installed, oldPid: 52270 })).pid, root.pid);
  await f.sidecar({ installed, rootPid: root.pid });
});

test("macOS updater helper alone is not an application relaunch", async () => {
  await assert.rejects(replay([[shipit]]).find({ installed, oldPid: 52270 }), /polling exhausted/);
});

test("macOS restart uses the same native profile as argument-free Squirrel relaunch", () => {
  const launch = buildRestartRuntimeLaunch({ platform: "darwin", tempRoot: "/qa", debugPort: 38193, macosHome: "/Users/runner" });
  assert.equal(launch.userData, "/Users/runner/Library/Application Support/PuPu");
  assert.deepEqual(launch.environment, { HOME: "/Users/runner" });
  assert.deepEqual(launch.args, ["--remote-debugging-port=38193"]);
});

test("x64 failure replay also ignores ShipIt and admits only the real root and its Sidecar", async () => {
  const xroot = { ...root, pid: 96609 };
  const xserver = { ...server, pid: 96777, ppid: xroot.pid };
  const f = replay([[{ ...shipit, pid: 95291 }], [xroot, xserver]]);
  assert.equal((await f.find({ installed, oldPid: 92867 })).pid, xroot.pid);
  await f.sidecar({ installed, rootPid: xroot.pid });
});

test("macOS rejects old roots, argument references, sibling images and unrelated Sidecars", async () => {
  for (const row of [
    { ...root, pid: 52270 }, server, shipit,
    { ...root, command: `/bin/echo ${executable}` },
    { ...root, command: `${executable}-other` },
    { ...root, command: `${app}/Contents/Frameworks/PuPu Helper.app/Contents/MacOS/PuPu Helper` },
  ]) await assert.rejects(replay([[row]]).find({ installed, oldPid: 52270 }), /polling exhausted/);
  await assert.rejects(replay([[root, { ...server, ppid: 8888 }]]).sidecar({ installed, rootPid: root.pid }), /polling exhausted/);
});

test("macOS image matching requires resolved filesystem identity and an exact image boundary", () => {
  assert.equal(matchesMacRestartImage(root, executable, () => { throw new Error("ENOENT"); }), false);
  assert.equal(matchesMacRestartImage(root, "relative", canonical), false);
  assert.equal(matchesMacRestartImage({ command: `"${executable}" --flag` }, executable, canonical), true);
  assert.equal(matchesMacRestartImage({ command: `${executable}/child` }, executable, canonical), false);
  assert.equal(matchesMacRestartImage({ command: executable }, canonical(executable), (value) => value), false);
});

const hosted = { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", HOME: "/wrong/temporary/home" };
const profile = "/Users/runner/Library/Application Support/PuPu";
const rendererImage = `${app}/Contents/Frameworks/PuPu Helper (Renderer).app/Contents/MacOS/PuPu Helper (Renderer)`;
const renderer = (directory = profile, extra = {}) => ({
  pid: 53180, ppid: root.pid,
  command: `${rendererImage} --type=renderer --user-data-dir=${directory} --lang=en-US`, ...extra,
});
const proof = (rows, extra = {}) => inspectMacRestartProfile({
  rows, rootPid: root.pid, executablePath: executable, userData: profile, realpath: canonical, ...extra,
});

test("macOS profile preflight refuses local and self-hosted execution before accessing home", () => {
  for (const environment of [{}, { ...hosted, GITHUB_ACTIONS: "false" }, { ...hosted, RUNNER_ENVIRONMENT: "self-hosted" }]) {
    assert.throws(() => preflightMacRestartProfile({ environment,
      nativeHome: () => assert.fail("must not inspect local home"),
    }), /disposable GitHub-hosted/);
  }
});

test("macOS profile preflight uses OS home and refuses existing or symlink profiles", () => {
  const args = { environment: hosted, nativeHome: () => "/Users/runner" };
  assert.equal(preflightMacRestartProfile({ ...args, lstat(location, options) {
    assert.equal(location, profile); assert.equal(options.throwIfNoEntry, false); return undefined;
  } }), "/Users/runner");
  for (const entry of [{ isDirectory: () => true }, { isSymbolicLink: () => true }]) {
    assert.throws(() => preflightMacRestartProfile({ ...args, lstat: () => entry }), /existing profile or symlink/);
  }
  assert.throws(() => preflightMacRestartProfile({ ...args, lstat: () => { throw new Error("EACCES"); } }), /EACCES/);
});

test("macOS profile proof handles spaces and verified aliases under the actual root", () => {
  for (const directory of [profile, `"${profile}"`, `'${profile}'`]) {
    assert.deepEqual(proof([root, renderer(directory)]), {
      root_pid: root.pid, renderer_pids: [53180], user_data: profile,
    });
  }
  assert.equal(proof([root, renderer("/var/folders/profile")], { userData: "/private/var/folders/profile" }).user_data,
    "/private/var/folders/profile");
});

test("macOS profile proof refuses missing, duplicate, conflicting and unresolvable profile arguments", () => {
  for (const command of [
    `${rendererImage} --type=renderer`,
    renderer("/qa/old-temporary-profile").command,
    `${renderer().command} --user-data-dir=${profile}`,
    `${rendererImage} --type=renderer --user-data-dir=relative`,
  ]) assert.throws(() => proof([root, renderer(profile, { command })]), /renderer profile does not match/);
  assert.throws(() => proof([root, renderer(), renderer("/wrong", { pid: 53181 })]), /renderer profile does not match/);
  assert.throws(() => proof([root, renderer()], { realpath: (value) => {
    if (value === profile) throw new Error("ENOENT"); return canonical(value);
  } }), /expected restart profile is unresolvable/);
});

test("macOS unrelated, missing or helper-spoofed renderers cannot prove a profile", () => {
  for (const rows of [[root], [shipit, renderer()], [root, renderer(profile, { ppid: 99999 })],
    [root, renderer(profile, { command: `/bin/echo ${renderer().command}` })]]) assert.equal(proof(rows), null);
});

// Execute the real orchestrator and process/profile gates, replacing only the
// artifact, UI, filesystem and OS boundaries. No PuPu or local model is started.
async function exerciseMacSequence({ targetId = "macos-arm64", beforeProfile = profile, afterProfile = profile } = {}) {
  let updated = false;
  let stopped = false;
  let evaluation = 0;
  let sentinelReads = 0;
  let diagnostics;
  const events = [];
  const oldPid = 52270;
  const session = { child: { pid: oldPid }, userData: profile, observedPids: new Set([oldPid]), browser: {},
    page: {
      async evaluate() {
        const responses = ["0.1.10", { ok: true }, { before: { stage: "idle" }, first: { started: true }, duplicate: { started: false } },
          ["checking", "downloading", "downloaded"], [{ started: true }, { started: false }]];
        if (evaluation === 4) { updated = true; events.push("native-restart"); }
        return responses[evaluation++];
      },
      async waitForFunction() {},
    },
  };
  const rows = () => stopped ? [] : updated
    ? [shipit, root, server, renderer(afterProfile)]
    : [{ ...root, pid: oldPid }, renderer(beforeProfile, { ppid: oldPid })];
  const artifact = { ...installed, identity: { asarPath: `${app}/Contents/Resources/app.asar` },
    close: async () => { stopped = true; events.push("shutdown"); }, cleanup() {},
  };
  const manifest = { manifest_digest: "retained-candidate", release: { tag: "v0.1.11", version: "0.1.11" } };
  const fixture = { from_tag: "v0.1.10", from_version: "0.1.10", installer: {}, signer: {} };
  const sandbox = replay([[]], {
    ROOT: "/repo", os: { tmpdir: () => "/qa" }, console: { error() {} },
    fs: { mkdtempSync: () => "/qa/temp", readFileSync: () => "fixture-config",
      statSync: () => ({ isFile: () => true }), rmSync() {}, realpathSync: { native: canonical } },
    readProcessTable: rows,
    inspectMacRestartProfile: (args) => inspectMacRestartProfile({ ...args, realpath: canonical }),
    waitFor: async (predicate) => { const result = await predicate(); if (!result) throw new Error("test gate remains pending"); return result; },
    validateRestartUpdateRuntimeInputs() {}, readReleaseArtifactContract: () => ({}), readJson: () => manifest,
    validateReleaseAssetManifest() {}, verifyReleaseAssetDirectory() {},
    validateRestartUpdateFixtureEvidence: () => fixture, targetPackage: () => ({ name: "candidate.dmg" }),
    createRestartObservationRecorder: () => ({ capture() {}, snapshots: [] }),
    preflightMacRestartProfile: () => "/Users/runner",
    installTargetPackage: async () => artifact, expectedIdentity: () => ({}),
    validateQualificationFixtureAppUpdate() {}, buildQualificationFeed() {},
    startQualificationFeedServer: async () => ({ url: "http://127.0.0.1:38193", feed: {}, requests: [], close() {} }),
    startFixtureRuntime: async () => session,
    hashFile: () => { sentinelReads++; return "unchanged-old-sentinel-bytes"; },
    validateRestartUpdateStageTrace() {}, processAlive: () => false, closeRestartBrowser: async () => {},
    assertUpdatedIdentity: () => { events.push("candidate-hashes"); return {}; },
    RESTART_UPDATE_QUALIFICATION_SCHEMA: "test-boundary", validateRestartUpdateQualificationReport: (report) => report,
    restartDiagnosticText: (value) => value, restartErrorDetails: (error) => error && ({ message: error.message }),
    restartUpdateProbeDetails: (probe) => probe, writeJson: (_location, value) => { diagnostics = value; },
    selectRestartCleanupPids: () => [], terminateProcesses: async () => {}, boundedRestartCleanup: (fn) => fn(),
  });
  // replay installs the real process/profile declarations; the feed boundary is
  // outside this identity regression and covered by its own contract tests.
  sandbox.assertFeedRequests = () => events.push("feed-verified");
  vm.runInContext(declaration("export async function runRestartUpdateQualification", "export const validateRestartUpdateRuntimeInputs =")
    .replace("export async", "async") + "\nthis.run = runRestartUpdateQualification;", sandbox);
  let report;
  let error;
  try { report = await sandbox.run({ candidateDir: "/candidate", fixturePath: "/fixture.dmg", fixtureEvidencePath: "/fixture.json",
    targetId, feedPort: 38193, diagnosticsPath: "/diagnostics.json" }); } catch (caught) { error = caught; }
  return { report, error, sentinelReads, events, diagnostics };
}

for (const targetId of ["macos-arm64", "macos-x64"]) {
  test(`${targetId} production sequence proves the same profile before accepting retained sentinel bytes`, async () => {
    const result = await exerciseMacSequence({ targetId });
    assert.equal(result.error, undefined);
    assert.equal(result.report.status, "passed");
    assert.equal(result.sentinelReads, 2);
    assert.deepEqual(result.events, ["native-restart", "candidate-hashes", "feed-verified", "shutdown"]);
  });
}

test("production sequence rejects a wrong initial profile before sentinel creation or download", async () => {
  const result = await exerciseMacSequence({ beforeProfile: "/qa/old-temporary-profile" });
  assert.match(result.error.message, /renderer profile does not match/);
  assert.equal(result.report, undefined);
  assert.equal(result.sentinelReads, 0);
  assert.deepEqual(result.events, []);
  assert.equal(result.diagnostics.stage, "fixture-profile-proof");
});

test("production sequence rejects profile drift even when old sentinel bytes remain unchanged", async () => {
  const result = await exerciseMacSequence({ afterProfile: "/qa/different-profile" });
  assert.match(result.error.message, /renderer profile does not match/);
  assert.equal(result.report, undefined);
  assert.equal(result.sentinelReads, 1, "must reject before re-reading the stale sentinel");
  assert.deepEqual(result.events, ["native-restart", "candidate-hashes"]);
  assert.equal(result.diagnostics.stage, "relaunched-profile-proof");
  assert.equal(result.diagnostics.macos_profiles.before.user_data, profile);
  assert.equal(result.diagnostics.macos_profiles.after, null);
});
