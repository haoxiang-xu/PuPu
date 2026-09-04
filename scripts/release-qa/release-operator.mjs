#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { resolveReleaseCandidateRef } from "./release-candidate-ref.mjs";

export const RELEASE_OPERATOR_PLAN_SCHEMA = "pupu.release-operator-plan.v1";
export const RELEASE_OPERATOR_DISPATCH_SCHEMA = "pupu.release-operator-dispatch.v1";
export const RELEASE_OPERATOR_STATE_SCHEMA = "pupu.release-operator-state.v1";

const DEFAULT_REPOSITORY = "haoxiang-xu/PuPu";
const RUN_ID_PATTERN = /^[1-9]\d*$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const UNCHAIN_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const RELEASE_RUN_URL_PATTERN = /^https:\/\/github\.com\/haoxiang-xu\/PuPu\/actions\/runs\/(?<runId>[1-9]\d*)$/;
const RUN_STATUSES = new Set(["queued", "in_progress", "completed", "waiting", "pending", "requested"]);
const RUN_CONCLUSIONS = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "stale",
  "neutral",
  "startup_failure",
]);

const PHASES = Object.freeze({
  candidate: Object.freeze({
    workflow: ".github/workflows/release-qa.yml",
    confirmation: "START_CANDIDATE",
    planKeys: Object.freeze(["phase", "repo", "tag", "packageVersion", "unchainRef"]),
    requiredArtifacts: Object.freeze(["pupu-release-candidate", "release-qa-report"]),
  }),
  qualification: Object.freeze({
    workflow: ".github/workflows/release-qualification.yml",
    confirmation: "START_QUALIFICATION",
    planKeys: Object.freeze(["phase", "repo", "tag", "packageVersion", "candidateRunId", "fromTag"]),
    requiredArtifacts: Object.freeze(["pupu-release-qualification"]),
  }),
  bootstrap: Object.freeze({
    workflow: ".github/workflows/release-bootstrap-qualification.yml",
    confirmation: "START_BOOTSTRAP_QUALIFICATION",
    planKeys: Object.freeze(["phase", "repo", "tag", "packageVersion", "candidateRunId"]),
    requiredArtifacts: Object.freeze(["pupu-release-qualification"]),
  }),
  stage: Object.freeze({
    workflow: ".github/workflows/release-stage.yml",
    confirmation: "STAGE_DRAFT",
    planKeys: Object.freeze(["phase", "repo", "tag", "packageVersion", "candidateRunId", "qualificationRunId"]),
    requiredArtifacts: Object.freeze([]),
  }),
  publish: Object.freeze({
    workflow: ".github/workflows/release-publish.yml",
    confirmation: "PUBLISH_RELEASE",
    planKeys: Object.freeze(["phase", "repo", "tag", "packageVersion"]),
    requiredArtifacts: Object.freeze([]),
  }),
});

const requiredExactString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string without surrounding whitespace`);
  }
  return value;
};

const requiredRunId = (value, label) => {
  const runId = requiredExactString(value, label);
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`${label} must be a positive decimal GitHub Actions run ID`);
  }
  return runId;
};

const requiredCommit = (value) => {
  const commit = requiredExactString(value, "release commit");
  if (!GIT_SHA_PATTERN.test(commit)) {
    throw new Error("release commit must be a full lowercase Git SHA");
  }
  return commit;
};

const requirePhase = (value) => {
  const phase = requiredExactString(value, "release phase");
  if (!Object.prototype.hasOwnProperty.call(PHASES, phase)) {
    throw new Error(`release phase must be one of: ${Object.keys(PHASES).join(", ")}`);
  }
  return phase;
};

const requireRepository = (value = DEFAULT_REPOSITORY) => {
  const repository = requiredExactString(value, "repository");
  if (repository !== DEFAULT_REPOSITORY) {
    throw new Error(`repository must equal ${DEFAULT_REPOSITORY}`);
  }
  return repository;
};

const assertClosedKeys = (value, allowedKeys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unsupported keys: ${unknownKeys.sort().join(", ")}`);
  }
};

