import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRestartRuntimeLaunch,
  validateRestartUpdateRuntimeInputs,
  validateRestartUpdateStageTrace,
} from "./run-restart-update-qualification.mjs";

test("Windows restart qualification uses inherited isolated AppData rather than relaunch-lost userData arguments", () => {
  const launch = buildRestartRuntimeLaunch({
    platform: "win32",
    tempRoot: "C:\\qa\\restart",
    debugPort: 38193,
  });
  assert.deepEqual(launch.args, ["--remote-debugging-port=38193"]);
  assert.equal(launch.environment.APPDATA, "C:\\qa\\restart\\appdata");
  assert.equal(launch.environment.LOCALAPPDATA, "C:\\qa\\restart\\localappdata");
  assert.equal(launch.userData, "C:\\qa\\restart\\appdata\\PuPu");
  assert.ok(!launch.args.some((arg) => arg.startsWith("--user-data-dir=")));
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
