import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readReleaseArtifactContract } from "./release-artifact-manifest.mjs";

import {
  assertFeedRequests,
  buildRestartRuntimeLaunch,
  validateRestartUpdateRuntimeInputs,
  validateRestartUpdateStageTrace,
} from "./run-restart-update-qualification.mjs";

test("Windows restart qualification uses the native profile shared with NSIS relaunch, not overridden AppData", () => {
  const launch = buildRestartRuntimeLaunch({
    platform: "win32",
    tempRoot: "C:\\qa\\restart",
    debugPort: 38193,
    windowsAppData: "C:\\Users\\runneradmin\\AppData\\Roaming",
  });
  assert.deepEqual(launch.args, ["--remote-debugging-port=38193"]);
  assert.deepEqual(launch.environment, { HOME: "C:\\qa\\restart\\home" });
  assert.equal(launch.userData, "C:\\Users\\runneradmin\\AppData\\Roaming\\PuPu");
  assert.deepEqual(launch.directories, ["C:\\qa\\restart\\home"]);
  assert.ok(!launch.args.some((arg) => arg.startsWith("--user-data-dir=")));
});

test("Windows feed admission restricts optional historical blockmap fallback without masking real failures", () => {
  const contract = readReleaseArtifactContract(fileURLToPath(new URL("../../docs/contracts/release/release-artifact-contract.v1.json", import.meta.url)));
  const feed = {
    metadata: { name: "latest.yml" },
    payload: { name: "PuPu-0.1.11-windows-x64-setup.exe" },
    blockmap: { name: "PuPu-0.1.11-windows-x64-setup.exe.blockmap" },
  };
  const metadata = { method: "GET", pathname: `/${feed.metadata.name}`, status: 200 };
  const payload = { method: "GET", pathname: `/${feed.payload.name}`, status: 200 };
  const miss = { method: "GET", pathname: "/PuPu-0.1.10-windows-x64-setup.exe.blockmap", status: 404 };
  const admission = { contract, fromVersion: "0.1.10", targetId: "windows-x64" };
  const check = (requests, overrides = {}) => assertFeedRequests({ feed, requests }, { ...admission, ...overrides });
  assert.doesNotThrow(() => check([metadata, miss, payload]));
  assert.doesNotThrow(() => check([metadata, payload]));
  assert.doesNotThrow(() => check([metadata, { ...payload, status: 206 }]));
  for (const wrong of [
    { pathname: "/unknown" },
    { pathname: "/PuPu-0.1.9-windows-x64-setup.exe.blockmap" },
    { pathname: `/${feed.blockmap.name}` },
    { pathname: "/../PuPu-0.1.10-windows-x64-setup.exe.blockmap" },
    { method: "HEAD" }, { method: "POST" }, { status: 403 }, { status: 500 },
  ]) assert.throws(() => check([metadata, { ...miss, ...wrong }, payload]), /rejected request/, JSON.stringify(wrong));
  for (const requests of [
    [metadata, miss, miss, payload],
    [metadata, payload, miss],
    [metadata, miss, { ...payload, status: 206 }],
    [metadata, miss],
    [miss, payload],
    [{ ...metadata, method: "HEAD" }, miss, payload],
    [metadata, miss, { ...payload, method: "HEAD" }],
  ]) assert.throws(() => check(requests), /rejected request|did not request/);
  for (const overrides of [
    { targetId: "macos-arm64" }, { fromVersion: undefined },
    { fromVersion: "0.1.11" }, { fromVersion: "../0.1.10" }, { contract: undefined },
  ]) assert.throws(() => check([metadata, miss, payload], overrides), /rejected request/);
});

test("Windows restart profile rejects missing, relative, root-only and malformed native paths", () => {
  for (const windowsAppData of [undefined, "", "relative", "C:", "C:\\", "C:\\Users\\runner\nBAD"]) {
    assert.throws(() => buildRestartRuntimeLaunch({
      platform: "win32", tempRoot: "C:\\qa", debugPort: 38193, windowsAppData,
    }), /native absolute ApplicationData/);
  }
});

test("macOS runtime launch rejects missing or unsafe native homes", () => {
  for (const macosHome of [undefined, "", "relative", "/", "/Users/runner/../other", "/Users/runner\nBAD"]) {
    assert.throws(() => buildRestartRuntimeLaunch({
      platform: "darwin", tempRoot: "/qa", debugPort: 38193, macosHome,
    }), /native absolute user home/);
  }
});

test("restart-update executor accepts only the three supported runtimes and a fixed loopback port", () => {
  assert.deepEqual(
    validateRestartUpdateRuntimeInputs({ targetId: "windows-x64", feedPort: 38191 }),
    { targetId: "windows-x64", feedPort: 38191 },
  );
  assert.throws(
    () => validateRestartUpdateRuntimeInputs({ targetId: "linux-x64", feedPort: 38191 }),
    /unsupported/,
  );
  assert.throws(
    () => validateRestartUpdateRuntimeInputs({ targetId: "windows-x64", feedPort: 0 }),
    /1 through 65535/,
  );
});

test("restart-update executor requires observed checking, downloading, and downloaded state without an error terminal", () => {
  assert.deepEqual(
    validateRestartUpdateStageTrace(["checking", "checking", "downloading", "downloading", "downloaded"]),
    ["checking", "downloading", "downloaded"],
  );
  assert.throws(
    () => validateRestartUpdateStageTrace(["checking", "error"]),
    /unexpected terminal/,
  );
  assert.throws(
    () => validateRestartUpdateStageTrace(["checking", "downloaded"]),
    /required download stages/,
  );
});