const assertExactProjection = (actual, expected, label) => {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error(`${label} must be an object`);
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${label} keys do not match the closed projection`);
  }
  for (const key of expectedKeys) {
    const expectedValue = expected[key];
    if (expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue)) {
      assertExactProjection(actual[key], expectedValue, `${label}.${key}`);
    } else if (actual[key] !== expectedValue) {
      throw new Error(`${label}.${key} does not match the closed projection`);
    }
  }
};

const stableVersionTuple = (tag, label) => {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(requiredExactString(tag, label));
  if (!match) throw new Error(`${label} must be a stable vX.Y.Z tag`);
  return match.slice(1).map((part) => Number(part));
};

const stablePackageVersion = (value, label) => {
  const match = /^(?<baseVersion>(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))(?:-rc\.[1-9]\d*)?$/.exec(
    requiredExactString(value, label),
  );
  if (!match) {
    throw new Error(`${label} must be a stable X.Y.Z version or an X.Y.Z-rc.N release candidate`);
  }
  return match.groups.baseVersion;
};

const packageVersionForReleaseRef = (ref) => {
  const releaseRef = requiredExactString(ref, "release operator plan ref");
  if (!releaseRef.startsWith("v")) {
    throw new Error("release operator plan ref must start with v");
  }
  return stablePackageVersion(releaseRef.slice(1), "release operator plan ref");
};

const compareVersionTuple = (left, right) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

const workflowInputsForPlan = (phase, options) => {
  if (phase === "candidate") {
    const unchainRef = requiredExactString(options.unchainRef, "Unchain revision");
    if (!UNCHAIN_REVISION_PATTERN.test(unchainRef)) {
      throw new Error("Unchain revision must be a full lowercase 40-character Git SHA");
    }
    return {
      qa_mode: "release-candidate",
      qa_scope: "standard",
      run_unchain_analysis: "true",
      unchain_ref: unchainRef,
    };
  }
  if (phase === "qualification") {
    const targetTuple = stableVersionTuple(`v${options.packageVersion}`, "package version tag");
    const fromTuple = stableVersionTuple(options.fromTag, "qualification source tag");
    if (compareVersionTuple(fromTuple, targetTuple) >= 0) {
      throw new Error("qualification source tag must be lower than the target package version");
    }
    return {
      candidate_run_id: requiredRunId(options.candidateRunId, "candidate run ID"),
      release_tag: options.tag,
      from_tag: options.fromTag,
    };
  }
  if (phase === "bootstrap") {
    if (options.tag !== "v0.1.10") {
      throw new Error("bootstrap qualification is frozen to v0.1.10");
    }
    return {
      candidate_run_id: requiredRunId(options.candidateRunId, "candidate run ID"),
      release_tag: options.tag,
      confirmation: "BOOTSTRAP_V0_1_10",
    };
  }
  if (phase === "stage") {
    const candidateRunId = requiredRunId(options.candidateRunId, "candidate run ID");
    const qualificationRunId = requiredRunId(options.qualificationRunId, "qualification run ID");
    if (candidateRunId === qualificationRunId) {
      throw new Error("candidate and qualification runs must be different");
    }
    return {
      candidate_run_id: candidateRunId,
      release_tag: options.tag,
      qualification_run_id: qualificationRunId,
    };
  }
  return {
    release_tag: options.tag,
    confirmation: "PUBLISH",
  };
};

export function buildReleaseOperatorPlan(options = {}) {
  const phase = requirePhase(options.phase);
  const config = PHASES[phase];
  assertClosedKeys(options, config.planKeys, `${phase} plan`);
  const repository = requireRepository(options.repo);
  const policy = phase === "stage" || phase === "publish" ? "promotion" : "candidate";
  const releaseRef = resolveReleaseCandidateRef({
    tag: options.tag,
    packageVersion: options.packageVersion,
    policy,
  });
  const workflowInputs = workflowInputsForPlan(phase, { ...options, tag: releaseRef.tag });

  return Object.freeze({
    schema: RELEASE_OPERATOR_PLAN_SCHEMA,
    mutates: false,
    phase,
    repository,
    ref: releaseRef.tag,
    workflow: config.workflow,
    workflow_inputs: Object.freeze(workflowInputs),
    confirmation_required: config.confirmation,
  });
}

const rebuildReleaseOperatorPlan = (plan) => {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("dispatch requires a validated release operator plan");
  }
  const phase = requirePhase(plan.phase);
  const ref = requiredExactString(plan.ref, "release operator plan ref");
  if (!ref.startsWith("v")) throw new Error("release operator plan ref must start with v");
  if (!plan.workflow_inputs || typeof plan.workflow_inputs !== "object" || Array.isArray(plan.workflow_inputs)) {
    throw new Error("release operator plan workflow_inputs must be an object");
  }
  const options = {
    phase,
    repo: plan.repository,
    tag: ref,
    packageVersion: packageVersionForReleaseRef(ref),
  };
  if (phase === "candidate") options.unchainRef = plan.workflow_inputs.unchain_ref;
  if (phase === "qualification") {
    options.candidateRunId = plan.workflow_inputs.candidate_run_id;
    options.fromTag = plan.workflow_inputs.from_tag;
  }
  if (phase === "bootstrap") options.candidateRunId = plan.workflow_inputs.candidate_run_id;
  if (phase === "stage") {
    options.candidateRunId = plan.workflow_inputs.candidate_run_id;
    options.qualificationRunId = plan.workflow_inputs.qualification_run_id;
  }
  return buildReleaseOperatorPlan(options);
};

export function defaultGhRunner(args, { input } = {}) {
  return spawnSync("gh", args, {
    encoding: "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
}

const runGh = (args, { runner = defaultGhRunner, input } = {}) => {
  const result = runner(args, { input });
  if (!result || typeof result !== "object") throw new Error("gh runner returned no result");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "gh command failed").trim();
    throw new Error(detail || "gh command failed");
  }
  return String(result.stdout || "").trim();
};

export function dispatchReleasePhase({ plan, confirmation, runner = defaultGhRunner } = {}) {
  const validatedPlan = rebuildReleaseOperatorPlan(plan);
  assertExactProjection(plan, validatedPlan, "release operator plan");
  if (confirmation !== validatedPlan.confirmation_required) {
    throw new Error(`dispatch confirmation must equal ${validatedPlan.confirmation_required}`);
  }
  const args = [
    "workflow", "run", validatedPlan.workflow,
    "-R", validatedPlan.repository,
    "--ref", validatedPlan.ref,
  ];
  for (const [key, value] of Object.entries(validatedPlan.workflow_inputs)) {
    args.push("-f", `${key}=${value}`);
  }
  const stdout = runGh(args, { runner });
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const runUrl = lines.find((line) => RELEASE_RUN_URL_PATTERN.test(line));
  const match = runUrl ? RELEASE_RUN_URL_PATTERN.exec(runUrl) : null;
  if (!match) {
    throw new Error("GitHub did not return the exact created workflow run URL; refusing fuzzy run discovery");
  }
  return Object.freeze({
    schema: RELEASE_OPERATOR_DISPATCH_SCHEMA,
    phase: validatedPlan.phase,
    repository: validatedPlan.repository,
    ref: validatedPlan.ref,
    workflow: validatedPlan.workflow,
    run_id: match.groups.runId,
    run_url: runUrl,
  });
}

const parseJsonOutput = (text, label) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} was not valid JSON`);
  }
};

