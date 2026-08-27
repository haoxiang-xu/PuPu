import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_RELEASE_PROJECTION_SCHEMA,
  RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA,
  RELEASE_BOOTSTRAP_WORKFLOW_PATH,
  RELEASE_UPDATE_WORKFLOW_PATH,
  computeReleaseBootstrapPolicyDigest,
  projectLegacyReleaseApi,
  readReleaseBootstrapPolicy,
  validateLegacyReleaseProjection,
  validateReleaseBootstrapPolicy,
} from "./release-bootstrap-policy.mjs";
import { qualificationWorkflowPath } from "./qualification-provenance.mjs";

const policy = readReleaseBootstrapPolicy("contracts/release/release-bootstrap-policy.v1.json");
const apiRelease = () => ({
  id: policy.legacy_release.release_id,
  tag_name: policy.legacy_release.tag,
  draft: false,
  prerelease: false,
  assets: policy.legacy_release.assets.map((asset) => ({ ...asset, state: "uploaded" })),
  ignored_open_api_field: "allowed-by-projection",
});

const bootstrapReceipt = () => ({
  schema: RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA,
  scope: "bootstrap-fresh-install-only",
  candidate_run_id: "12345",
  qualification_run_id: "67890",
  release: { tag: "v0.1.10", version: "0.1.10", commit: "a".repeat(40) },
  bootstrap: { policy_digest: computeReleaseBootstrapPolicyDigest(policy) },
});

test("bootstrap policy freezes v0.1.10 and the exact public v0.1.9 legacy projection", () => {
  assert.equal(validateReleaseBootstrapPolicy(policy).baseline.tag, "v0.1.10");
  assert.match(computeReleaseBootstrapPolicyDigest(policy), /^sha256:[0-9a-f]{64}$/);
  const projection = projectLegacyReleaseApi(apiRelease(), policy, policy.legacy_release.tag_commit);
  assert.equal(projection.schema, LEGACY_RELEASE_PROJECTION_SCHEMA);
  assert.deepEqual(validateLegacyReleaseProjection(projection, policy).release, policy.legacy_release);
});

test("bootstrap policy and legacy projection fail closed on scope or asset drift", () => {
  const wrongBaseline = structuredClone(policy);
  wrongBaseline.baseline.tag = "v0.2.0";
  wrongBaseline.baseline.version = "0.2.0";
  assert.throws(() => validateReleaseBootstrapPolicy(wrongBaseline), /baseline must be v0\.1\.10/);

  const changedAsset = apiRelease();
  changedAsset.assets[0].size += 1;
  assert.throws(
    () => projectLegacyReleaseApi(changedAsset, policy, policy.legacy_release.tag_commit),
    /does not match the frozen bootstrap policy/,
  );

  const extraModernAsset = apiRelease();
  extraModernAsset.assets.push({ id: 999999999, name: "release-assets.v1.json", size: 10, digest: `sha256:${"f".repeat(64)}` });
  assert.throws(
    () => projectLegacyReleaseApi(extraModernAsset, policy, policy.legacy_release.tag_commit),
    /does not match the frozen bootstrap policy/,
  );

  const draft = apiRelease();
  draft.draft = true;
  assert.throws(() => projectLegacyReleaseApi(draft, policy, policy.legacy_release.tag_commit), /public stable release/);
});

test("receipt schema selects one closed qualification workflow and rejects old fresh-only promotion", () => {
  const receipt = bootstrapReceipt();
  assert.equal(qualificationWorkflowPath({
    receipt,
    bootstrapPolicy: policy,
    candidateRunId: "12345",
    qualificationRunId: "67890",
    releaseTag: "v0.1.10",
    releaseCommit: "a".repeat(40),
  }), RELEASE_BOOTSTRAP_WORKFLOW_PATH);

  const update = { ...receipt, schema: "pupu.release-update-qualification.v1" };
  assert.equal(qualificationWorkflowPath({
    receipt: update,
    bootstrapPolicy: policy,
    candidateRunId: "12345",
    qualificationRunId: "67890",
    releaseTag: "v0.1.10",
    releaseCommit: "a".repeat(40),
  }), RELEASE_UPDATE_WORKFLOW_PATH);

  assert.throws(() => qualificationWorkflowPath({
    receipt: { ...receipt, schema: "pupu.release-qualification.v1" },
    bootstrapPolicy: policy,
    candidateRunId: "12345",
    qualificationRunId: "67890",
    releaseTag: "v0.1.10",
    releaseCommit: "a".repeat(40),
  }), /not eligible for promotion/);
  assert.throws(() => qualificationWorkflowPath({
    receipt: { ...receipt, qualification_run_id: "12345" },
    bootstrapPolicy: policy,
    candidateRunId: "12345",
    qualificationRunId: "12345",
    releaseTag: "v0.1.10",
    releaseCommit: "a".repeat(40),
  }), /must be different/);
});
