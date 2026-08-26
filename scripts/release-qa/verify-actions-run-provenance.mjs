#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const RUN_ID_PATTERN = /^[1-9]\d*$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const assertRunId = (value, label) => {
  const runId = requiredString(value, label);
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`${label} must be a positive decimal GitHub Actions run ID`);
  }
  return runId;
};

export function assertGithubActionsRunProvenance({ run, runId, tag, commit, workflowPath }) {
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    throw new Error("GitHub Actions run response must be an object");
  }
  const expectedRunId = assertRunId(runId, "expected run ID");
  const expectedTag = requiredString(tag, "expected tag");
  const expectedCommit = requiredString(commit, "expected commit");
  if (!GIT_SHA_PATTERN.test(expectedCommit)) {
    throw new Error("expected commit must be a full lowercase Git SHA");
  }
  const expectedWorkflowPath = requiredString(workflowPath, "expected workflow path");

  if (String(run.id) !== expectedRunId) {
    throw new Error(`Actions run ID does not match: expected ${expectedRunId}`);
  }
  if (run.conclusion !== "success") {
    throw new Error("Actions run conclusion must be success");
  }
  if (run.event !== "workflow_dispatch") {
    throw new Error("Actions run event must be workflow_dispatch");
  }
  if (run.head_sha !== expectedCommit) {
    throw new Error("Actions run head SHA does not match the release tag commit");
  }
  if (run.head_branch !== expectedTag) {
    throw new Error("Actions run head branch does not match the release tag");
  }
  if (typeof run.path !== "string" || !run.path.startsWith(`${expectedWorkflowPath}@`)) {
    throw new Error(`Actions run workflow path must start with ${expectedWorkflowPath}@`);
  }
  return run;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const run = JSON.parse(fs.readFileSync(0, "utf8"));
  assertGithubActionsRunProvenance({
    run,
    runId: args["run-id"] || "",
    tag: args.tag || "",
    commit: args.commit || "",
    workflowPath: args["workflow-path"] || "",
  });
  console.log(`[release-provenance] verified Actions run ${args["run-id"]}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[release-provenance] ${error.message || String(error)}`);
    process.exit(1);
  }
}
