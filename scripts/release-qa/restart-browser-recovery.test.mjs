import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { closeRestartBrowser, RESTART_UPDATE_TIMEOUTS } from "./run-restart-update-qualification.mjs";

// Execute the installed SDK's actual Browser class, not a reimplementation of
// close/isConnected. Only its channel owner and remote channel are replaced.
// No browser process, PuPu process, shell command or local model is launched.
const require = createRequire(import.meta.url);
const sdkRoot = path.dirname(require.resolve("playwright-core/package.json"));
const bundle = fs.readFileSync(path.join(sdkRoot, "lib/coreBundle.js"), "utf8");
const classStart = bundle.indexOf("Browser2 = class extends ChannelOwner {");
assert.ok(classStart > 0, "installed SDK Browser class must be inspectable");
const classEnd = bundle.indexOf("\n    };", classStart);
assert.ok(classEnd > classStart);
const actualClass = bundle.slice(classStart, classEnd + "\n    };".length);

function sdkBrowser(closeChannel) {
  class ChannelOwner extends EventEmitter {
    constructor() {
      super();
      this._channel = new EventEmitter();
      this._channel.close = () => closeChannel(this);
    }
  }
  const sandbox = vm.createContext({ ChannelOwner, Events: { Browser: { Disconnected: "disconnected" } },
    isTargetClosedError2: () => false });
  vm.runInContext(actualClass, sandbox);
  return new sandbox.Browser2(null, "Browser", "test", { name: "chromium", browserName: "chromium" });
}

test("timeout policy is fixed and bounded", () => {
  assert.ok(Object.isFrozen(RESTART_UPDATE_TIMEOUTS));
  assert.deepEqual(RESTART_UPDATE_TIMEOUTS, {
    renderer: 120_000, sidecar: 120_000, download: 300_000,
    oldProcessExit: 120_000, relaunch: 180_000, shutdown: 60_000,
    cleanup: 60_000, browserCloseAttempts: 2, retryDelay: 1_000,
  });
});

test("actual SDK natural disconnection bypasses a channel close that would hang", async () => {
  let calls = 0;
  const browser = sdkBrowser(() => { calls += 1; return new Promise(() => {}); });
  browser._channel.emit("close");
  assert.equal(browser.isConnected(), false);
  await closeRestartBrowser(browser, "sdk", { timeoutMs: 10, retryDelayMs: 0 });
  assert.equal(calls, 0);
});

test("actual SDK first delayed channel close recovers once; late rejection stays handled", async () => {
  let calls = 0;
  let rejectFirst;
  const events = [];
  const browser = sdkBrowser((instance) => {
    calls += 1;
    if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject; });
    instance._channel.emit("close");
    return Promise.resolve();
  });
  await closeRestartBrowser(browser, "sdk", { timeoutMs: 10, retryDelayMs: 0, onEvent: (event) => events.push(event) });
  assert.equal(calls, 2);
  assert.equal(browser.isConnected(), false);
  assert.deepEqual(events.map((event) => event.outcome), ["attempt", "timeout", "attempt", "closed"]);
  rejectFirst(new Error("late channel rejection"));
  await new Promise((resolve) => setImmediate(resolve));
});

test("actual SDK disconnection during a hung channel close is terminal without another command", async () => {
  let calls = 0;
  const browser = sdkBrowser((instance) => {
    calls += 1;
    instance._channel.emit("close");
    return new Promise(() => {});
  });
  await closeRestartBrowser(browser, "sdk", { timeoutMs: 10, retryDelayMs: 0 });
  assert.equal(calls, 1);
  assert.equal(browser.isConnected(), false);
});

test("SDK errors merely named timeout are not the runner deadline and cannot trigger retry", async () => {
  let calls = 0;
  const error = new Error("sdk cleanup timed out");
  error.name = "RestartCleanupTimeoutError";
  const browser = sdkBrowser(() => { calls += 1; return Promise.reject(error); });
  await assert.rejects(closeRestartBrowser(browser, "sdk", { timeoutMs: 10 }), (actual) => actual === error);
  assert.equal(calls, 1);
});
