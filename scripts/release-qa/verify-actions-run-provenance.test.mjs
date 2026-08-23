import assert from "node:assert/strict";
import test from "node:test";

import { assertGithubActionsRunProvenance } from "./verify-actions-run-provenance.mjs";

const RUN_ID = "554433";
const TAG = "v0.1.10";
const COMMIT = "a".repeat(40);
const WORKFLOW = ".github/workflows/release-qa.yml";

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

test("Actions run provenance binds the exact successful dispatched workflow to the tag commit", () => {
  assert.equal(assertValid(validRun()).id, Number(RUN_ID));
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