const runGhJson = (args, label, runner) => parseJsonOutput(runGh(args, { runner }), label);

const normalizeWorkflowPath = (value) => typeof value === "string" ? value.split("@", 1)[0] : "";

const assertStatusConclusion = (status, conclusion, label) => {
  if (!RUN_STATUSES.has(status)) throw new Error(`${label} has unsupported status: ${status}`);
  if (status === "completed") {
    if (!RUN_CONCLUSIONS.has(conclusion)) throw new Error(`${label} must have a supported conclusion when completed`);
  } else if (conclusion !== null && conclusion !== "") {
    throw new Error(`${label} must not have a conclusion before completion`);
  }
};

const normalizeJobs = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.jobs)) {
    throw new Error("Actions jobs response must contain a jobs array");
  }
  if (!Number.isInteger(payload.total_count) || payload.total_count !== payload.jobs.length) {
    throw new Error("Actions jobs response must be complete in one page");
  }
  const seenIds = new Set();
  return payload.jobs.map((job) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("Actions job must be an object");
    const id = requiredRunId(String(job.id || ""), "job ID");
    if (seenIds.has(id)) throw new Error(`duplicate Actions job ID: ${id}`);
    seenIds.add(id);
    const name = requiredExactString(job.name, "job name");
    assertStatusConclusion(job.status, job.conclusion, `job ${name}`);
    return Object.freeze({
      id,
      name,
      status: job.status,
      conclusion: job.conclusion || null,
      url: requiredExactString(job.html_url, `job ${name} URL`),
    });
  });
};

