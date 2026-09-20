import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as qualification from "./installed-package-qualification.mjs";

const snapshot = (overrides = {}) => ({
  schema: "pupu.windows-close-observation.v1", pid: 7244,
  started_at: "639253488742760000", window_handle: "0",
  responding: true, close_requested: false, ...overrides,
});

const probeHarness = (sequence, options = {}) => {
  let elapsed = 0;
  const calls = [], observations = [];
  return {
    calls, observations,
    options: {
      timeoutMs: 3_000, retryDelayMs: 1_000, now: () => elapsed,
      pause: async (ms) => { elapsed += ms; },
      onObservation: (row) => observations.push(row),
      spawnProbe(command, args, settings) {
        calls.push({ command, args, settings });
        const row = sequence[Math.min(calls.length - 1, sequence.length - 1)];
        return row?.status !== undefined ? row : { status: 0, stdout: JSON.stringify(row) };
      },
      ...options,
    },
  };
};

test("real Windows installed close tolerates a window appearing after Sidecar startup", async () => {
  // Exercise the real adapter, not a fake close that always succeeds.
  const source = fs.readFileSync(new URL("./installed-package-qualification.mjs", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export const installWindowsNsis ="), source.indexOf("\nconst executableFromLinuxRoot"));
  const f = probeHarness([snapshot(), snapshot({ window_handle: "42", close_requested: true })]);
  const install = vm.runInNewContext(body.replace("export const installWindowsNsis =", "const installWindowsNsis =") + "\ninstallWindowsNsis", {
    process: { platform: "win32" }, path: { join: (...parts) => parts.join("/"), dirname: () => "C:/test/installed" },
    runWindowsNsisInstaller: async () => {}, appRootFromAsar: () => "C:/test/installed/resources",
    inspectResources: () => ({ sidecarPath: "C:/test/sidecar.exe" }),
    runChecked: () => { throw new Error("CloseMainWindow returned false"); },
    closeWindowsApplication: (pid) => qualification.closeWindowsApplication(pid, f.options),
  });
  const installed = await install({ installerPath: "fixture.exe", tempRoot: "C:/test" });
  await installed.close(7244);
  assert.equal(f.calls.length, 2);
});

test("close retries hidden, nonresponding and temporarily disabled windows before accepting a request", async () => {
  const f = probeHarness([
    snapshot(),
    snapshot({ window_handle: "42", responding: false }),
    snapshot({ window_handle: "42" }), // CloseMainWindow returned false.
    snapshot({ window_handle: "42", close_requested: true }),
  ], { timeoutMs: 10_000 });
  const result = await qualification.closeWindowsApplication(7244, f.options);
  assert.equal(result.attempt, 4);
  assert.equal(f.observations.length, 4);
  assert.match(f.calls[1].args.at(-1), /'639253488742760000'/);
  for (const call of f.calls) {
    assert.equal(call.command, "powershell");
    assert.ok(call.settings.timeout > 0 && call.settings.timeout <= 10_000);
    assert.doesNotMatch(call.args.at(-1), /Stop-Process|taskkill|\.Kill\(/i);
  }
});

test("never-ready window exhausts a shared deadline and retains the last observation", async () => {
  const f = probeHarness([snapshot()]);
  await assert.rejects(qualification.closeWindowsApplication(7244, f.options), /timed out.*"window_handle":"0".*"attempt":3/);
  assert.equal(f.calls.length, 3);
});

test("probe execution time consumes the window deadline, including a late accepted request", async () => {
  let elapsed = 0;
  const f = probeHarness([], {
    now: () => elapsed,
    spawnProbe: () => {
      elapsed += 4_000;
      return { status: 0, stdout: JSON.stringify(snapshot({ window_handle: "42", close_requested: true })) };
    },
  });
  await assert.rejects(qualification.closeWindowsApplication(7244, f.options), /timed out/);
});

test("wrong identities, unknown keys, wrong versions and malformed native outputs fail closed", async () => {
  for (const row of [
    snapshot({ pid: 777 }), snapshot({ extra: true }), snapshot({ schema: "v2" }),
    snapshot({ started_at: "'; Stop-Process" }), snapshot({ window_handle: -1 }),
    snapshot({ responding: "true" }), snapshot({ close_requested: "true" }),
    snapshot({ close_requested: true }), snapshot({ window_handle: "42", responding: false, close_requested: true }),
    { status: 0, stdout: "not json" },
  ]) {
    const f = probeHarness([row]);
    await assert.rejects(qualification.closeWindowsApplication(7244, f.options));
    assert.equal(f.calls.length, 1);
    assert.equal(f.observations.length, 0);
  }
  const f = probeHarness([snapshot(), snapshot({ started_at: "639253488742760001" })]);
  await assert.rejects(qualification.closeWindowsApplication(7244, f.options), /identity changed/);
  assert.equal(f.calls.length, 2);
});

test("a missing/exited process, denied access, or failed PowerShell is not retried into a pass", async () => {
  for (const result of [
    { status: 1, stderr: "Cannot find a process" },
    { status: 1, stderr: "Access denied" },
    { status: null, error: new Error("probe timed out") },
  ]) {
    const f = probeHarness([result]);
    await assert.rejects(qualification.closeWindowsApplication(7244, f.options), /Windows close probe failed/);
    assert.equal(f.calls.length, 1);
  }
});

test("invalid process IDs and invalid budgets never execute PowerShell", async () => {
  const f = probeHarness([]);
  for (const pid of [0, -1, 1.5, "7244", 2_147_483_648, process.pid, process.ppid]) {
    await assert.rejects(qualification.closeWindowsApplication(pid, f.options));
  }
  for (const options of [{ timeoutMs: 0 }, { retryDelayMs: 0 }]) {
    await assert.rejects(qualification.closeWindowsApplication(7244, { ...f.options, ...options }));
  }
  assert.equal(f.calls.length, 0);
});

test("both production lifecycle callers await the asynchronous close request", () => {
  const installed = fs.readFileSync(new URL("./installed-package-qualification.mjs", import.meta.url), "utf8");
  const restart = fs.readFileSync(new URL("./run-restart-update-qualification.mjs", import.meta.url), "utf8");
  assert.match(installed, /await installed\.close\(buildInstalledProcessControl/);
  assert.match(restart, /await installedFixture\.close\(relaunchedRoot\.pid\)/);
});

test("native Windows probe observes a windowless child without killing it or declaring success", {
  skip: process.platform !== "win32",
}, async (t) => {
  // Only a disposable Node child: never launch PuPu, a model or an installer.
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { windowsHide: true, stdio: "ignore" });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  const observations = [];
  await assert.rejects(qualification.closeWindowsApplication(child.pid, {
    timeoutMs: 8_000, onObservation: (row) => observations.push(row),
  }), /Windows close request timed out/);
  assert.ok(observations.length > 0);
  assert.ok(observations.every((row) => row.pid === child.pid && row.window_handle === "0" && !row.close_requested));
  assert.equal(child.exitCode, null);
});

test("native Windows delayed GUI receives WM_CLOSE and exits normally", {
  skip: process.platform !== "win32", timeout: 45_000,
}, async (t) => {
  // A disposable WinForms fixture validates actual Process/WM_CLOSE behavior.
  // It is not the product and contains no installer, network or model calls.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$context = New-Object System.Windows.Forms.ApplicationContext
$form = New-Object System.Windows.Forms.Form
$form.Text = 'PuPu qualification close test'
$form.add_FormClosed({ $context.ExitThread() })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({ $timer.Stop(); $form.Show() })
$timer.Start()
[Console]::Out.WriteLine('fixture-ready')
[Console]::Out.Flush()
[System.Windows.Forms.Application]::Run($context)
$timer.Dispose()
$form.Dispose()
`;
  const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const completion = once(child, "exit");
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  const deadline = Date.now() + 15_000;
  while (!output.includes("fixture-ready") && Date.now() < deadline && child.exitCode === null) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.match(output, /fixture-ready/, output);
  const observations = [];
  const result = await qualification.closeWindowsApplication(child.pid, {
    timeoutMs: 20_000, onObservation: (row) => observations.push(row),
  });
  assert.ok(observations.some((row) => row.window_handle === "0"));
  assert.equal(result.close_requested, true);
  assert.deepEqual(await completion, [0, null]);
});
