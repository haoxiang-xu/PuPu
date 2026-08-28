#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA,
  RELEASE_BOOTSTRAP_WORKFLOW_PATH,
  RELEASE_UPDATE_WORKFLOW_PATH,
  computeReleaseBootstrapPolicyDigest,
  readReleaseBootstrapPolicy,
} from "./release-bootstrap-policy.mjs";
import {
  RELEASE_UPDATE_QUALIFICATION_SCHEMA,
  readJson,
} from "./release-artifact-manifest.mjs";

const requireRunId = (value, label) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new Error(`${label} must be a positive decimal Actions run ID`);
  return value;
};

export function qualificationWorkflowPath({
  receipt,
  bootstrapPolicy,
  candidateRunId,
  qualificationRunId,
  releaseTag,
  releaseCommit,
}) {
  requireRunId(candidateRunId, "candidate run ID");
  requireRunId(qualificationRunId, "qualification run ID");
  if (candidateRunId === qualificationRunId) throw new Error("candidate and qualification runs must be different");
  if (receipt?.candidate_run_id !== candidateRunId || receipt?.qualification_run_id !== qualificationRunId) {
    throw new Error("qualification receipt run identity does not match the requested runs");
  }
  if (receipt?.release?.tag !== releaseTag || receipt?.release?.commit !== releaseCommit) {
    throw new Error("qualification receipt release identity does not match the requested tag commit");
  }
  if (receipt.schema === RELEASE_UPDATE_QUALIFICATION_SCHEMA) return RELEASE_UPDATE_WORKFLOW_PATH;
  if (receipt.schema === RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA) {
    if (!bootstrapPolicy) throw new Error("bootstrap qualification provenance requires the frozen policy");
    if (releaseTag !== bootstrapPolicy.baseline.tag ||
        receipt.scope !== "bootstrap-fresh-install-only" ||
        receipt.bootstrap?.policy_digest !== computeReleaseBootstrapPolicyDigest(bootstrapPolicy)) {
      throw new Error("bootstrap qualification provenance does not match the frozen policy");
    }
    return RELEASE_BOOTSTRAP_WORKFLOW_PATH;
  }
  throw new Error("qualification receipt schema is not eligible for promotion");
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid argument near ${key || "(end)"}`);
    args[key.slice(2)] = value;
  }
  for (const key of ["receipt", "bootstrap-policy", "candidate-run-id", "qualification-run-id", "release-tag", "release-commit"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

try {
  if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const args = parseArgs(process.argv.slice(2));
    const workflowPath = qualificationWorkflowPath({
      receipt: readJson(path.resolve(args.receipt)),
      bootstrapPolicy: readReleaseBootstrapPolicy(path.resolve(args["bootstrap-policy"])),
      candidateRunId: args["candidate-run-id"],
      qualificationRunId: args["qualification-run-id"],
      releaseTag: args["release-tag"],
      releaseCommit: args["release-commit"],
    });
    process.stdout.write(`${workflowPath}\n`);
  }
} catch (error) {
  console.error(`[qualification-provenance] ${error.message || String(error)}`);
  process.exitCode = 1;
}