const normalizeArtifacts = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.artifacts)) {
    throw new Error("Actions artifacts response must contain an artifacts array");
  }
  if (!Number.isInteger(payload.total_count) || payload.total_count !== payload.artifacts.length) {
    throw new Error("Actions artifacts response must be complete in one page");
  }
  const seenIds = new Set();
  const seenNames = new Set();
  return payload.artifacts.map((artifact) => {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      throw new Error("Actions artifact must be an object");
    }
    const id = requiredRunId(String(artifact.id || ""), "artifact ID");
    const name = requiredExactString(artifact.name, "artifact name");
    if (seenIds.has(id)) throw new Error(`duplicate Actions artifact ID: ${id}`);
    if (seenNames.has(name)) throw new Error(`duplicate Actions artifact name: ${name}`);
    seenIds.add(id);
    seenNames.add(name);
    if (!Number.isInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0) {
      throw new Error(`artifact ${name} size must be a non-negative integer`);
    }
    if (typeof artifact.expired !== "boolean") throw new Error(`artifact ${name} expired flag must be boolean`);
    return Object.freeze({
      id,
      name,
      size_bytes: artifact.size_in_bytes,
      expired: artifact.expired,
      archive_url: requiredExactString(artifact.archive_download_url, `artifact ${name} archive URL`),
    });
  });
};

const normalizeRelease = (release, phase, tag, commit) => {
  if (!release || typeof release !== "object" || Array.isArray(release)) {
    throw new Error(`${phase} success requires GitHub Release metadata`);
  }
  if (release.tagName !== tag) throw new Error("GitHub Release tag does not match the requested tag");
  if (release.targetCommitish !== commit) throw new Error("GitHub Release target does not match the requested commit");
  if (typeof release.isDraft !== "boolean" || typeof release.isPrerelease !== "boolean") {
    throw new Error("GitHub Release draft/prerelease flags must be boolean");
  }
  if (release.isPrerelease) throw new Error("stable release operation cannot target a prerelease");
  if (phase === "stage" && release.isDraft !== true) throw new Error("stage success requires a Draft Release");
  if (phase === "publish" && release.isDraft !== false) throw new Error("publish success requires a public Release");
  return Object.freeze({
    tag: release.tagName,
    name: requiredExactString(release.name, "GitHub Release name"),
    is_draft: release.isDraft,
    is_prerelease: release.isPrerelease,
    url: requiredExactString(release.url, "GitHub Release URL"),
    published_at: release.publishedAt || null,
    target_commit: release.targetCommitish,
  });
};

