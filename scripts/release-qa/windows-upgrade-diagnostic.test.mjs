import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import YAML from "yaml";
import { spawnSync } from "node:child_process";
import { buildReleaseOperatorPlan, dispatchReleasePhase, projectReleaseOperatorState } from "./release-operator.mjs";
import { createWindowsDiagnosticIdentity, DIAGNOSTIC_UPLOAD_PATHS } from "./windows-upgrade-diagnostic-identity.mjs";
import { runWindowsUpgradeDiagnostic } from "./run-windows-upgrade-diagnostic.mjs";
import { validateRestartUpdateQualificationReport } from "./restart-update-qualification.mjs";

const options = { phase: "windows-diagnostic", repo: "haoxiang-xu/PuPu", tag: "v0.1.11",
  packageVersion: "0.1.11", candidateRunId: "35299965095", fromTag: "v0.1.10" };

test("diagnostic operator uses dev tools but retains an explicit candidate tag and run", () => {
  const plan = buildReleaseOperatorPlan(options);
  assert.equal(plan.ref, "dev");
  assert.equal(plan.workflow, ".github/workflows/windows-signing-qualification.yml");
  assert.deepEqual(plan.workflow_inputs, {
    confirmation: "DIAGNOSE_WINDOWS_UPGRADE", candidate_run_id: "35299965095",
    release_tag: "v0.1.11", from_tag: "v0.1.10",
  });
  assert.equal(plan.confirmation_required, "START_WINDOWS_DIAGNOSTIC");
  const calls = [];
  const runner = (args) => { calls.push(args); return { status: 0, stdout: "https://github.com/haoxiang-xu/PuPu/actions/runs/123" }; };
  assert.throws(() => dispatchReleasePhase({ plan, confirmation: "START_QUALIFICATION", runner }), /confirmation/);
  const result = dispatchReleasePhase({ plan, confirmation: "START_WINDOWS_DIAGNOSTIC", runner });
  assert.equal(result.run_id, "123");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("dev"));
  assert.throws(() => buildReleaseOperatorPlan({ ...options, fromTag: "v0.1.11" }), /lower/);
  assert.throws(() => buildReleaseOperatorPlan({ ...options, candidateRunId: "latest" }), /run ID/);
  assert.throws(() => buildReleaseOperatorPlan({ ...options, toolsRef: "main" }), /unsupported/);
});

test("diagnostic lane is isolated from formal qualification and skips unrelated signing builds", () => {
  const source = fs.readFileSync(new URL("../../.github/workflows/windows-signing-qualification.yml", import.meta.url), "utf8");
  const workflow = YAML.parse(source);
  assert.match(workflow.jobs["windows-signing-qualification"].if, /!= 'DIAGNOSE_WINDOWS_UPGRADE'/);
  const job = workflow.jobs["windows-upgrade-diagnostic"];
  assert.match(job.if, /== 'DIAGNOSE_WINDOWS_UPGRADE'/);
  assert.equal(job.uses, "./.github/workflows/_shared-windows-upgrade-diagnostic.yml");
  assert.equal(job.with.candidate_run_id, "${{ inputs.candidate_run_id }}");
  const diagnostic = fs.readFileSync(new URL("../../.github/workflows/_shared-windows-upgrade-diagnostic.yml", import.meta.url), "utf8");
  const parsed = YAML.parseDocument(diagnostic, { uniqueKeys: true });
  assert.equal(parsed.errors.length, 0);
  const shared = YAML.parse(diagnostic).jobs["windows-upgrade-diagnostic"];
  assert.equal(shared.environment, "windows-signing-qualification");
  assert.match(diagnostic, /refs\/heads\/dev/);
  assert.match(diagnostic, /ref: \$\{\{ github.sha \}\}/);
  assert.match(diagnostic, /verify-actions-run-provenance.mjs/);
  assert.match(diagnostic, /verify-release-candidate.mjs/);
  assert.match(diagnostic, /validate-update-fixture-source.mjs/);
  assert.match(diagnostic, /name: windows-upgrade-diagnostic/);
  assert.doesNotMatch(diagnostic, /name: restart-update-qualification-|name: pupu-release-qualification|environment: release-signing|contents: write|gh release (create|upload|edit)|build-release-update-qualification/);
  const formal = fs.readFileSync(new URL("../../.github/workflows/release-qualification.yml", import.meta.url), "utf8");
  assert.doesNotMatch(formal, /windows-upgrade-diagnostic/);
});

test("diagnostic observation cannot be presented as a formal qualification", () => {
  const input = { phase: "windows-diagnostic", repo: options.repo, tag: "v0.1.11", commit: "a".repeat(40), runId: "123",
    run: { id: 123, event: "workflow_dispatch", head_branch: "dev", head_sha: "a".repeat(40),
      path: ".github/workflows/windows-signing-qualification.yml", status: "completed", conclusion: "success",
      html_url: "https://github.com/haoxiang-xu/PuPu/actions/runs/123" },
    jobs: { total_count: 2, jobs: [{ id: 1, name: "Build and verify Windows Artifact Signing", status: "completed", conclusion: "skipped", html_url: "https://github.com/haoxiang-xu/PuPu/actions/runs/123/job/1" },
      { id: 2, name: "Diagnose Windows upgrade", status: "completed", conclusion: "success", html_url: "https://github.com/haoxiang-xu/PuPu/actions/runs/123/job/2" }] },
    artifacts: { total_count: 1, artifacts: [{ id: 3, name: "windows-upgrade-diagnostic", size_in_bytes: 100, expired: false, archive_download_url: "https://api.github.com/repos/haoxiang-xu/PuPu/actions/artifacts/3/zip" }] } };
  const result = projectReleaseOperatorState(input);
  assert.equal(result.run.disposition, "passed");
  assert.equal(result.diagnostic_only, true);
  assert.throws(() => projectReleaseOperatorState({ ...input, phase: "qualification" }), /tag|workflow/);
});

