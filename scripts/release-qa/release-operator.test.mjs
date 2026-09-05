import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RELEASE_OPERATOR_DISPATCH_SCHEMA,
  RELEASE_OPERATOR_PLAN_SCHEMA,
  RELEASE_OPERATOR_STATE_SCHEMA,
  buildReleaseOperatorPlan,
  dispatchReleasePhase,
  observeReleaseRun,
  parseReleaseOperatorArgs,
  projectReleaseOperatorState,
  waitForReleaseRun,
} from "./release-operator.mjs";

const REPOSITORY = "haoxiang-xu/PuPu";
const TAG = "v0.1.10";
const RC_TAG = "v0.1.10-rc.5";
const COMMIT = "a".repeat(40);
const UNCHAIN_REF = "b".repeat(40);
const CANDIDATE_RUN_ID = "33291661782";
const QUALIFICATION_RUN_ID = "33293313755";
const CLI_PATH = fileURLToPath(new URL("./release-operator.mjs", import.meta.url));
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
).version;

const planFor = (phase, overrides = {}) => buildReleaseOperatorPlan({
  phase,
  repo: REPOSITORY,
  tag: TAG,
  packageVersion: "0.1.10",
  ...(phase === "candidate" ? { unchainRef: UNCHAIN_REF } : {}),
  ...(phase === "qualification" ? { candidateRunId: CANDIDATE_RUN_ID, fromTag: "v0.1.9" } : {}),
  ...(phase === "bootstrap" ? { candidateRunId: CANDIDATE_RUN_ID } : {}),
  ...(phase === "stage" ? { candidateRunId: CANDIDATE_RUN_ID, qualificationRunId: QUALIFICATION_RUN_ID } : {}),
  ...overrides,
});

const successfulRun = ({
  id = CANDIDATE_RUN_ID,
  workflow = ".github/workflows/release-qa.yml",
  status = "completed",
  conclusion = "success",
} = {}) => ({
  id: Number(id),
  event: "workflow_dispatch",
  head_branch: TAG,
  head_sha: COMMIT,
  path: `${workflow}@refs/tags/${TAG}`,
  status,
  conclusion,
  html_url: `https://github.com/${REPOSITORY}/actions/runs/${id}`,
});

const successfulJobs = () => ({
  total_count: 1,
  jobs: [{
    id: 9001,
    name: "Final Release QA Report",
    status: "completed",
    conclusion: "success",
    html_url: `https://github.com/${REPOSITORY}/actions/runs/${CANDIDATE_RUN_ID}/job/9001`,
  }],
});

const successfulCandidateArtifacts = () => ({
  total_count: 2,
  artifacts: [
    {
      id: 7001,
      name: "pupu-release-candidate",
      size_in_bytes: 3091773900,
      expired: false,
      archive_download_url: `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/7001/zip`,
    },
    {
      id: 7002,
      name: "release-qa-report",
      size_in_bytes: 301033,
      expired: false,
      archive_download_url: `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/7002/zip`,
    },
  ],
});

test("closed plans map every phase to its exact workflow and inputs without mutation", () => {
  const candidate = planFor("candidate");
  assert.equal(candidate.schema, RELEASE_OPERATOR_PLAN_SCHEMA);
  assert.equal(candidate.mutates, false);
  assert.equal(candidate.workflow, ".github/workflows/release-qa.yml");
  assert.deepEqual(candidate.workflow_inputs, {
    qa_mode: "release-candidate",
    qa_scope: "standard",
    run_unchain_analysis: "true",
    unchain_ref: UNCHAIN_REF,
  });
  assert.equal(candidate.confirmation_required, "START_CANDIDATE");

  assert.deepEqual(planFor("qualification").workflow_inputs, {
    candidate_run_id: CANDIDATE_RUN_ID,
    release_tag: TAG,
    from_tag: "v0.1.9",
  });
  assert.deepEqual(planFor("bootstrap").workflow_inputs, {
    candidate_run_id: CANDIDATE_RUN_ID,
    release_tag: TAG,
    confirmation: "BOOTSTRAP_V0_1_10",
  });
  assert.deepEqual(planFor("stage").workflow_inputs, {
    candidate_run_id: CANDIDATE_RUN_ID,
    release_tag: TAG,
    qualification_run_id: QUALIFICATION_RUN_ID,
  });
  assert.deepEqual(planFor("publish").workflow_inputs, {
    release_tag: TAG,
    confirmation: "PUBLISH",
  });
});