export function projectReleaseOperatorState({ phase, repo, tag, commit, runId, run, jobs, artifacts, release = null } = {}) {
  const selectedPhase = requirePhase(phase);
  const config = PHASES[selectedPhase];
  const repository = requireRepository(repo);
  const expectedRunId = requiredRunId(runId, "run ID");
  const expectedTag = requiredExactString(tag, "release tag");
  const expectedCommit = requiredCommit(commit);
  if (!run || typeof run !== "object" || Array.isArray(run)) throw new Error("Actions run response must be an object");
  if (String(run.id) !== expectedRunId) throw new Error("Actions run ID does not match the requested run");
  if (run.event !== "workflow_dispatch") throw new Error("release operation run event must be workflow_dispatch");
  if (run.head_branch !== expectedTag) throw new Error("Actions run tag does not match the requested tag");
  if (run.head_sha !== expectedCommit) throw new Error("Actions run commit does not match the requested commit");
  if (normalizeWorkflowPath(run.path) !== config.workflow) {
    throw new Error(`Actions workflow path must equal ${config.workflow}`);
  }
  assertStatusConclusion(run.status, run.conclusion, "Actions run");

  const normalizedJobs = normalizeJobs(jobs);
  const normalizedArtifacts = normalizeArtifacts(artifacts);
  const artifactNames = new Set(normalizedArtifacts.map((artifact) => artifact.name));
  const missingArtifacts = config.requiredArtifacts.filter((name) => !artifactNames.has(name));
  const failedJobs = normalizedJobs.filter((job) => job.status === "completed" && job.conclusion !== "success");
  const blockingReasons = [];
  if (run.status === "waiting") blockingReasons.push("environment-approval-required");
  for (const job of failedJobs) blockingReasons.push(`job-failed:${job.name}`);
  if (run.status === "completed" && run.conclusion === "success") {
    for (const name of missingArtifacts) blockingReasons.push(`required-artifact-missing:${name}`);
  }

  let disposition = "running";
  if (run.status === "waiting") disposition = "approval-required";
  if (run.status === "completed" && run.conclusion !== "success") disposition = "failed";
  if (run.status === "completed" && run.conclusion === "success" && blockingReasons.length === 0) disposition = "passed";
  if (run.status === "completed" && run.conclusion === "success" && blockingReasons.length > 0) disposition = "incomplete";

  let normalizedRelease = null;
  if ((selectedPhase === "stage" || selectedPhase === "publish") && run.status === "completed" && run.conclusion === "success") {
    normalizedRelease = normalizeRelease(release, selectedPhase, expectedTag, expectedCommit);
  }

  return Object.freeze({
    schema: RELEASE_OPERATOR_STATE_SCHEMA,
    phase: selectedPhase,
    repository,
    workflow: config.workflow,
    release: Object.freeze({ tag: expectedTag, commit: expectedCommit }),
    run: Object.freeze({
      id: expectedRunId,
      url: requiredExactString(run.html_url, "Actions run URL"),
      status: run.status,
      conclusion: run.conclusion || null,
      disposition,
    }),
    jobs: Object.freeze(normalizedJobs),
    artifacts: Object.freeze(normalizedArtifacts),
    github_release: normalizedRelease,
    blocking_reasons: Object.freeze(blockingReasons),
  });
}

export function observeReleaseRun({ phase, repo = DEFAULT_REPOSITORY, tag, commit, runId, runner = defaultGhRunner } = {}) {
  const selectedPhase = requirePhase(phase);
  const repository = requireRepository(repo);
  const expectedRunId = requiredRunId(runId, "run ID");
  const encodedRepo = repository.split("/").map(encodeURIComponent).join("/");
  const run = runGhJson(["api", `repos/${encodedRepo}/actions/runs/${expectedRunId}`], "Actions run response", runner);
  const jobs = runGhJson(["api", `repos/${encodedRepo}/actions/runs/${expectedRunId}/jobs?per_page=100`], "Actions jobs response", runner);
  const artifacts = runGhJson(["api", `repos/${encodedRepo}/actions/runs/${expectedRunId}/artifacts?per_page=100`], "Actions artifacts response", runner);
  let release = null;
  if ((selectedPhase === "stage" || selectedPhase === "publish") && run.status === "completed" && run.conclusion === "success") {
    release = runGhJson([
      "release", "view", tag, "-R", repository,
      "--json", "tagName,name,isDraft,isPrerelease,url,publishedAt,targetCommitish",
    ], "GitHub Release response", runner);
  }
  return projectReleaseOperatorState({
    phase: selectedPhase,
    repo: repository,
    tag,
    commit,
    runId: expectedRunId,
    run,
    jobs,
    artifacts,
    release,
  });
}

