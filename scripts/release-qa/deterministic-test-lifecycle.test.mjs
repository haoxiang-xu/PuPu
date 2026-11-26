import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const workflow = YAML.parse(fs.readFileSync(
  path.join(ROOT, ".github/workflows/_shared-release-deterministic.yml"), "utf8",
));
const job = workflow.jobs.deterministic;
const steps = job.steps;

test("deterministic tests stop well before the job limit and retain diagnostics", () => {
  const runnerSource = fs.readFileSync(path.join(ROOT, "scripts/release-qa/run-python-tests.py"), "utf8");
  const limit = runnerSource.match(/^EXECUTION_LIMIT_SECONDS = ([\d.]+)$/m);
  assert.ok(limit, "the production runner must retain a fixed execution limit");
  const hardSeconds = Number(limit[1]);
  // The 4,257-case CI run exhausted 3,000 seconds at 85%; the prior passing
  // run already took 45 minutes. Retain useful margin without an unbounded run.
  assert.ok(hardSeconds >= 60 * 60 && hardSeconds <= 90 * 60,
    "the complete backend suite needs a bounded 60–90 minute execution budget");
  const stepSeconds = (id) => {
    const step = steps.find((entry) => entry.id === id);
    assert.ok(step && Number.isFinite(step["timeout-minutes"]), `${id} needs an explicit timeout`);
    return step["timeout-minutes"] * 60;
  };
  const backendSeconds = stepSeconds("python");
  assert.ok(backendSeconds >= hardSeconds + 60,
    "the runner must stop and drain owned children before the Actions step can kill it");
  assert.ok(job["timeout-minutes"] * 60 >=
    backendSeconds + stepSeconds("frontend") + stepSeconds("electron") + 15 * 60,
  "the job must also retain setup, contract, build and final-report headroom");
  for (const id of ["frontend", "electron", "python"]) {
    const step = steps.find((entry) => entry.id === id);
    assert.equal(step["continue-on-error"], true);
    assert.equal(step.shell, "bash");
  }
  const electron = steps.find((step) => step.id === "electron");
  assert.match(electron.run, /--detectOpenHandles/);
  assert.doesNotMatch(electron.run, /--forceExit/);
  const python = steps.find((step) => step.id === "python");
  assert.match(python.run, /--durations=25/);
  assert.match(python.run, /faulthandler_timeout=60/);
  const upload = steps.find((step) => step.name === "Upload test logs");
  assert.equal(upload.if, "always()");
  assert.equal(upload.with.path, "pupu/release-qa-test-logs/");
  assert.equal(steps.find((step) => step.name === "Deterministic release gate").if, "always()");
  const report = steps.find((step) => step.name === "Write deterministic QA report");
  assert.match(report.env.QA_CHECKS_JSON, /steps\.frontend\.outcome/);
  assert.match(report.env.QA_CHECKS_JSON, /steps\.electron\.outcome/);
  assert.doesNotMatch(report.env.QA_CHECKS_JSON, /steps\.\w+\.conclusion/);
});

// Run the actual workflow shell, with only the test executable substituted.
// A successful tee must never turn a failing test process into a green step.
for (const id of ["frontend", "electron", "python"]) {
  test(`${id} preserves a failed command's exit and both log streams`, (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-ci-test-"));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const bin = path.join(temp, "bin");
    fs.mkdirSync(bin);
    for (const command of ["npm", "python"]) {
      fs.writeFileSync(path.join(bin, command),
        "#!/bin/sh\nprintf 'test stdout\\n'\nprintf 'test stderr\\n' >&2\nexit 23\n",
        { mode: 0o755 });
    }
    const step = steps.find((entry) => entry.id === id);
    const cwd = path.join(temp, step["working-directory"]);
    fs.mkdirSync(cwd, { recursive: true });
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", step.run], {
      cwd, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
      encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 23, result.stderr);
    const log = fs.readFileSync(path.join(temp, "pupu/release-qa-test-logs", `${id}.log`), "utf8");
    assert.match(log, /test stdout/);
    assert.match(log, /test stderr/);
  });
}

test("summary surfaces failures, cancellations and unrun tests without claiming success", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-ci-summary-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const summary = path.join(temp, "summary.md");
  const step = steps.find((entry) => entry.name === "Summarize test outcomes");
  assert.equal(step.if, "always()");
  const result = spawnSync("bash", ["-e", "-c", step.run], {
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary,
      FRONTEND_RESULT: "failure", ELECTRON_RESULT: "cancelled", PYTHON_RESULT: "" },
    encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  const text = fs.readFileSync(summary, "utf8");
  assert.match(text, /Frontend \| failure/);
  assert.match(text, /Electron \| cancelled/);
  assert.match(text, /Python backend \| not run/);
});