test("plans fail closed on extra input, wrong repository/ref, weak identity, or invalid sequence", () => {
  assert.throws(() => planFor("candidate", { extra: true }), /unsupported keys/);
  assert.throws(() => planFor("candidate", { repo: "other/repo" }), /must equal/);
  assert.throws(() => planFor("candidate", { unchainRef: "dev" }), /40-character/);
  assert.throws(() => planFor("stage", { tag: "v0.1.10-rc.1" }), /not eligible for promotion/);
  assert.throws(() => planFor("stage", { qualificationRunId: CANDIDATE_RUN_ID }), /must be different/);
  assert.throws(() => planFor("qualification", { fromTag: TAG }), /must be lower/);
  assert.throws(() => planFor("bootstrap", { tag: "v0.1.11", packageVersion: "0.1.11" }), /frozen/);
});

test("dispatch uses only the validated tuple and returns the exact URL produced by gh", () => {
  const seen = [];
  const runner = (args) => {
    seen.push(args);
    return {
      status: 0,
      stdout: `https://github.com/${REPOSITORY}/actions/runs/${CANDIDATE_RUN_ID}\n`,
      stderr: "",
    };
  };
  const result = dispatchReleasePhase({
    plan: planFor("candidate"),
    confirmation: "START_CANDIDATE",
    runner,
  });
  assert.equal(result.schema, RELEASE_OPERATOR_DISPATCH_SCHEMA);
  assert.equal(result.run_id, CANDIDATE_RUN_ID);
  assert.equal(result.run_url, `https://github.com/${REPOSITORY}/actions/runs/${CANDIDATE_RUN_ID}`);
  assert.deepEqual(seen, [[
    "workflow", "run", ".github/workflows/release-qa.yml",
    "-R", REPOSITORY,
    "--ref", TAG,
    "-f", "qa_mode=release-candidate",
    "-f", "qa_scope=standard",
    "-f", "run_unchain_analysis=true",
    "-f", `unchain_ref=${UNCHAIN_REF}`,
  ]]);
});

test("dispatch preserves an RC tag while rebuilding the stable package version", () => {
  const seen = [];
  const runner = (args) => {
    seen.push(args);
    return {
      status: 0,
      stdout: `https://github.com/${REPOSITORY}/actions/runs/${CANDIDATE_RUN_ID}\n`,
      stderr: "",
    };
  };

  const result = dispatchReleasePhase({
    plan: planFor("candidate", { tag: RC_TAG }),
    confirmation: "START_CANDIDATE",
    runner,
  });

  assert.equal(result.ref, RC_TAG);
  assert.equal(seen[0][6], RC_TAG);
});

test("dispatch cannot proceed on stale approval or fuzzy run discovery", () => {
  let calls = 0;
  const runner = () => {
    calls += 1;
    return { status: 0, stdout: "workflow dispatched", stderr: "" };
  };
  assert.throws(() => dispatchReleasePhase({
    plan: planFor("stage"),
    confirmation: "START_CANDIDATE",
    runner,
  }), /STAGE_DRAFT/);
  assert.equal(calls, 0);
  assert.throws(() => dispatchReleasePhase({
    plan: planFor("stage"),
    confirmation: "STAGE_DRAFT",
    runner,
  }), /refusing fuzzy run discovery/);
  assert.equal(calls, 1);
});

test("dispatch rejects fabricated plans before invoking GitHub", () => {
  let calls = 0;
  const runner = () => {
    calls += 1;
    return { status: 0, stdout: "", stderr: "" };
  };
  const candidate = planFor("candidate");
  assert.throws(() => dispatchReleasePhase({
    plan: { ...candidate, workflow: ".github/workflows/release-publish.yml" },
    confirmation: "START_CANDIDATE",
    runner,
  }), /workflow does not match the closed projection/);
  assert.throws(() => dispatchReleasePhase({
    plan: {
      ...candidate,
      workflow_inputs: { ...candidate.workflow_inputs, confirmation: "PUBLISH" },
    },
    confirmation: "START_CANDIDATE",
    runner,
  }), /workflow_inputs keys do not match the closed projection/);
  assert.equal(calls, 0);
});

test("state projection binds exact run identity, jobs, and required candidate artifacts", () => {
  const state = projectReleaseOperatorState({
    phase: "candidate",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: CANDIDATE_RUN_ID,
    run: successfulRun(),
    jobs: successfulJobs(),
    artifacts: successfulCandidateArtifacts(),
  });
  assert.equal(state.schema, RELEASE_OPERATOR_STATE_SCHEMA);
  assert.equal(state.run.disposition, "passed");
  assert.deepEqual(state.blocking_reasons, []);
  assert.deepEqual(state.artifacts.map((artifact) => [artifact.id, artifact.name]), [
    ["7001", "pupu-release-candidate"],
    ["7002", "release-qa-report"],
  ]);
});

