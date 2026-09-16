import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("Windows restart profile rejects missing, relative, root-only and malformed native paths", () => {
  for (const windowsAppData of [undefined, "", "relative", "C:", "C:\\", "C:\\Users\\runner\nBAD"]) {
    assert.throws(() => buildRestartRuntimeLaunch({
      platform: "win32", tempRoot: "C:\\qa", debugPort: 38193, windowsAppData,
    }), /native absolute ApplicationData/);
  }
});

test("macOS runtime launch retains its existing isolated user-data argument", () => {
  const launch = buildRestartRuntimeLaunch({ platform: "darwin", tempRoot: "/qa", debugPort: 38193 });
  assert.equal(launch.userData, "/qa/user-data");
  assert.ok(launch.args.includes("--user-data-dir=/qa/user-data"));
  assert.ok(launch.args.includes("--use-mock-keychain"));
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
