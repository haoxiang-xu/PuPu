import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { validateRestartUpdateQualificationReport } from "./restart-update-qualification.mjs";
import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";
import { expectedTargetAssets, readReleaseArtifactContract } from "./release-artifact-manifest.mjs";
import { createRestartObservationRecorder } from "./restart-observations.mjs";

const artifactContract = readReleaseArtifactContract(fileURLToPath(new URL("../../docs/contracts/release/release-artifact-contract.v1.json", import.meta.url)));
const updateServiceUrl = new URL("../../electron/main/services/update/service.js", import.meta.url);
const updateServiceSource = fs.readFileSync(updateServiceUrl, "utf8");

const runnerSource = fs.readFileSync(new URL("./run-restart-update-qualification.mjs", import.meta.url), "utf8");
const moduleBodyFor = (source) => source
  .slice(0, source.indexOf("const modulePath = fileURLToPath(import.meta.url);"))
  .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
  .replace(/^export /gm, "")
  .replaceAll("import.meta.dirname", '"/repo/scripts/release-qa"')
  .replace('await import("playwright")', "await loadPlaywright()");

// Execute the complete production runner, including its private startup and
// cleanup functions. Only host boundaries are stubbed: no PuPu, NSIS, shell,
// network, filesystem writes, browser, or model is launched by these tests.
function lifecycleHarness(options = {}) {
  const events = [];
  const writes = new Map();
  const stages = [];
  const readPaths = [];
  const removedPaths = [];
  const createdPaths = [];
  const launches = [];
  const installations = [];
  const timeoutOptions = {};
  const preferences = new Map();
  const nativeAppData = "C:\\Users\\runneradmin\\AppData\\Roaming";
  const nativeProfile = path.win32.join(nativeAppData, "PuPu");
  const nativeSentinel = path.win32.join(nativeProfile, "auto_update_pref.json");
  const alive = new Set();
  const killed = new Set();
  const child = new EventEmitter();
  Object.assign(child, { pid: 101, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() });
  const fixtureRoot = "/qa/temp/installed-n-minus-one/installed";
  const executable = `${fixtureRoot}/PuPu.exe`;
  const sidecar = `${fixtureRoot}/resources/sidecar.exe`;
  let clock = 0;
  let downloadCount = 0;
  let installCount = 0;
  let relaunched = false;
  let closing = false;
  let failureOccurred = false;
  let browserClosed = 0;
  let browserConnected = true;
  let stageListener;
  let startupTimer;
  let networkChecks = 0;
  const timers = new Map();
  let nextTimer = 1;
  let timerPumpPending = false;
  const pumpTimers = () => {
    if (timerPumpPending || timers.size === 0) return;
    timerPumpPending = true;
    setImmediate(() => {
      timerPumpPending = false;
      const next = [...timers.entries()].sort((left, right) => left[1].due - right[1].due)[0];
      if (!next) return;
      timers.delete(next[0]); clock = next[1].due; next[1].callback();
      pumpTimers();
    });
  };
  const digest = (character) => `sha256:${character.repeat(64)}`;
  const payloadSha512 = crypto.createHash("sha512").update("candidate fixture").digest("base64");
  const hashes = { executable_sha256: digest("e"), app_asar_sha256: digest("a"), sidecar_sha256: digest("0"), snapshot_sha256: digest("f") };
  const identity = {
    asarPath: `${fixtureRoot}/resources/app.asar`, executablePath: executable,
    sidecarPath: sidecar, hashes, snapshot: { fingerprint: "3".repeat(64) },
  };
  const manifest = {
    manifest_digest: `sha256:${"a".repeat(64)}`,
    release: { tag: "v0.1.11", version: "0.1.11", commit: "1".repeat(40) },
    assets: [
      { target_id: "windows-x64", role: "installer", format: "exe", name: "candidate.exe", sha256: digest("b") },
      { target_id: "windows-x64", role: "updater-blockmap", format: "blockmap", name: "candidate.exe.blockmap", sha256: digest("c") },
    ],
    updater_metadata: [{ name: "latest.yml", sha256: digest("d"), target_ids: ["windows-x64"], references: [{ name: "candidate.exe", sha512: payloadSha512 }] }],
  };
  const fixture = {
    from_tag: "v0.1.10", from_version: "0.1.10", from_commit: "2".repeat(40),
    installer: { sha256: digest("e") }, signer: { subject: "CN=PuPu Test", thumbprint: "ABCDEF0123456789ABCDEF0123456789ABCDEF01" }, allowed_differences: ["app-update.yml"],
  };
  const feed = {
    schema: "pupu.qualification-feed.v1",
    metadata: { name: "latest.yml", sha256: digest("d") },
    payload: { name: "candidate.exe", sha256: digest(options.feedPayloadMismatch ? "9" : "b"), sha512: payloadSha512 },
    blockmap: { name: "candidate.exe.blockmap", sha256: digest("c") },
  };
  const server = {
    url: "http://127.0.0.1:38193", feed, requests: [],
    async close() { events.push("server:close"); if (options.serverCloseFailure) throw options.serverCloseFailure; },
  };
  const page = {
    url: () => "file:///installed/index.html",
    async waitForLoadState(_state, settings) {
      timeoutOptions.rendererLoad = settings.timeout;
      events.push("renderer:load");
      if (options.slowStartup && startupTimer) { events.push("startup:timer"); startupTimer(); }
      if (options.rendererFailure) { failureOccurred = true; throw options.rendererFailure; }
    },
    async evaluate(callback) { return callback(); },
    async waitForFunction(callback, _argument, settings) {
      timeoutOptions.download = settings.timeout;
      if (options.downloadTimeout) throw new Error("download deadline exceeded");
      assert.equal(callback(), true, "updater should have produced downloaded state");
    },
  };
  const browser = {
    isConnected: () => options.invalidConnectionState ? "false" : browserConnected,
    contexts: () => [{ pages: () => [page] }],
    async close() {
      browserClosed += 1; closing = true; events.push("browser:close");
      if (options.browserCloseError) throw options.browserCloseError;
      if (options.browserCloseFirstHang && browserClosed === 1) await new Promise(() => {});
      if (options.browserCloseHang) await new Promise(() => {});
      if (!options.browserCloseStillConnected) browserConnected = false;
    },
  };
  const installed = {
    identity, executablePath: executable, launchCwd: fixtureRoot,
    sidecarNeedle: sidecar, candidateNeedle: fixtureRoot,
    close(pid) { events.push(`app:close:${pid}`); alive.delete(pid); alive.delete(202); },
    cleanup() { events.push("installed:cleanup"); },
  };
  const rows = () => [
    ...(options.extraProcessRows || []),
    ...(alive.has(101) ? [{ ProcessId: 101, ParentProcessId: 999, CommandLine: executable }] : []),
    ...(alive.has(102) && !options.sidecarMissing ? [{ ProcessId: 102, ParentProcessId: 101, CommandLine: sidecar }] : []),
    ...(alive.has(201) ? [{ ProcessId: 201, ParentProcessId: 999, CommandLine: executable }] : []),
    ...(alive.has(202) ? [{ ProcessId: 202, ParentProcessId: 201, CommandLine: sidecar }] : []),
    { ProcessId: 777, ParentProcessId: 999, CommandLine: "C:/unrelated/PuPu.exe" },
  ];
  const sandbox = {
    createRestartObservationRecorder,
    collectWindowsUpgradeObservations: () => {
      events.push("windows:observe");
      if (options.observationFailure) throw options.observationFailure;
      return { available: true, windows: [{ title: "PuPu installer diagnostic fixture" }] };
    },
    assert, crypto, path, Buffer, URL, Set, Error, AggregateError,
    os: { tmpdir: () => "/qa" },
    Date: class extends Date { static now() { return clock; } },
    setTimeout(callback, milliseconds) {
      const handle = nextTimer++;
      timers.set(handle, { callback, due: clock + milliseconds }); pumpTimers();
      return handle;
    },
    clearTimeout(handle) { timers.delete(handle); },
    console: { log: (...args) => events.push(`log:${args.join(" ")}`), warn: (...args) => events.push(`warn:${args.join(" ")}`), error: (...args) => events.push(`error:${args.join(" ")}`) },
    process: {
      platform: "win32", pid: 999,
      env: {
        GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted",
        APPDATA: "C:\\not-electron-native\\Roaming", LOCALAPPDATA: "C:\\not-electron-native\\Local",
        ...options.environment,
      },
      kill(pid) { if (!alive.has(pid)) throw new Error("no such process"); },
    },
    fs: {
      mkdirSync(location) {
        createdPaths.push(location);
        if (options.profileAppearsBeforeSeed && path.win32.normalize(location) === nativeProfile) throw new Error("EEXIST raced profile");
      }, mkdtempSync: () => "/qa/temp",
      existsSync(location) {
        assert.equal(path.win32.normalize(location), nativeProfile);
        return Boolean(options.existingProfile);
      },
      readFileSync(location) {
        readPaths.push(location);
        if (String(location).endsWith("app-update.yml")) return "provider: generic\nurl: http://127.0.0.1:38193/\nupdaterCacheDirName: pupu-updater\n";
        if (String(location).endsWith("auto_update_pref.json")) {
          if (options.requireNativeSentinel) assert.equal(path.win32.normalize(location), nativeSentinel);
          return Buffer.from(preferences.get(path.win32.normalize(location)) || "sentinel");
        }
        throw new Error(`unexpected read: ${location}`);
      },
      statSync: () => ({ isFile: () => true }),
      writeFileSync(location, contents, writeOptions) {
        assert.equal(path.win32.normalize(location), nativeSentinel);
        events.push("preference:write");
        if (options.preferenceWriteFailure) throw options.preferenceWriteFailure;
        if (writeOptions?.flag === "wx" && preferences.has(nativeSentinel)) throw new Error("EEXIST preference");
        preferences.set(nativeSentinel, contents);
      },
      rmSync(location) { removedPaths.push(location); events.push("temp:remove"); if (options.removeFailure) throw options.removeFailure; },
    },
    spawn(command, args, launchOptions) {
      assert.equal(command, executable);
      launches.push({ command, args, options: launchOptions });
      events.push("app:spawn"); alive.add(101); alive.add(102);
      queueMicrotask(() => {
        for (const chunk of options.outputChunks || ["fixture stdout evidence\n"]) child.stdout.emit("data", Buffer.from(chunk));
        child.stderr.emit("data", Buffer.from("fixture stderr evidence\n"));
        if (options.spawnFailure) child.emit("error", options.spawnFailure);
      });
      return child;
    },
    spawnSync(command, args) {
      if (command === "powershell") {
        if (args.some((argument) => argument.includes("GetFolderPath"))) {
          events.push("profile:resolve");
          assert.ok(args.some((argument) => argument.includes("ApplicationData")));
          return { status: 0, stdout: nativeAppData };
        }
        events.push("process:enumerate");
        if ((closing || failureOccurred) && options.enumerationFailure) return { status: 1, stderr: options.enumerationFailure.message };
        return { status: 0, stdout: JSON.stringify(rows()) };
      }
      if (command === "taskkill") {
        const pid = Number(args[args.indexOf("/pid") + 1]);
        assert.notEqual(pid, 777, "must never terminate unrelated PuPu");
        events.push(`process:kill:${pid}`); killed.add(pid);
        if (options.killFailure) throw options.killFailure;
        if (options.killResult) return options.killResult;
        alive.delete(pid);
        if (pid === 101) alive.delete(102);
        if (pid === 201) alive.delete(202);
        return { status: 0, stdout: "terminated" };
      }
      throw new Error(`unexpected native command: ${command}`);
    },
    net: {
      createServer: () => ({ once() {}, listen(_port, _host, ready) { ready(); }, address: () => ({ port: 39000 }), close(done) { done(); } }),
    },
    fetch: async () => {
      if (options.spawnFailure) throw new Error("CDP server unavailable");
      return { ok: true, json: async () => [{ type: "page", url: page.url() }] };
    },
    loadPlaywright: async () => ({ chromium: { connectOverCDP: async (_endpoint, settings) => {
      timeoutOptions.cdp = settings.timeout;
      events.push("browser:connect"); return browser;
    } } }),
    document: { getElementById: () => ({}) }, location: { protocol: "file:" },
    window: {
      appUpdateAPI: {
        getState: async () => ({ currentVersion: "0.1.10", stage: options.initialStage || "idle", message: options.stateMessage }),
        onStateChange(listener) { stageListener = listener; return () => {}; },
        setAutoUpdate: async () => { preferences.set(nativeSentinel, JSON.stringify({ enabled: false })); return { ok: true }; },
        checkAndDownload: async () => {
          downloadCount += 1;
          if (downloadCount === 1) {
            for (const stage of ["checking", "downloading", "downloaded"]) stageListener({ stage });
            server.requests.push({ method: "GET", pathname: "/latest.yml", status: 200 }, ...(options.extraFeedRequests || []), { method: "GET", pathname: "/candidate.exe", status: 200 });
          }
          if (options.downloadError) throw options.downloadError;
          if (options.downloadResults) return options.downloadResults[downloadCount - 1];
          return { started: downloadCount === 1 };
        },
        installNow: async () => {
          installCount += 1;
          if (installCount === 1) {
            alive.delete(101); alive.delete(102); alive.add(201); alive.add(202); relaunched = true;
            if (options.oldProcessStuck) alive.add(101);
            if (options.relaunchMissing) { alive.delete(201); alive.delete(202); }
            child.exitCode = 0;
            if (options.browserDisconnectsOnExit) browserConnected = false;
          }
          return { started: installCount === 1 };
        },
      },
    },
    installWindowsNsis: async (parameters) => {
      installations.push(parameters);
      events.push("installer:run");
      return installed;
    },
    installMacDmg() { throw new Error("unexpected macOS installer"); },
    inspectResources() { if (relaunched && options.identityFailure) throw options.identityFailure; return identity; },
    readReleaseArtifactContract: () => artifactContract, expectedTargetAssets, readJson: () => manifest,
    validateReleaseAssetManifest() {}, verifyReleaseAssetDirectory() {},
    validateRestartUpdateFixtureEvidence: () => fixture,
    validateQualificationFixtureAppUpdate,
    buildQualificationFeed() {}, startQualificationFeedServer: async () => server,
    buildQualificationFeedServerLog: () => ({ requests: [...server.requests] }),
    validateRestartUpdateQualificationReport,
    RESTART_UPDATE_QUALIFICATION_SCHEMA: "pupu.restart-update-qualification.v1",
    RESTART_UPDATE_TARGET_IDS: ["windows-x64"],
    writeJson(location, value) {
      events.push(`write:${path.basename(location)}`);
      if (options.writeFailure) throw options.writeFailure;
      writes.set(location, JSON.parse(JSON.stringify(value)));
    },
  };
  if (options.realUpdater) {
    // Exercise the real product service and its startup callback, not a fake
    // admission guard. Only Electron, OS storage, timer and network are faked.
    const updater = new EventEmitter();
    updater.checkForUpdates = async () => {
      networkChecks += 1;
      updater.emit("checking-for-update");
      updater.emit("update-available", { version: "0.1.11" });
      updater.emit("update-downloaded", { version: "0.1.11" });
      server.requests.push({ method: "GET", pathname: "/latest.yml", status: 200 }, { method: "GET", pathname: "/candidate.exe", status: 200 });
      return {};
    };
    updater.quitAndInstall = sandbox.window.appUpdateAPI.installNow;
    const productModule = { exports: {} };
    vm.runInNewContext(updateServiceSource, {
      module: productModule, require: createRequire(updateServiceUrl), process: { platform: "win32" },
      console: sandbox.console,
      setTimeout(callback, delay) { assert.equal(delay, 8000); startupTimer = callback; },
    });
    const product = productModule.exports.createUpdateService({
      app: { isPackaged: true, getVersion: () => "0.1.10", getPath: () => nativeProfile },
      fs: sandbox.fs, path: path.win32, autoUpdater: updater,
      webContents: { getAllWebContents: () => [{ isDestroyed: () => false, send: (_channel, state) => stageListener?.(state) }] },
    });
    product.scheduleStartupAutoUpdateCheck();
    Object.assign(sandbox.window.appUpdateAPI, {
      getState: async () => product.getAppUpdateStatePayload(),
      setAutoUpdate: async (enabled) => {
        const result = product.setAutoUpdateEnabled(enabled);
        if (!options.slowStartup) { events.push("startup:timer"); startupTimer(); }
        return result;
      },
      checkAndDownload: () => product.checkAndDownloadAppUpdate(),
      installNow: () => product.installDownloadedAppUpdate(),
    });
  }
  vm.createContext(sandbox);
  vm.runInContext(`${moduleBodyFor(options.runnerSource || runnerSource)}\nthis.run = runRestartUpdateQualification; this.start = startFixtureRuntime; this.selectPids = typeof selectRestartCleanupPids === "function" ? selectRestartCleanupPids : undefined;`, sandbox);
  const run = () => sandbox.run({
    candidateDir: "/candidate", fixturePath: "/fixture.exe", fixtureEvidencePath: "/fixture.json",
    targetId: "windows-x64", feedPort: 38193,
    serverLogPath: "/evidence/feed.json", diagnosticsPath: "/evidence/failure.json",
  });
  const start = (onAcquired) => sandbox.start({ installed, tempRoot: "/qa/temp/installed-n-minus-one", onAcquired, onStage: (stage) => stages.push(stage) });
  return {
    run, start, events, writes, alive, killed, child, browser, stages, sandbox,
    readPaths, removedPaths, createdPaths, launches, installations, nativeAppData, nativeProfile, nativeSentinel,
    preferences, get networkChecks() { return networkChecks; },
    timeoutOptions, get elapsedMs() { return clock; },
    get browserClosed() { return browserClosed; },
  };
}

