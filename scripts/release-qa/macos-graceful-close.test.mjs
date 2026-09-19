import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { closeMacApplication, MACOS_CLOSE_SCRIPT, validateMacCloseObservation } from "./macos-graceful-close.mjs";

const PID = 7244;
const BUNDLE = "/tmp/installed/PuPu.app";
const IMAGE = `${BUNDLE}/Contents/MacOS/PuPu`;
const snapshot = (overrides = {}) => ({ schema: "pupu.macos-close-observation.v1", pid: PID,
  bundle_path: BUNDLE, executable_path: IMAGE, started_at: "launch-date:1789791000.123",
  finished_launching: true, request_sent: false, accepted: false, ...overrides });
const expected = { pid: PID, bundlePath: BUNDLE, executablePath: IMAGE, startedAt: "", action: "inspect" };

// Execute the actual native producer code, not a second implementation of it.
// The fake exposes only the AppKit selectors the producer is allowed to use.
const native = (overrides = {}) => {
  let quitCalls = 0;
  let kernelReads = 0;
  const url = (value) => ({ isNil: () => false, path: value });
  const app = { isNil: () => false, terminated: false, processIdentifier: PID,
    bundleURL: url(BUNDLE), executableURL: url(IMAGE),
    launchDate: { isNil: () => false, timeIntervalSince1970: 1789791000.123 },
    finishedLaunching: true, ...overrides };
  Object.defineProperty(app, "terminate", { get() { quitCalls++; return overrides.quitAccepted ?? true; } });
  const task = { terminationStatus: overrides.kernelStatus ?? 0, waitUntilExit: undefined };
  Object.defineProperty(task, "launch", { get() {
    assert.equal(task.launchPath, "/bin/ps");
    assert.deepEqual(Array.from(task.arguments), ["-p", String(PID), "-o", "lstart="]);
    assert.equal(task.environment.LC_ALL, "C");
    kernelReads++;
  } });
  const run = vm.runInNewContext(`${MACOS_CLOSE_SCRIPT}\nrun`, {
    ObjC: { import: (name) => assert.equal(name, "AppKit"), unwrap: (value) => value,
      bindFunction: (name, signature) => {
        assert.equal(name, "realpath");
        assert.equal(JSON.stringify(signature), JSON.stringify(["char *", ["char *", "void *"]]));
      },
    },
    $: { NSRunningApplication: { runningApplicationWithProcessIdentifier: (pid) => { assert.equal(pid, PID); return app; } },
      realpath: (value, buffer) => { assert.equal(buffer, null); return value; },
      NSTask: { alloc: { init: task } },
      NSPipe: { pipe: { fileHandleForReading: { readDataToEndOfFile: "kernel-bytes" } } },
      NSUTF8StringEncoding: 4,
      NSString: { alloc: { initWithDataEncoding: (bytes, encoding) => {
        assert.equal(bytes, "kernel-bytes"); assert.equal(encoding, 4);
        return overrides.kernelStart ?? "Fri Sep 18 21:41:01 2026\n";
      } } },
    },
  });
  return { app, get quitCalls() { return quitCalls; }, get kernelReads() { return kernelReads; },
    invoke: (action, start = "") => run([String(PID), BUNDLE, IMAGE, start, action]) };
};

const harness = (rows, extra = {}) => {
  let elapsed = 0;
  const calls = [], observations = [];
  return { calls, observations, options: {
    realpath: (value) => value, timeoutMs: 10_000, settleMs: 2_000, pollMs: 1_000,
    now: () => elapsed, pause: async (ms) => { elapsed += ms; },
    onObservation: (row) => observations.push(row),
    spawnProbe(command, args, options) {
      calls.push({ command, args, options });
      const row = rows[Math.min(calls.length - 1, rows.length - 1)];
      return row.status !== undefined ? row : { status: 0, stdout: JSON.stringify(row) };
    }, ...extra,
  } };
};
const requested = () => snapshot({ request_sent: true, accepted: true });