test("state projection reports approval, failure, and incomplete evidence without guessing readiness", () => {
  const waiting = projectReleaseOperatorState({
    phase: "candidate",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: CANDIDATE_RUN_ID,
    run: successfulRun({ status: "waiting", conclusion: null }),
    jobs: { total_count: 0, jobs: [] },
    artifacts: { total_count: 0, artifacts: [] },
  });
  assert.equal(waiting.run.disposition, "approval-required");
  assert.deepEqual(waiting.blocking_reasons, ["environment-approval-required"]);

  const failure = projectReleaseOperatorState({
    phase: "candidate",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: CANDIDATE_RUN_ID,
    run: successfulRun({ conclusion: "failure" }),
    jobs: {
      total_count: 1,
      jobs: [{ ...successfulJobs().jobs[0], conclusion: "failure" }],
    },
    artifacts: { total_count: 0, artifacts: [] },
  });
  assert.equal(failure.run.disposition, "failed");
  assert.deepEqual(failure.blocking_reasons, ["job-failed:Final Release QA Report"]);

  const incomplete = projectReleaseOperatorState({
    phase: "candidate",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: CANDIDATE_RUN_ID,
    run: successfulRun(),
    jobs: successfulJobs(),
    artifacts: { total_count: 0, artifacts: [] },
  });
  assert.equal(incomplete.run.disposition, "incomplete");
  assert.deepEqual(incomplete.blocking_reasons, [
    "required-artifact-missing:pupu-release-candidate",
    "required-artifact-missing:release-qa-report",
  ]);
});

test("state projection rejects wrong identity, incomplete pagination, malformed jobs, and duplicate artifacts", () => {
  const base = {
    phase: "candidate",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: CANDIDATE_RUN_ID,
    run: successfulRun(),
    jobs: successfulJobs(),
    artifacts: successfulCandidateArtifacts(),
  };
  assert.throws(() => projectReleaseOperatorState({
    ...base,
    run: { ...base.run, path: ".github/workflows/other.yml" },
  }), /workflow path/);
  assert.throws(() => projectReleaseOperatorState({
    ...base,
    run: { ...base.run, event: "push" },
  }), /workflow_dispatch/);
  assert.throws(() => projectReleaseOperatorState({
    ...base,
    run: { ...base.run, head_sha: "c".repeat(40) },
  }), /commit/);
  assert.throws(() => projectReleaseOperatorState({
    ...base,
    jobs: { total_count: 2, jobs: successfulJobs().jobs },
  }), /complete in one page/);
  assert.throws(() => projectReleaseOperatorState({
    ...base,
    jobs: { total_count: 1, jobs: [{ ...successfulJobs().jobs[0], status: "mystery" }] },
  }), /unsupported status/);
  const duplicate = successfulCandidateArtifacts();
  duplicate.artifacts[1].name = duplicate.artifacts[0].name;
  assert.throws(() => projectReleaseOperatorState({ ...base, artifacts: duplicate }), /duplicate Actions artifact name/);
});

test("stage and publish success require the corresponding exact GitHub Release state", () => {
  const release = {
    tagName: TAG,
    name: "PuPu 0.1.10",
    isDraft: true,
    isPrerelease: false,
    url: `https://github.com/${REPOSITORY}/releases/tag/${TAG}`,
    publishedAt: null,
    targetCommitish: COMMIT,
  };
  const stage = projectReleaseOperatorState({
    phase: "stage",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: "33316781866",
    run: successfulRun({ id: "33316781866", workflow: ".github/workflows/release-stage.yml" }),
    jobs: successfulJobs(),
    artifacts: { total_count: 0, artifacts: [] },
    release,
  });
  assert.equal(stage.github_release.is_draft, true);
  assert.throws(() => projectReleaseOperatorState({
    phase: "publish",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: "33316781867",
    run: successfulRun({ id: "33316781867", workflow: ".github/workflows/release-publish.yml" }),
    jobs: successfulJobs(),
    artifacts: { total_count: 0, artifacts: [] },
    release,
  }), /public Release/);
});