test("actual startup exposes process ownership before renderer readiness rejects", async () => {
  const primary = new Error("renderer DOM failed");
  const f = lifecycleHarness({ rendererFailure: primary });
  let acquired;
  await assert.rejects(f.start((runtime) => { acquired = runtime; }), (error) => error === primary);
  assert.equal(acquired.child, f.child);
  assert.equal(acquired.browser, f.browser, "CDP connection must be owned before its readiness probe fails");
  assert.ok(acquired.observedPids.has(101));
});

for (const environment of [
  { GITHUB_ACTIONS: undefined, RUNNER_ENVIRONMENT: undefined },
  { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted" },
]) {
  test(`Windows native-profile qualification refuses ${environment.RUNNER_ENVIRONMENT || "non-Actions"} execution before any installer or app`, async () => {
    const f = lifecycleHarness({ environment });
    await assert.rejects(f.run(), /github.hosted|disposable|GitHub.Actions/i);
    assert.equal(f.installations.length, 0, "unsafe hosts must be rejected before either NSIS installer runs");
    assert.equal(f.launches.length, 0);
    assert.equal(f.events.includes("profile:resolve"), false);
    assert.ok(f.removedPaths.every((location) => location === "/qa/temp"));
    assert.ok(f.createdPaths.every((location) => !path.win32.normalize(location).startsWith(f.nativeProfile)));
    assert.equal(f.writes.get("/evidence/failure.json").stage, "fixture-profile");
  });
}

test("pre-existing native PuPu profile is refused before either installer without altering or deleting that profile", async () => {
  const f = lifecycleHarness({ existingProfile: true });
  await assert.rejects(f.run(), /existing|exists|clean|profile/i);
  assert.equal(f.installations.length, 0, "existing profiles must be rejected before either NSIS installer runs");
  assert.equal(f.launches.length, 0);
  assert.equal(f.events.includes("profile:resolve"), true);
  assert.ok(f.createdPaths.every((location) => !path.win32.normalize(location).startsWith(f.nativeProfile)));
  assert.ok(f.removedPaths.every((location) => location === "/qa/temp"));
  assert.equal(f.writes.get("/evidence/failure.json").stage, "fixture-profile");
});

test("Windows sentinel follows native ApplicationData despite a different inherited APPDATA value", async () => {
  const f = lifecycleHarness({ requireNativeSentinel: true });
  const result = await f.run();
  assert.equal(result.status, "passed");
  assert.equal(f.installations.length, 2);
  assert.equal(f.installations[0].installerPath, "/candidate/assets/candidate.exe");
  assert.equal(f.installations[1].installerPath, "/fixture.exe");
  assert.equal(f.events.filter((event) => event === "profile:resolve").length, 2);
  assert.ok(f.events.indexOf("profile:resolve") < f.events.indexOf("installer:run"));
  const sentinelReads = f.readPaths.filter((location) => location.endsWith("auto_update_pref.json"));
  assert.deepEqual(sentinelReads.map((location) => path.win32.normalize(location)), [f.nativeSentinel, f.nativeSentinel]);
  assert.equal(f.launches.length, 1);
  const launch = f.launches[0];
  assert.equal(launch.options.env.APPDATA, "C:\\not-electron-native\\Roaming");
  assert.equal(launch.options.env.LOCALAPPDATA, "C:\\not-electron-native\\Local");
  assert.equal(launch.args.some((argument) => argument.startsWith("--user-data-dir")), false);
  assert.ok(f.removedPaths.every((location) => location === "/qa/temp"));
});

test("actual startup retains acquired session when sidecar readiness times out", async () => {
  const f = lifecycleHarness({ sidecarMissing: true });
  let acquired;
  await assert.rejects(f.start((runtime) => { acquired = runtime; }), /Sidecar descendant.*timed out/);
  assert.equal(acquired.child, f.child);
  assert.equal(acquired.browser, f.browser);
});

test("spawn error is handled and reported with phase and cleanup instead of becoming an uncaught process error", async () => {
  const f = lifecycleHarness({ spawnFailure: Object.assign(new Error("spawn fixture ENOENT"), { code: "ENOENT" }) });
  await assert.rejects(f.run(), /spawn fixture ENOENT/);
  assert.ok(f.killed.has(101));
  const diagnostic = f.writes.get("/evidence/failure.json");
  assert.equal(diagnostic.stage, "fixture-renderer-readiness");
  assert.match(diagnostic.primary_error.message, /spawn fixture ENOENT/);
});

test("renderer failure closes its acquired browser, terminates children, and persists the primary cause despite EBUSY", async () => {
  const primary = new Error("renderer DOM failed before update");
  const cleanup = Object.assign(new Error("installed folder busy"), { code: "EBUSY" });
  const f = lifecycleHarness({ rendererFailure: primary, removeFailure: cleanup });
  await assert.rejects(f.run(), (error) => error === primary);
  assert.ok(f.browserClosed >= 1);
  assert.ok(f.killed.has(101));
  assert.equal(f.alive.size, 0);
  assert.ok(f.events.includes("server:close"));
  const diagnostic = JSON.stringify(f.writes.get("/evidence/failure.json"));
  assert.match(diagnostic, /renderer DOM failed before update/);
  assert.match(diagnostic, /installed folder busy|EBUSY/);
  assert.match(diagnostic, /fixture stdout evidence/);
  assert.deepEqual(f.writes.get("/evidence/feed.json").requests, []);
  const document = f.writes.get("/evidence/failure.json");
  assert.equal(document.schema, "pupu.restart-update-diagnostics.v1");
  assert.equal(document.target_id, "windows-x64");
  assert.deepEqual(document.candidate, { tag: "v0.1.11", commit: "1".repeat(40), manifest_digest: `sha256:${"a".repeat(64)}` });
  assert.deepEqual(document.fixture, { tag: "v0.1.10", commit: "2".repeat(40) });
});

test("failure diagnostics bound captured output and redact credential-like values from output and primary error", async () => {
  const primary = new Error("renderer failed token=error-token-value");
  const f = lifecycleHarness({
    rendererFailure: primary,
    outputChunks: [
      "discarded-first-chunk-marker\n",
      ...Array.from({ length: 12 }, (_, index) => `output-${index}: ${"x".repeat(20_000)}\n`),
      "Bearer bearer-value password=password-value secret=secret-value api_key=api-value token=token-value\n",
    ],
  });
  await assert.rejects(f.run(), (error) => error === primary);
  const document = f.writes.get("/evidence/failure.json");
  assert.ok(document.runtime.output_tail.length <= 16_384);
  assert.doesNotMatch(document.runtime.output_tail, /discarded-first-chunk-marker/);
  assert.match(document.runtime.output_tail, /\[REDACTED\]/);
  const serialized = JSON.stringify(document);
  for (const secret of ["bearer-value", "password-value", "secret-value", "api-value", "token-value", "error-token-value"]) {
    assert.equal(serialized.includes(secret), false, `diagnostic leaked ${secret}`);
  }
  assert.ok(document.processes.every((row) => row.pid !== 777), "unrelated process details must not be captured");
});

test("process-enumeration failure during cleanup cannot replace startup failure or prevent owned PID termination", async () => {
  const primary = new Error("renderer probe failed");
  const f = lifecycleHarness({ rendererFailure: primary, enumerationFailure: new Error("process enumeration unavailable") });
  await assert.rejects(f.run(), (error) => error === primary);
  assert.ok(f.killed.has(101));
  assert.ok(f.events.includes("server:close"));
  assert.ok(f.events.includes("temp:remove"));
  assert.match(JSON.stringify(f.writes.get("/evidence/failure.json")), /process enumeration unavailable/);
  assert.ok(f.writes.get("/evidence/failure.json").cleanup_errors.some((entry) => entry.step === "capture-processes"));
});

test("termination failure is secondary and cannot prevent feed closure, evidence, or temp cleanup", async () => {
  const primary = new Error("renderer probe failed");
  const f = lifecycleHarness({ rendererFailure: primary, killFailure: new Error("taskkill unavailable") });
  await assert.rejects(f.run(), (error) => error === primary);
  assert.ok(f.events.includes("server:close"));
  assert.ok(f.events.includes("temp:remove"));
  assert.match(JSON.stringify(f.writes.get("/evidence/failure.json")), /taskkill unavailable/);
});

for (const nativeFailure of [
  { label: "nonzero status", result: { status: 1, stderr: "access denied by taskkill" }, detail: /access denied by taskkill|taskkill.*1/ },
  { label: "spawn error", result: { status: null, error: Object.assign(new Error("taskkill executable missing"), { code: "ENOENT" }) }, detail: /taskkill executable missing|ENOENT/ },
]) {
  test(`real taskkill ${nativeFailure.label} is captured as a cleanup failure while the primary error survives`, async () => {
    const primary = new Error("original renderer failure");
    const f = lifecycleHarness({ rendererFailure: primary, killResult: nativeFailure.result });
    await assert.rejects(f.run(), (error) => error === primary);
    assert.ok(f.events.includes("server:close"));
    assert.ok(f.events.includes("temp:remove"));
    assert.match(JSON.stringify(f.writes.get("/evidence/failure.json")), nativeFailure.detail);
  });
}

test("cleanup selection excludes current and parent PIDs, unrelated PuPu and installation-path-prefix siblings", () => {
  const f = lifecycleHarness();
  f.sandbox.process.ppid = 998;
  const root = "C:/qa/installed";
  const rows = [
    { pid: 101, ppid: 999, command: `${root}/PuPu.exe` },
    { pid: 102, ppid: 101, command: "C:/sidecar.exe" },
    { pid: 201, ppid: 998, command: `${root}/PuPu.exe` },
    { pid: 777, ppid: 998, command: "C:/unrelated/PuPu.exe" },
    { pid: 888, ppid: 998, command: `${root}-neighbor/PuPu.exe` },
    { pid: 999, ppid: 998, command: `${root}/runner.exe` },
    { pid: 998, ppid: 1, command: `${root}/runner-parent.exe` },
  ];
  const actual = f.sandbox.selectPids({ rows, runtime: { child: { pid: 101 }, observedPids: new Set([101]) }, installedFixture: { launchCwd: root } });
  assert.deepEqual([...actual].sort(), [101, 102, 201]);
});

test("diagnostic and feed-log write failures preserve the original error and cannot skip resource cleanup", async () => {
  const primary = new Error("original renderer failure");
  const f = lifecycleHarness({ rendererFailure: primary, writeFailure: new Error("evidence disk unavailable") });
  await assert.rejects(f.run(), (error) => error === primary);
  assert.ok(f.events.includes("server:close"));
  assert.ok(f.events.includes("temp:remove"));
  assert.ok(f.killed.has(101));
  assert.ok(f.events.some((event) => event.includes("original renderer failure")));
  assert.ok(f.events.some((event) => event.includes("evidence disk unavailable")));
});

test("hanging browser cleanup is bounded and server-close failure cannot prevent process and directory cleanup", async () => {
  const primary = new Error("original renderer failure");
  const f = lifecycleHarness({ rendererFailure: primary, browserCloseHang: true, serverCloseFailure: new Error("feed close rejected") });
  await assert.rejects(f.run(), (error) => error === primary);
  assert.ok(f.killed.has(101));
  assert.ok(f.events.includes("temp:remove"));
  const diagnostic = JSON.stringify(f.writes.get("/evidence/failure.json"));
  assert.match(diagnostic, /browser-close cleanup timed out/);
  assert.match(diagnostic, /feed close rejected/);
});

test("failure after N relaunch terminates the newly owned process and does not touch unrelated PuPu", async () => {
  const primary = new Error("restarted candidate identity mismatch");
  const f = lifecycleHarness({ identityFailure: primary });
  await assert.rejects(f.run(), (error) => error === primary);
  assert.ok(f.killed.has(201), "N relaunch PID must be registered before identity validation");
  assert.equal(f.alive.size, 0);
  assert.equal(f.killed.has(777), false);
});

test("otherwise successful upgrade still fails closed when final directory cleanup fails", async () => {
  const f = lifecycleHarness({ removeFailure: Object.assign(new Error("permanent cleanup failure"), { code: "EBUSY" }) });
  await assert.rejects(f.run(), /cleanup|permanent cleanup failure/i);
  assert.match(JSON.stringify(f.writes.get("/evidence/failure.json")), /permanent cleanup failure/);
});

test("real successful lifecycle remains accepted with strict update checks", async () => {
  const f = lifecycleHarness();
  const result = await f.run();
  assert.equal(result.status, "passed");
  assert.equal(result.executed_tests, 15);
  assert.equal(result.update.duplicate_install_blocked, true);
  assert.equal(result.installed.sentinel.retained, true);
  assert.equal(f.alive.size, 0);
});

test("complete runner cannot pass the real closed report consumer when feed payload differs from the sealed candidate", async () => {
  const f = lifecycleHarness({ feedPayloadMismatch: true });
  await assert.rejects(f.run(), /feed payload does not match the sealed candidate/);
  assert.equal(f.writes.get("/evidence/failure.json").stage, "validate-report");
  assert.equal(f.alive.size, 0);
});

for (const slowStartup of [false, true]) {
  test(`real updater startup timer cannot preempt manual qualification (slow readiness=${slowStartup})`, async () => {
    const f = lifecycleHarness({ realUpdater: true, slowStartup });
    const result = await f.run();
    assert.equal(result.status, "passed");
    assert.equal(f.networkChecks, 1);
    assert.equal(f.events.filter((event) => event === "startup:timer").length, 1);
    assert.ok(f.events.indexOf("preference:write") >= 0);
    assert.ok(f.events.indexOf("preference:write") < f.events.indexOf("app:spawn"));
    assert.deepEqual(JSON.parse(f.preferences.get(f.nativeSentinel)), { enabled: false });
  });
}

for (const options of [{ preferenceWriteFailure: new Error("preference disk denied") }, { profileAppearsBeforeSeed: true }]) {
  test(`pre-launch preference failure prevents app spawn: ${Object.keys(options)[0]}`, async () => {
    const f = lifecycleHarness(options);
    await assert.rejects(f.run(), /preference disk denied|EEXIST raced profile/);
    assert.equal(f.launches.length, 0);
    assert.ok(f.removedPaths.every((location) => location === "/qa/temp"));
  });
}

test("qualification records both IPC results and labels first rejection separately from duplicate acceptance", async () => {
  for (const [results, message] of [
    [[{ started: false }, { started: false }], /first manual update check did not start/],
    [[{ started: true }, { started: true }], /duplicate update check was not blocked/],
  ]) {
    const f = lifecycleHarness({ downloadResults: results, stateMessage: "token=private-value" });
    await assert.rejects(f.run(), message);
    const diagnostic = f.writes.get("/evidence/failure.json");
    assert.deepEqual(diagnostic.update_probe.first, results[0]);
    assert.deepEqual(diagnostic.update_probe.duplicate, results[1]);
    assert.equal(diagnostic.update_probe.before.stage, "idle");
    assert.doesNotMatch(JSON.stringify(diagnostic), /private-value/);
  }
});

test("non-idle admission and IPC exceptions retain their actual causes", async () => {
  for (const [options, message] of [
    [{ initialStage: "downloading" }, /expected idle updater before manual check/],
    [{ downloadError: new Error("IPC unavailable token=private-value") }, /IPC unavailable/],
  ]) {
    const f = lifecycleHarness(options);
    await assert.rejects(f.run(), message);
    assert.doesNotMatch(JSON.stringify(f.writes.get("/evidence/failure.json")), /private-value/);
  }
});

test("manual update admission rejects missing, mistyped and extended IPC result shapes", async () => {
  for (const invalid of [null, {}, { started: "true" }, { started: true, unexpected: "secret=hidden-value" }]) {
    const first = lifecycleHarness({ downloadResults: [invalid, { started: false }] });
    await assert.rejects(first.run(), /first manual update check did not start/);
    const duplicate = lifecycleHarness({ downloadResults: [{ started: true }, invalid] });
    await assert.rejects(duplicate.run(), /duplicate update check was not blocked/);
    assert.doesNotMatch(JSON.stringify(first.writes.get("/evidence/failure.json")), /hidden-value/);
  }
});

test("real lifecycle accepts only exact previous Windows blockmap fallback followed by full payload", async () => {
  const f = lifecycleHarness({ extraFeedRequests: [{ method: "GET", pathname: "/PuPu-0.1.10-windows-x64-setup.exe.blockmap", status: 404 }] });
  assert.equal((await f.run()).status, "passed");
});

test("already-disconnected old runtime does not wait on a redundant close command", async () => {
  const f = lifecycleHarness({ browserDisconnectsOnExit: true, browserCloseHang: true });
  assert.equal((await f.run()).status, "passed");
  assert.equal(f.browserClosed, 0);
});

test("one close timeout is retried without replaying installation and recovery is recorded", async () => {
  const f = lifecycleHarness({ browserCloseFirstHang: true });
  assert.equal((await f.run()).status, "passed");
  assert.equal(f.browserClosed, 2);
  assert.equal(f.launches.length, 1);
  assert.equal(f.installations.length, 2, "only candidate reference and fixture initial installation");
  const diagnostic = f.writes.get("/evidence/failure.json");
  assert.equal(diagnostic.status, "passed");
  assert.equal(diagnostic.recovery_events.filter((event) => event.outcome === "timeout").length, 1);
  assert.deepEqual(diagnostic.recovery_events.filter((event) => event.outcome === "attempt").map((event) => event.attempt), [1, 2]);
});

test("persistent close timeout exhausts one shared retry budget and remains a failure", async () => {
  const f = lifecycleHarness({ browserCloseHang: true });
  await assert.rejects(f.run(), /old-runtime-browser cleanup timed out/);
  assert.equal(f.browserClosed, 2);
  assert.equal(f.writes.get("/evidence/failure.json").stage, "old-browser-disconnect");
  assert.ok(f.events.includes("temp:remove"));
});

test("connection errors and malformed observations cannot be retried into success", async () => {
  for (const [options, expected, calls] of [
    [{ browserCloseError: new Error("bad channel token=hidden") }, /bad channel/, 1],
    [{ invalidConnectionState: true }, /boolean/, 0],
    [{ browserCloseStillConnected: true }, /remained connected/, 1],
  ]) {
    const f = lifecycleHarness(options);
    await assert.rejects(f.run(), expected);
    assert.equal(f.browserClosed, calls);
    assert.doesNotMatch(JSON.stringify(f.writes.get("/evidence/failure.json")), /token=hidden/);
  }
});

test("successful connection recovery cannot hide a later candidate identity failure", async () => {
  const f = lifecycleHarness({ browserCloseFirstHang: true, identityFailure: new Error("candidate identity mismatch") });
  await assert.rejects(f.run(), /candidate identity mismatch/);
  assert.equal(f.browserClosed, 2);
  assert.ok(f.killed.has(201));
  assert.equal(f.writes.get("/evidence/failure.json").status, "failed");
});

test("expanded budgets reach real renderer/download calls and exhausted waits still block", async () => {
  const good = lifecycleHarness();
  await good.run();
  assert.deepEqual(good.timeoutOptions, { cdp: 120_000, rendererLoad: 120_000, download: 300_000 });
  for (const [options, expected, elapsed] of [
    [{ downloadTimeout: true }, /download deadline exceeded/, 0],
    [{ oldProcessStuck: true }, /old N-1 process exit.*timed out/, 120_000],
    [{ relaunchMissing: true }, /automatic N relaunch process timed out/, 180_000],
  ]) {
    const f = lifecycleHarness(options);
    await assert.rejects(f.run(), expected);
    assert.ok(f.elapsedMs >= elapsed);
    assert.equal(f.launches.length, 1);
    assert.equal(f.writes.get("/evidence/failure.json").status, "failed");
  }
});

test("detached installer and path-alias relaunch are retained as observations without widening cleanup", async () => {
  const f = lifecycleHarness({ relaunchMissing: true, extraProcessRows: [
    { ProcessId: 888, ParentProcessId: 12345, Name: "PuPu-0.1.11-windows-x64-setup.exe", ExecutablePath: "C:/Users/runner/AppData/Local/pupu-updater/pending/setup.exe", CreationDate: "2026-09-18T03:00:00Z", SessionId: 1, CommandLine: "C:/pupu-updater/setup.exe --token=hidden" },
    { ProcessId: 889, ParentProcessId: 888, Name: "PuPu.exe", CommandLine: "C:/Users/runneradmin/AppData/Local/Temp/long-alias/PuPu.exe" },
  ] });
  await assert.rejects(f.run(), /automatic N relaunch process timed out/);
  const diagnostic = f.writes.get("/evidence/failure.json");
  assert.ok(diagnostic.process_timeline.some((snapshot) => snapshot.processes.some((row) => row.pid === 888 && row.created_at === "2026-09-18T03:00:00Z")));
  assert.ok(diagnostic.process_timeline.some((snapshot) => snapshot.processes.some((row) => row.pid === 889)));
  assert.ok(diagnostic.process_timeline.length <= 48);
  assert.doesNotMatch(JSON.stringify(diagnostic), /token=hidden/);
  assert.equal(diagnostic.windows_observations.available, true);
  assert.ok(f.events.indexOf("windows:observe") < f.events.indexOf("temp:remove"));
  assert.ok(!f.killed.has(888) && !f.killed.has(889));
});

test("OS diagnostic failures cannot replace the original upgrade failure or stop cleanup", async () => {
  const f = lifecycleHarness({ relaunchMissing: true, observationFailure: new Error("OS observation failed token=hidden") });
  await assert.rejects(f.run(), /automatic N relaunch process timed out/);
  const diagnostic = f.writes.get("/evidence/failure.json");
  assert.ok(diagnostic.observation_errors.length > 0);
  assert.doesNotMatch(JSON.stringify(diagnostic), /token=hidden/);
  assert.ok(f.events.includes("temp:remove"));
});
