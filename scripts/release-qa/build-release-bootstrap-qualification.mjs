#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { buildReleaseQualificationReceipt } from "./build-release-qualification.mjs";
import {
  RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA,
  computeReleaseBootstrapPolicyDigest,
  readReleaseBootstrapPolicy,
  validateLegacyReleaseProjection,
} from "./release-bootstrap-policy.mjs";
import {
  readJson,
  readReleaseArtifactContract,
  validateReleaseBootstrapQualificationReceipt,
  writeJson,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

const listNamedFiles = (root, name) => {
  const results = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name === name) results.push(candidate);
    }
  };
  visit(root);
  return results.sort();
};

const requireRunId = (value, label) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label} must be a positive decimal Actions run ID`);
  }
  return value;
};

export function buildReleaseBootstrapQualificationReceipt({
  manifest,
  contract,
  policy,
  legacyProjection,
  reports,
  qualificationRunId,
  confirmation,
}) {
  validateLegacyReleaseProjection(legacyProjection, policy);
  requireRunId(qualificationRunId, "qualification run ID");
  if (confirmation !== policy.baseline.confirmation) {
    throw new Error(`bootstrap confirmation must be ${policy.baseline.confirmation}`);
  }
  if (qualificationRunId === manifest.release.candidate_run_id) {
    throw new Error("bootstrap qualification run must be different from the candidate run");
  }
  const freshReceipt = buildReleaseQualificationReceipt({
    manifest,
    contract,
    reports,
    qualificationRunId,
  });
  const receipt = {
    schema: RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA,
    status: "passed",
    scope: "bootstrap-fresh-install-only",
    candidate_run_id: manifest.release.candidate_run_id,
    qualification_run_id: qualificationRunId,
    manifest_digest: manifest.manifest_digest,
    release: { ...freshReceipt.release },
    bootstrap: {
      policy_digest: computeReleaseBootstrapPolicyDigest(policy),
      legacy_release: {
        tag: policy.legacy_release.tag,
        version: policy.legacy_release.version,
        tag_commit: policy.legacy_release.tag_commit,
        release_id: policy.legacy_release.release_id,
      },
      reason_code: policy.reason_code,
      next_strict_from_tag: policy.baseline.next_strict_from_tag,
    },
    fresh_targets: freshReceipt.targets,
    restart_targets: [],
    restart_disposition: {
      status: "not_run",
      reason_code: "legacy-source-not-admissible",
    },
  };
  return validateReleaseBootstrapQualificationReceipt(receipt, manifest, contract, policy);
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid argument near ${key || "(end)"}`);
    args[key.slice(2)] = value;
  }
  for (const key of [
    "candidate-dir",
    "fresh-reports-dir",
    "policy",
    "legacy-projection",
    "qualification-run-id",
    "confirmation",
    "out",
  ]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

try {
  if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const args = parseArgs(process.argv.slice(2));
    const candidateDir = path.resolve(args["candidate-dir"]);
    const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
    const policy = readReleaseBootstrapPolicy(path.resolve(args.policy));
    const manifest = readJson(path.join(candidateDir, "release-assets.v1.json"));
    const legacyProjection = readJson(path.resolve(args["legacy-projection"]));
    const reportPaths = listNamedFiles(path.resolve(args["fresh-reports-dir"]), "installed-package-qualification.json");
    const receipt = buildReleaseBootstrapQualificationReceipt({
      manifest,
      contract,
      policy,
      legacyProjection,
      reports: reportPaths.map(readJson),
      qualificationRunId: args["qualification-run-id"],
      confirmation: args.confirmation,
    });
    writeJson(path.resolve(args.out), receipt);
    console.log(`[release-bootstrap] receipt passed for ${receipt.fresh_targets.length} fresh targets`);
  }
} catch (error) {
  console.error(`[release-bootstrap] ${error.message || String(error)}`);
  process.exitCode = 1;
}