test("native producer output passes strict consumer and quit targets only the pinned instance", () => {
  const f = native();
  const first = validateMacCloseObservation(JSON.parse(f.invoke("inspect")), expected);
  assert.equal(f.quitCalls, 0);
  const last = validateMacCloseObservation(JSON.parse(f.invoke("quit", first.started_at)), { ...expected, startedAt: first.started_at, action: "quit" });
  assert.equal(last.accepted, true);
  assert.equal(f.quitCalls, 1);
});

test("native identity mismatches and PID reuse are rejected BEFORE any quit", () => {
  for (const overrides of [
    { processIdentifier: 7245 }, { terminated: true }, { isNil: () => true },
    { bundleURL: { isNil: () => true } },
    { executableURL: { isNil: () => false, path: `${IMAGE}-other` } },
    { bundleURL: { isNil: () => false, path: `${BUNDLE}-other` } },
  ]) {
    const f = native(overrides);
    assert.throws(() => f.invoke("quit"));
    assert.equal(f.quitCalls, 0);
  }
  const f = native();
  assert.throws(() => f.invoke("quit", "1"), /PID was reused/);
  assert.equal(f.quitCalls, 0);
});

test("native not-yet-launched request does not send quit; native rejection is preserved", () => {
  const early = native({ finishedLaunching: false });
  assert.equal(JSON.parse(early.invoke("quit")).request_sent, false);
  assert.equal(early.quitCalls, 0);
  const veto = native({ quitAccepted: false });
  assert.equal(JSON.parse(veto.invoke("quit")).accepted, false);
  assert.equal(veto.quitCalls, 1);
});

test("direct launches without LaunchServices dates pin kernel start time through native producer and consumer", () => {
  const f = native({ launchDate: { isNil: () => true } });
  const first = validateMacCloseObservation(JSON.parse(f.invoke("inspect")), expected);
  assert.equal(first.started_at, "kernel-lstart:Fri Sep 18 21:41:01 2026");
  // LaunchServices can fill its date later: do not switch identity sources.
  f.app.launchDate = { isNil: () => false, timeIntervalSince1970: 1789791000.123 };
  const quit = validateMacCloseObservation(JSON.parse(f.invoke("quit", first.started_at)), {
    ...expected, startedAt: first.started_at, action: "quit",
  });
  assert.equal(quit.accepted, true);
  assert.equal(f.kernelReads, 2);
  assert.equal(f.quitCalls, 1);
});

test("missing, malformed or changed kernel start time fails before native quit", () => {
  for (const overrides of [{ kernelStatus: 1 }, { kernelStart: "" }, { kernelStart: "garbage" }]) {
    const f = native({ launchDate: { isNil: () => true }, ...overrides });
    assert.throws(() => f.invoke("quit"), /kernel start time/);
    assert.equal(f.quitCalls, 0);
  }
  const f = native({ launchDate: { isNil: () => true } });
  assert.throws(() => f.invoke("quit", "kernel-lstart:Fri Sep 18 21:41:02 2026"), /PID was reused/);
  assert.equal(f.quitCalls, 0);
});

test("readiness polling waits and pins launch date, then sends exactly one quit", async () => {
  const f = harness([snapshot({ finished_launching: false }), snapshot(), snapshot(), requested()]);
  const result = await closeMacApplication(PID, BUNDLE, IMAGE, f.options);
  assert.equal(result.action, "quit");
  assert.equal(result.elapsed_ms, 3_000);
  assert.deepEqual(f.calls.map((call) => call.args.at(-1)), ["inspect", "inspect", "inspect", "quit"]);
  assert.equal(f.calls[1].args.at(-2), "launch-date:1789791000.123");
  assert.equal(f.calls[0].options.timeout, 10_000);
  assert.equal(f.calls[3].options.timeout, 7_000);
  assert.match(result.readiness, /not-renderer/);
});

test("readiness regression resets settling and never-ready target times out without quit", async () => {
  const f = harness([snapshot(), snapshot({ finished_launching: false }), snapshot(), snapshot(), requested()]);
  await closeMacApplication(PID, BUNDLE, IMAGE, f.options);
  assert.equal(f.calls.length, 5);
  const stuck = harness([snapshot({ finished_launching: false })], { timeoutMs: 3_000 });
  await assert.rejects(closeMacApplication(PID, BUNDLE, IMAGE, stuck.options), /readiness timed out/);
  assert.equal(stuck.calls.length, 3);
  assert.ok(stuck.calls.every((call) => call.args.at(-1) === "inspect"));
});

