import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";
import { buildReleaseOperatorPlan, dispatchReleasePhase, projectReleaseOperatorState } from "./release-operator.mjs";
import { validateReleaseTools, validateToolchainExecution } from "./release-toolchain.mjs";

const release = { tag: "v0.1.11", commit: "a".repeat(40) };
const tools = { tag: "v0.1.11-tools.1", commit: "b".repeat(40) };

test("execution identity rejects mutable branches, wrong version/SHA and malformed tools", () => {
  const input = { releaseTag: release.tag, releaseCommit: release.commit, refType: "tag", refName: tools.tag,
    sha: tools.commit, checkoutSha: tools.commit };
  assert.deepEqual(validateToolchainExecution(input), tools);
  assert.deepEqual(validateReleaseTools(release, release), release);
  for (const change of [
    { refType: "branch" }, { refName: "dev" }, { refName: "v0.1.12-tools.1" }, { refName: "v0.1.11-tools.0" },
    { refName: "v0.1.11-tools.01" }, { refName: "v0.1.11-tools.1/evil" }, { refName: "v0.1.11-rc.1" },
    { checkoutSha: "c".repeat(40) }, { sha: "HEAD", checkoutSha: "HEAD" }, { refName: release.tag },
  ]) assert.throws(() => validateToolchainExecution({ ...input, ...change }));
  for (const invalid of [{ ...tools, extra: true }, { tag: tools.tag }, { ...tools, commit: [tools.commit] }, null]) {
    assert.throws(() => validateReleaseTools(invalid, release));
  }
});

