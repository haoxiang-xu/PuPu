import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertGithubActionsRunProvenance } from "./verify-actions-run-provenance.mjs";

const RUN_ID = "554433";
const TAG = "v0.1.10";
const COMMIT = "a".repeat(40);
const WORKFLOW = ".github/workflows/release-qa.yml";
const CLI_PATH = fileURLToPath(new URL("./verify-actions-run-provenance.mjs", import.meta.url));

const validRun = () => ({
  id: Number(RUN_ID),
  conclusion: "success",
  event: "workflow_dispatch",
  head_sha: COMMIT,
  head_branch: TAG,
  path: `${WORKFLOW}@refs/tags/${TAG}`,
});

const assertValid = (run) => assertGithubActionsRunProvenance({
  run,
  runId: RUN_ID,
  tag: TAG,
  commit: COMMIT,
  workflowPath: WORKFLOW,
});

const runCli = (run) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    CLI_PATH,
    "--run-id", RUN_ID,
    "--tag", TAG,
    "--commit", COMMIT,
    "--workflow-path", WORKFLOW,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(JSON.stringify(run));
});

test("Actions run provenance binds the exact successful dispatched workflow to the tag commit", () => {
  assert.equal(assertValid(validRun()).id, Number(RUN_ID));
  const runWithoutRefSuffix = validRun();
  runWithoutRefSuffix.path = WORKFLOW;
  assert.equal(assertValid(runWithoutRefSuffix).id, Number(RUN_ID));
});

test("Actions run provenance CLI reads a piped run response under Node 24", async () => {
  const result = await runCli(validRun());
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /verified Actions run 554433/);
});

test("Actions run provenance rejects a mismatched identity, result, event, tag, commit, or workflow", () => {
  const cases = [
    ["run ID", (run) => { run.id = 1; }, /run ID/],
    ["conclusion", (run) => { run.conclusion = "failure"; }, /conclusion/],
    ["event", (run) => { run.event = "push"; }, /event/],
    ["commit", (run) => { run.head_sha = "b".repeat(40); }, /head SHA/],
    ["tag", (run) => { run.head_branch = "main"; }, /head branch/],
    ["workflow", (run) => { run.path = ".github/workflows/other.yml@refs/tags/v0.1.10"; }, /workflow path/],
  ];
  for (const [, mutate, expected] of cases) {
    const run = validRun();
    mutate(run);
    assert.throws(() => assertValid(run), expected);
  }
});