test("live observer performs only exact read calls and consumes a complete single-page response", () => {
  const seen = [];
  const runner = (args) => {
    seen.push(args);
    const target = args[1];
    if (target.endsWith(`/actions/runs/${CANDIDATE_RUN_ID}`)) {
      return { status: 0, stdout: JSON.stringify(successfulRun()), stderr: "" };
    }
    if (target.includes("/jobs?")) {
      return { status: 0, stdout: JSON.stringify(successfulJobs()), stderr: "" };
    }
    if (target.includes("/artifacts?")) {
      return { status: 0, stdout: JSON.stringify(successfulCandidateArtifacts()), stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${args.join(" ")}` };
  };
  const state = observeReleaseRun({
    phase: "candidate",
    repo: REPOSITORY,
    tag: TAG,
    commit: COMMIT,
    runId: CANDIDATE_RUN_ID,
    runner,
  });
  assert.equal(state.run.disposition, "passed");
  assert.equal(seen.length, 3);
  assert.equal(seen.every((args) => args[0] === "api"), true);
});

test("wait resumes the same run without dispatch and returns a bounded timeout", async () => {
  let clock = 0;
  const states = [
    { run: { status: "queued", disposition: "running" } },
    { run: { status: "waiting", disposition: "approval-required" } },
    { run: { status: "completed", disposition: "passed" } },
  ];
  let index = 0;
  const completed = await waitForReleaseRun({
    observer: async () => states[Math.min(index++, states.length - 1)],
    timeoutMs: 500,
    intervalMs: 50,
    now: () => clock,
    sleep: async (delay) => { clock += delay; },
  });
  assert.equal(completed.wait_timed_out, false);
  assert.equal(completed.run.disposition, "passed");

  clock = 0;
  let observations = 0;
  const timedOut = await waitForReleaseRun({
    observer: async () => {
      observations += 1;
      return { run: { status: "in_progress", disposition: "running" } };
    },
    timeoutMs: 100,
    intervalMs: 50,
    now: () => clock,
    sleep: async (delay) => { clock += delay; },
  });
  assert.equal(timedOut.wait_timed_out, true);
  assert.equal(observations, 3);
});

test("a retry requires another explicit dispatch and preserves distinct run identities", () => {
  const urls = [
    `https://github.com/${REPOSITORY}/actions/runs/1001`,
    `https://github.com/${REPOSITORY}/actions/runs/1002`,
  ];
  let calls = 0;
  const runner = () => ({ status: 0, stdout: `${urls[calls++]}\n`, stderr: "" });
  const first = dispatchReleasePhase({ plan: planFor("candidate"), confirmation: "START_CANDIDATE", runner });
  const second = dispatchReleasePhase({ plan: planFor("candidate"), confirmation: "START_CANDIDATE", runner });
  assert.equal(first.run_id, "1001");
  assert.equal(second.run_id, "1002");
  assert.notEqual(first.run_id, second.run_id);
});

test("CLI parsing rejects positional, duplicate, and unknown arguments", () => {
  assert.throws(() => parseReleaseOperatorArgs([]), /command is required/);
  assert.throws(() => parseReleaseOperatorArgs(["retry"]), /must be plan/);
  assert.throws(() => parseReleaseOperatorArgs(["plan", "tag"]), /invalid argument/);
  assert.throws(() => parseReleaseOperatorArgs([
    "plan", "--phase", "candidate", "--phase", "stage", "--repo", REPOSITORY, "--tag", TAG,
  ]), /only be provided once/);
  assert.throws(() => parseReleaseOperatorArgs([
    "plan", "--phase", "candidate", "--repo", REPOSITORY, "--tag", TAG, "--latest", "true",
  ]), /unsupported arguments/);
});

test("CLI plan is read-only JSON and both agent entrypoints share one canonical workflow", () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH,
    "plan",
    "--phase", "candidate",
    "--repo", REPOSITORY,
    "--tag", `v${PACKAGE_VERSION}-rc.1`,
    "--unchain-ref", UNCHAIN_REF,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).schema, RELEASE_OPERATOR_PLAN_SCHEMA);

  const codexSkill = fs.readFileSync(".agents/skills/release-operator/SKILL.md", "utf8");
  const claudeSkill = fs.readFileSync(".claude/skills/release-operator/SKILL.md", "utf8");
  assert.match(codexSkill, /scripts\/release-qa\/release-operator\.mjs/);
  assert.match(claudeSkill, /\.agents\/skills\/release-operator\/SKILL\.md/);
  assert.match(claudeSkill, /single canonical workflow/);
});

test("CLI plan projects an RC package version to its stable release base", () => {
  const fixtureDirectory = fs.mkdtempSync("release-operator-plan-");
  try {
    fs.writeFileSync(
      `${fixtureDirectory}/package.json`,
      JSON.stringify({ version: "0.1.10-rc.6" }),
    );
    for (const tag of [TAG, RC_TAG]) {
      const result = spawnSync(process.execPath, [
        CLI_PATH,
        "plan",
        "--phase", "candidate",
        "--repo", REPOSITORY,
        "--tag", tag,
        "--unchain-ref", UNCHAIN_REF,
      ], { cwd: fixtureDirectory, encoding: "utf8" });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).ref, tag);
    }
  } finally {
    fs.rmSync(fixtureDirectory, { force: true, recursive: true });
  }
});
