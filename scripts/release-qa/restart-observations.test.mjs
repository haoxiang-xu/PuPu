import assert from "node:assert/strict";
import test from "node:test";
import { createRestartObservationRecorder, collectWindowsUpgradeObservations, WINDOWS_UPGRADE_OBSERVATION_SCRIPT, redactRestartObservation } from "./restart-observations.mjs";

test("observation redaction covers quoted, spaced, bearer and URL query credentials", () => {
  const source = '--password="hidden words" --token hidden-token secret=hidden-secret Authorization: Bearer hidden-bearer https://example.test/path?credential=hidden-query';
  assert.doesNotMatch(redactRestartObservation(source), /hidden/);
});

test("process snapshots bound rows, history, strings and secrets without granting cleanup ownership", () => {
  let time = 0;
  const recorder = createRestartObservationRecorder({ now: () => time });
  const rows = Array.from({ length: 100 }, (_, i) => ({ pid: i + 100, ppid: 8, name: "PuPu.exe", createdAt: "2026-09-18T03:00:00Z", command: `PuPu.exe --secret=hidden ${"x".repeat(4000)}` }));
  for (let n = 0; n < 60; n += 1) { recorder.capture("waiting", rows); time += 5000; }
  assert.equal(recorder.snapshots.length, 48);
  assert.equal(recorder.snapshots[0].processes.length, 64);
  assert.equal(recorder.snapshots[0].truncated, true);
  assert.equal(recorder.snapshots[0].related_processes, 100);
  assert.ok(recorder.snapshots[0].processes[0].command.length <= 2048);
  assert.equal(recorder.snapshots[0].processes[0].observed_old_pid, false);
  assert.doesNotMatch(JSON.stringify(recorder.snapshots), /secret=hidden/);
  recorder.capture("waiting", rows);
  const last = recorder.snapshots.at(-1);
  recorder.capture("waiting", rows);
  assert.equal(recorder.snapshots.at(-1), last);
  recorder.capture("failure", rows, [100], true);
  assert.equal(recorder.snapshots.at(-1).processes[0].observed_old_pid, true);
});

test("OS probe is bounded and projects only redacted allowed fields", () => {
  const output = collectWindowsUpgradeObservations({ platform: "win32", spawn(command, args, options) {
    assert.equal(command, "powershell");
    assert.ok(args.includes(WINDOWS_UPGRADE_OBSERVATION_SCRIPT));
    assert.equal(options.timeout, 15000);
    assert.equal(options.windowsHide, true);
    return { status: 0, stdout: JSON.stringify({ windows: [{ Id: 20, ProcessName: "PuPu", MainWindowTitle: "secret=hidden", Responding: true, SessionId: 1, unexpected: "do-not-copy" }],
      application_errors: [{ Time: "now", Id: 1000, ProviderName: "Application Error", Message: "token=hidden" }], event_query_error: null }) };
  } });
  assert.equal(output.available, true);
  assert.doesNotMatch(JSON.stringify(output), /hidden|do-not-copy/);
  assert.doesNotMatch(WINDOWS_UPGRADE_OBSERVATION_SCRIPT, /Stop-Process|taskkill|Remove-Item|SendMessage/);
  assert.throws(() => collectWindowsUpgradeObservations({ platform: "win32", spawn: () => ({ status: 1, stderr: "secret=hidden" }) }), /observation failed/);
  assert.throws(() => collectWindowsUpgradeObservations({ platform: "win32", spawn: () => ({ status: 0, stdout: "{}" }) }), /arrays/);
  assert.deepEqual(collectWindowsUpgradeObservations({ platform: "darwin" }), { available: false, reason: "not-windows" });
});