test("diagnostic identity rejects unknown fields, source drift, wrong refs and non-lower fixtures", () => {
  const input = { toolsCommit: "b".repeat(40), toolsRef: "refs/heads/dev", runId: "456", candidateRunId: "123",
    candidateTag: "v0.1.11", candidateCommit: "a".repeat(40), fromTag: "v0.1.10", fromVersion: "0.1.10", fromCommit: "c".repeat(40),
    manifest: { schema: "pupu.release-assets.v1", release: { tag: "v0.1.11", version: "0.1.11", commit: "a".repeat(40) }, manifest_digest: `sha256:${"d".repeat(64)}` } };
  const actual = createWindowsDiagnosticIdentity(input);
  assert.deepEqual(actual, { schema: "pupu.windows-upgrade-diagnostic-identity.v1", diagnostic_only: true,
    tools: { ref: "refs/heads/dev", commit: "b".repeat(40), run_id: "456" },
    candidate: { tag: "v0.1.11", commit: "a".repeat(40), run_id: "123", manifest_digest: `sha256:${"d".repeat(64)}` },
    fixture: { tag: "v0.1.10", version: "0.1.10", commit: "c".repeat(40) } });
  for (const patch of [{ extra: true }, { toolsRef: "refs/heads/main" }, { candidateCommit: "f".repeat(40) },
    { candidateRunId: 123 }, { fromTag: "v0.1.11", fromVersion: "0.1.11" }, { fromVersion: "0.1.9" }, { toolsCommit: "dev" },
    { manifest: { ...input.manifest, schema: "pupu.release-assets.v2" } }]) {
    assert.throws(() => createWindowsDiagnosticIdentity({ ...input, ...patch }));
  }
});

test("actual diagnostic result producer is rejected by the formal restart-report consumer", async () => {
  const result = await runWindowsUpgradeDiagnostic({ targetId: "windows-x64" }, async () => ({ schema: "pupu.restart-update-qualification.v1", status: "passed" }));
  assert.deepEqual(Object.keys(result).sort(), ["diagnostic_only", "lifecycle", "schema", "status"]);
  assert.throws(() => validateRestartUpdateQualificationReport(result, { manifest: {} }), /schema|unsupported|unexpected|keys/);
  await assert.rejects(runWindowsUpgradeDiagnostic({ targetId: "linux-x64" }), /windows-x64/);
  const failure = new Error("actual runtime failure");
  await assert.rejects(runWindowsUpgradeDiagnostic({ targetId: "windows-x64" }, async () => { throw failure; }), (error) => error === failure);
});

test("diagnostic upload allowlist matches its scanner and fixture signing stays identical", () => {
  const load = (file) => YAML.parse(fs.readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), "utf8"));
  const diagnostic = load("_shared-windows-upgrade-diagnostic.yml").jobs["windows-upgrade-diagnostic"].steps;
  const formal = load("_shared-release-windows-restart-update.yml").jobs["windows-restart-update"].steps;
  const upload = diagnostic.find((step) => step.uses === "actions/upload-artifact@v4");
  assert.deepEqual(upload.with.path.trim().split(/\s+/).sort(), [...DIAGNOSTIC_UPLOAD_PATHS].sort());
  assert.match(upload.if, /always\(\).*diagnostic_scan.outcome == 'success'/);
  for (const id of ["fixture_paths", "fixture_signing", "fixture_evidence"]) {
    assert.deepEqual(diagnostic.find((step) => step.id === id), formal.find((step) => step.id === id));
  }
  const download = diagnostic.find((step) => step.name === "Download and verify retained exact N candidate");
  assert.equal(download.run, formal.find((step) => step.name === download.name).run);
});

test("real diagnostic admission shell rejects branch, event and malformed input before checkout", () => {
  const diagnostic = YAML.parse(fs.readFileSync(new URL("../../.github/workflows/_shared-windows-upgrade-diagnostic.yml", import.meta.url), "utf8"));
  const script = diagnostic.jobs["windows-upgrade-diagnostic"].steps[0].run;
  const good = { ...process.env, GITHUB_REF: "refs/heads/dev", GITHUB_EVENT_NAME: "workflow_dispatch", CANDIDATE_RUN_ID: "35299965095", RELEASE_TAG: "v0.1.11", FROM_TAG: "v0.1.10" };
  assert.equal(spawnSync("bash", ["-e", "-c", script], { env: good }).status, 0);
  for (const bad of [{ GITHUB_REF: "refs/tags/v0.1.11" }, { GITHUB_REF: "refs/heads/main" }, { GITHUB_EVENT_NAME: "pull_request" },
    { CANDIDATE_RUN_ID: "latest" }, { RELEASE_TAG: "v0.1.11\necho injected" }, { FROM_TAG: "-bad" }]) {
    assert.notEqual(spawnSync("bash", ["-e", "-c", script], { env: { ...good, ...bad } }).status, 0);
  }
});