test("an accepted native request is NOT retried; explicit rejection and ambiguous failure fail closed", async () => {
  for (const last of [snapshot({ request_sent: true }),
    { status: null, error: { message: "native probe timed out" } }]) {
    const f = harness([snapshot(), snapshot(), last]);
    await assert.rejects(closeMacApplication(PID, BUNDLE, IMAGE, f.options), /rejected|probe failed/);
    assert.equal(f.calls.filter((call) => call.args.at(-1) === "quit").length, 1);
  }
});

test("strict native protocol rejects unknown fields, schema drift, identities and impossible states", () => {
  for (const overrides of [{ extra: true }, { schema: "v2" }, { pid: PID + 1 },
    { bundle_path: "/wrong.app" }, { executable_path: `${IMAGE}-helper` }, { started_at: "" },
    { finished_launching: 1 }, { accepted: "true" }, { request_sent: "false" },
    { request_sent: true }, { accepted: true },
  ]) assert.throws(() => validateMacCloseObservation(snapshot(overrides), expected));
  assert.throws(() => validateMacCloseObservation(snapshot(), { ...expected, startedAt: "2" }));
  assert.throws(() => validateMacCloseObservation(snapshot(), { ...expected, action: "quit" }));
});

test("identity drift during settling aborts before quit and paths are argv, not script interpolation", async () => {
  const f = harness([snapshot(), snapshot({ started_at: "2" })]);
  await assert.rejects(closeMacApplication(PID, BUNDLE, IMAGE, f.options), /changed process identity/);
  assert.ok(f.calls.every((call) => call.args.at(-1) === "inspect"));
  assert.equal(f.calls[0].args[3], MACOS_CLOSE_SCRIPT);
  assert.deepEqual(f.calls[0].args.slice(4, 7), [String(PID), BUNDLE, IMAGE]);
  assert.doesNotMatch(MACOS_CLOSE_SCRIPT, /forceTerminate|kill|Application\(argv/);
});

test("invalid PID, path and budgets never invoke native code", async () => {
  const f = harness([]);
  for (const pid of [0, -1, 1, 1.5, "7244", 2_147_483_648, process.pid, process.ppid])
    await assert.rejects(closeMacApplication(pid, BUNDLE, IMAGE, f.options));
  await assert.rejects(closeMacApplication(PID, "relative.app", IMAGE, f.options));
  await assert.rejects(closeMacApplication(PID, BUNDLE, "/other/PuPu", f.options));
  await assert.rejects(closeMacApplication(PID, BUNDLE, IMAGE, { ...f.options, timeoutMs: 2_000 }));
  assert.equal(f.calls.length, 0);
});

test("native probe latency consumes the overall deadline, even if a late request was accepted", async () => {
  let elapsed = 0, calls = 0;
  const f = harness([], { now: () => elapsed, pause: async (ms) => { elapsed += ms; },
    spawnProbe: () => { calls++; if (calls === 3) elapsed += 10_000;
      return { status: 0, stdout: JSON.stringify(calls === 3 ? requested() : snapshot()) }; },
  });
  await assert.rejects(closeMacApplication(PID, BUNDLE, IMAGE, f.options), /timed out/);
  assert.equal(calls, 3);
});

test("real JXA bridge rejects a nonexistent PID without launching or terminating any app", { skip: process.platform !== "darwin" }, () => {
  const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", MACOS_CLOSE_SCRIPT,
    "2147483647", BUNDLE, IMAGE, "", "inspect"], { encoding: "utf8", timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target is no longer running/);
});

