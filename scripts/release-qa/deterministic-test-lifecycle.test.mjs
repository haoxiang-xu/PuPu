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
  assert.equal(job["timeout-minutes"], 45);
  for (const [id, limit] of [["frontend", 10], ["electron", 5], ["python", 10]]) {
    const step = steps.find((entry) => entry.id === id);
    assert.equal(step["timeout-minutes"], limit);
    assert.equal(step["continue-on-error"], true);
    assert.equal(step.shell, "bash");
  }
  const electron = steps.find((step) => step.id === "electron");
  assert.match(electron.run, /--detectOpenHandles/);
  assert.doesNotMatch(electron.run, /--forceExit/);
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