export async function waitForReleaseRun({ observer, timeoutMs, intervalMs, now = Date.now, sleep } = {}) {
  if (typeof observer !== "function") throw new Error("wait observer must be a function");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("wait timeout must be a positive integer");
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) throw new Error("wait interval must be a positive integer");
  const wait = sleep || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  const startedAt = now();
  let latest = await observer();
  while (latest.run.status !== "completed") {
    if (now() - startedAt >= timeoutMs) {
      return Object.freeze({ ...latest, wait_timed_out: true });
    }
    await wait(intervalMs);
    latest = await observer();
  }
  return Object.freeze({ ...latest, wait_timed_out: false });
}

export function parseReleaseOperatorArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0) throw new Error("release operator command is required");
  const command = argv[0];
  if (!["plan", "dispatch", "status", "wait"].includes(command)) {
    throw new Error("release operator command must be plan, dispatch, status, or wait");
  }
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    const normalizedKey = key.slice(2);
    if (Object.prototype.hasOwnProperty.call(values, normalizedKey)) {
      throw new Error(`argument --${normalizedKey} may only be provided once`);
    }
    values[normalizedKey] = value;
  }
  const common = ["phase", "repo", "tag"];
  const commandKeys = {
    plan: [...common, "unchain-ref", "candidate-run-id", "qualification-run-id", "from-tag"],
    dispatch: [...common, "unchain-ref", "candidate-run-id", "qualification-run-id", "from-tag", "confirm"],
    status: [...common, "commit", "run-id"],
    wait: [...common, "commit", "run-id", "timeout-seconds", "poll-seconds"],
  };
  const allowed = new Set(commandKeys[command]);
  const unknown = Object.keys(values).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unsupported arguments: ${unknown.sort().map((key) => `--${key}`).join(", ")}`);
  for (const key of common) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  return Object.freeze({ command, values: Object.freeze(values) });
}

const readPackageVersion = () => {
  const packagePath = path.resolve("package.json");
  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  return stablePackageVersion(parsed.version, "package version");
};

const planOptionsFromCli = (values) => {
  const options = {
    phase: values.phase,
    repo: values.repo,
    tag: values.tag,
    packageVersion: readPackageVersion(),
  };
  if (values["unchain-ref"]) options.unchainRef = values["unchain-ref"];
  if (values["candidate-run-id"]) options.candidateRunId = values["candidate-run-id"];
  if (values["qualification-run-id"]) options.qualificationRunId = values["qualification-run-id"];
  if (values["from-tag"]) options.fromTag = values["from-tag"];
  return options;
};

const positiveSeconds = (value, fallback, label) => {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} must be a positive integer`);
  return Number(value);
};

async function main() {
  const { command, values } = parseReleaseOperatorArgs(process.argv.slice(2));
  if (command === "plan") {
    console.log(JSON.stringify(buildReleaseOperatorPlan(planOptionsFromCli(values)), null, 2));
    return;
  }
  if (command === "dispatch") {
    const plan = buildReleaseOperatorPlan(planOptionsFromCli(values));
    console.log(JSON.stringify(dispatchReleasePhase({ plan, confirmation: values.confirm }), null, 2));
    return;
  }
  const observe = () => observeReleaseRun({
    phase: values.phase,
    repo: values.repo,
    tag: values.tag,
    commit: values.commit,
    runId: values["run-id"],
  });
  if (command === "status") {
    console.log(JSON.stringify(observe(), null, 2));
    return;
  }
  const timeoutSeconds = positiveSeconds(values["timeout-seconds"], 10800, "wait timeout seconds");
  const pollSeconds = positiveSeconds(values["poll-seconds"], 20, "wait poll seconds");
  const state = await waitForReleaseRun({
    observer: observe,
    timeoutMs: timeoutSeconds * 1000,
    intervalMs: pollSeconds * 1000,
  });
  console.log(JSON.stringify(state, null, 2));
  if (state.wait_timed_out || state.run.disposition === "failed" || state.run.disposition === "incomplete") {
    process.exitCode = 1;
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main().catch((error) => {
    console.error(`[release-operator] ${error.message || String(error)}`);
    process.exitCode = 1;
  });
}