test("real JXA filesystem identities match Node across private aliases and reject other targets", { skip: process.platform !== "darwin" }, (t) => {
  // Replace ONLY process lookup with an inert instance. All URL construction,
  // path resolution, native producer and strict Node consumer remain real.
  // No running application is looked up, launched or asked to terminate.
  const lookup = "var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);";
  assert.equal(MACOS_CLOSE_SCRIPT.split(lookup).length, 2);
  const script = MACOS_CLOSE_SCRIPT.replace(lookup, `var app = {
    isNil: function () { return false; }, terminated: false, processIdentifier: pid,
    bundleURL: $.NSURL.fileURLWithPath(argv[5]), executableURL: $.NSURL.fileURLWithPath(argv[6]),
    launchDate: { isNil: function () { return false; }, timeIntervalSince1970: 1789791000.123 },
    finishedLaunching: true,
    get terminate() { throw Error("TEST FORBIDS TERMINATION"); }
  };`);
  for (const base of ["/tmp", os.tmpdir()]) {
    const root = fs.mkdtempSync(path.join(base, "pupu-native-path-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bundle = path.join(root, "PuPu's 中文 app.app");
    const image = path.join(bundle, "Contents/MacOS/PuPu");
    fs.mkdirSync(path.dirname(image), { recursive: true });
    fs.writeFileSync(image, "inert identity fixture, not an executable");
    const bundlePath = fs.realpathSync.native(bundle), executablePath = fs.realpathSync.native(image);
    // TMPDIR can be overridden by CI; /tmp still exercises the system alias.
    if (base === "/tmp") assert.match(bundlePath, /^\/private\//);
    const alias = path.join(root, "bundle-alias");
    fs.symlinkSync(bundle, alias);
    const invoke = (actualBundle, actualImage, action = "inspect") => spawnSync("/usr/bin/osascript", [
      "-l", "JavaScript", "-e", script, String(PID), bundlePath, executablePath, "", action,
      actualBundle, actualImage,
    ], { encoding: "utf8", timeout: 10_000 });
    const bundleAliases = [bundlePath, alias];
    if (bundlePath.startsWith("/private/")) bundleAliases.push(bundlePath.slice("/private".length));
    for (const actualBundle of bundleAliases) {
      const result = invoke(actualBundle, `${actualBundle}/Contents/MacOS/PuPu`);
      assert.equal(result.status, 0, result.stderr);
      const row = validateMacCloseObservation(JSON.parse(result.stdout), { ...expected, bundlePath, executablePath });
      assert.equal(row.request_sent, false);
    }
    const otherBundle = path.join(root, "Other.app");
    const otherImage = path.join(otherBundle, "Contents/MacOS/PuPu");
    fs.mkdirSync(path.dirname(otherImage), { recursive: true });
    fs.writeFileSync(otherImage, "different inert target");
    fs.unlinkSync(alias);
    fs.symlinkSync(otherBundle, alias);
    for (const [actualBundle, actualImage] of [
      [otherBundle, otherImage], [bundle, otherImage],
      [alias, `${alias}/Contents/MacOS/PuPu`], [bundle, `${image}-missing`],
    ]) {
      const result = invoke(actualBundle, actualImage, "quit");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /identity mismatch|cannot resolve/);
      assert.doesNotMatch(result.stderr, /TEST FORBIDS TERMINATION/);
    }
  }
});

test("DMG adapter forwards the verified root PID and exact bundle identity", async () => {
  const source = fs.readFileSync(new URL("./installed-package-qualification.mjs", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export const installMacDmg ="), source.indexOf("\nconst compactProcessDetail"));
  const calls = [];
  const identity = { executablePath: "/tmp/installed/PuPu.app/Contents/MacOS/PuPu" };
  const install = vm.runInNewContext(body.replace("export const installMacDmg =", "const installMacDmg =") + "\ninstallMacDmg", {
    process: { platform: "darwin" },
    path: { join: (...parts) => parts.join("/"), dirname: () => "/tmp/installed/PuPu.app/Contents/MacOS" },
    fs: { mkdirSync() {}, readdirSync: () => [{ name: "PuPu.app", isDirectory: () => true }] },
    runChecked: (command) => { if (command === "/usr/bin/osascript") throw new Error("path-only quit must not be used"); return "PuPu"; },
    inspectResources: () => identity,
    closeMacApplication: (...args) => { calls.push(args); return "requested"; },
  });
  const installed = install({ installerPath: "fixture.dmg", tempRoot: "/tmp" });
  const options = { onObservation() {} };
  assert.equal(await installed.close(7244, options), "requested");
  assert.deepEqual(calls[0], [7244, "/tmp/installed/PuPu.app", identity.executablePath, options]);
});