test("toolchain CLI verifies real local Git checkout and independently resolved product tag", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-toolchain-git-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "--quiet");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "product");
    const productSha = git("rev-parse", "HEAD");
    git("tag", release.tag);
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "tools");
    const toolsSha = git("rev-parse", "HEAD");
    const invoke = (env, extra = []) => spawnSync(process.execPath,
      [path.resolve("scripts/release-qa/release-toolchain.mjs"), "--release-tag", release.tag, ...extra],
      { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: tools.tag, GITHUB_SHA: toolsSha, ...env } });
    const valid = invoke({});
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout.trim(), productSha);
    assert.notEqual(invoke({ GITHUB_SHA: productSha }).status, 0);
    assert.notEqual(invoke({}, ["--release-commit", toolsSha]).status, 0);
    assert.notEqual(invoke({ GITHUB_REF_TYPE: "branch" }).status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("operator can freeze qualification tools without changing the product tag", () => {
  const plan = buildReleaseOperatorPlan({ phase: "qualification", tag: "v0.1.11", packageVersion: "0.1.11",
    candidateRunId: "35299965095", fromTag: "v0.1.10", toolsTag: "v0.1.11-tools.1" });
  assert.equal(plan.ref, "v0.1.11-tools.1");
  assert.equal(plan.workflow_inputs.release_tag, "v0.1.11");
  let invoked;
  dispatchReleasePhase({ plan, confirmation: "START_QUALIFICATION", runner: (args) => {
    invoked = args; return { status: 0, stdout: "https://github.com/haoxiang-xu/PuPu/actions/runs/987654" };
  } });
  assert.equal(invoked[invoked.indexOf("--ref") + 1], "v0.1.11-tools.1");
});

test("every required macOS restart target has a producer and blocks receipt on failure", () => {
  const workflow = YAML.parse(fs.readFileSync(".github/workflows/release-qualification.yml", "utf8"));
  const job = workflow.jobs["macos-restart-update"];
  assert.ok(job, "missing macOS restart producer");
  assert.deepEqual(job.strategy.matrix.include, [
    { target_id: "macos-arm64", runner: "macos-latest" },
    { target_id: "macos-x64", runner: "macos-15-intel" },
  ]);
  assert.equal(job.secrets, "inherit");
  assert.ok(workflow.jobs["qualification-receipt"].needs.includes("macos-restart-update"));
  assert.match(workflow.jobs["qualification-receipt"].steps.at(-1).run, /MACOS_RESTART_UPDATE_RESULT/);
});

test("tooling override is closed to qualification/stage/publish and survives status projection", () => {
  for (const phase of ["qualification", "stage", "publish"]) {
    const plan = buildReleaseOperatorPlan({ phase, tag: release.tag, packageVersion: "0.1.11", toolsTag: tools.tag,
      ...(phase === "qualification" ? { candidateRunId: "123", fromTag: "v0.1.10" } : {}),
      ...(phase === "stage" ? { candidateRunId: "123", qualificationRunId: "456" } : {}) });
    assert.equal(plan.ref, tools.tag);
    assert.equal(plan.workflow_inputs.release_tag, release.tag);
    let calls = 0;
    const runner = () => { calls++; return { status: 0, stdout: "https://github.com/haoxiang-xu/PuPu/actions/runs/999" }; };
    dispatchReleasePhase({ plan, confirmation: plan.confirmation_required, runner });
    assert.equal(calls, 1);
    assert.throws(() => dispatchReleasePhase({ plan: { ...plan, ref: "dev" }, confirmation: plan.confirmation_required, runner }));
    assert.equal(calls, 1);
  }
  for (const phase of ["candidate", "bootstrap", "windows-diagnostic"]) {
    assert.throws(() => buildReleaseOperatorPlan({ phase, tag: release.tag, packageVersion: "0.1.11", toolsTag: tools.tag }), /unsupported/);
  }
  const input = { phase: "qualification", tag: release.tag, commit: release.commit,
    toolsTag: tools.tag, toolsCommit: tools.commit, runId: "456", run: { id: 456, event: "workflow_dispatch",
      head_branch: tools.tag, head_sha: tools.commit, path: ".github/workflows/release-qualification.yml",
      status: "in_progress", conclusion: null, html_url: "https://github.com/haoxiang-xu/PuPu/actions/runs/456" },
    jobs: { total_count: 0, jobs: [] }, artifacts: { total_count: 0, artifacts: [] } };
  const state = projectReleaseOperatorState(input);
  assert.deepEqual(state.release, release);
  assert.deepEqual(state.tools, tools);
  assert.throws(() => projectReleaseOperatorState({ ...input, toolsCommit: undefined }), /together/);
  assert.throws(() => projectReleaseOperatorState({ ...input, toolsCommit: "c".repeat(40) }), /commit/);
});

test("frozen tools checkout and separate product/run provenance remain wired through promotion", () => {
  for (const name of ["release-qualification.yml", "release-stage.yml", "release-publish.yml",
    "_shared-release-update-qualification.yml", "_shared-release-windows-restart-update.yml", "_shared-release-macos-restart-update.yml"]) {
    const source = fs.readFileSync(`.github/workflows/${name}`, "utf8");
    const doc = YAML.parseDocument(source, { uniqueKeys: true });
    assert.deepEqual(doc.errors, []);
    assert.match(source, /release-toolchain\.mjs --release-tag/);
    const checkouts = Object.values(doc.toJSON().jobs).flatMap((job) => job.steps || []).filter((step) => step.uses === "actions/checkout@v4");
    for (const checkout of checkouts.filter((step) => !["fixture-source", "fixture-unchain"].includes(step.with.path))) {
      assert.equal(checkout.with.ref, "${{ github.sha }}");
      assert.equal(checkout.with["fetch-depth"], 0);
    }
    if (["release-stage.yml", "release-publish.yml"].includes(name)) {
      assert.match(source, /--run-id "\$QUALIFICATION_RUN_ID" \\\s+--tag "\$GITHUB_REF_NAME" \\\s+--commit "\$GITHUB_SHA"/);
      assert.match(source, /--run-id "\$CANDIDATE_RUN_ID" \\\s+--tag "\$RELEASE_TAG" \\\s+--commit "\$TAG_COMMIT"/);
      assert.match(source, /--tools-tag "\$GITHUB_REF_NAME"/);
      assert.match(source, /--require-restart-qualification true/);
    }
  }
  const qa = YAML.parse(fs.readFileSync(".github/workflows/release-qa.yml", "utf8"));
  assert.deepEqual(qa.on.push.tags, ["v*", "!v*-tools.*"]);
});

test("macOS native restart lane signs only N-1, seals evidence, runs lifecycle, and fails closed", () => {
  const source = fs.readFileSync(".github/workflows/_shared-release-macos-restart-update.yml", "utf8");
  const job = YAML.parse(source).jobs["macos-restart-update"];
  assert.equal(job.environment, "release-signing");
  assert.equal(job["timeout-minutes"], 180);
  assert.doesNotMatch(source, /contents: write|gh release (create|upload|edit)|diagnostic_only|build.*candidate/i);
  const steps = job.steps;
  const build = steps.findIndex((s) => s.name === "Build signed and notarized immutable N-1 fixture");
  const seal = steps.findIndex((s) => s.run?.includes("seal-macos-restart-fixture.mjs"));
  const run = steps.findIndex((s) => s.id === "restart_update");
  assert.ok(build > 0 && build < seal && seal < run);
  assert.equal(steps[build]["working-directory"], "fixture-source");
  assert.equal(steps[build].env.PUPU_BUILD_VERSION, "${{ inputs.from_version }}");
  assert.equal(steps[build].env.PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT, "1");
  assert.equal(steps[seal]["continue-on-error"], undefined);
  assert.match(steps[seal].run, /pupu.macos-restart-fixture-signing.v1/);
  assert.match(steps[run].run, /--candidate-dir ..\/candidate/);
  assert.match(steps[run].run, /--diagnostics restart-update-diagnostics.json/);
  assert.equal(steps.at(-2).if, "always()");
  assert.equal(steps.at(-1).if, "always()");
  assert.match(steps.at(-1).run, /RESTART_UPDATE_OUTCOME.*!= "success"/);
});
