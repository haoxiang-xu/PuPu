#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildReleaseQualificationReceipt } from "./build-release-qualification.mjs";
import {
  readJson,
  readReleaseArtifactContract,
  validateReleaseUpdateQualificationReceipt,
  writeJson,
} from "./release-artifact-manifest.mjs";
import {
  RESTART_UPDATE_TARGET_IDS,
  validateRestartUpdateQualificationReport,
  validateUpdateFixtureSource,
} from "./restart-update-qualification.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const RELEASE_UPDATE_QUALIFICATION_SCHEMA = "pupu.release-update-qualification.v1";

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
  return results;
};

export function buildReleaseUpdateQualificationReceipt({
  manifest,
  contract,
  freshReports,
  restartReports,
  qualificationRunId,
  fixtureSource,
}) {
  const fresh = buildReleaseQualificationReceipt({
    manifest,
    contract,
    reports: freshReports,
    qualificationRunId,
  });
  const source = validateUpdateFixtureSource({ manifest, ...fixtureSource });
  if (!Array.isArray(restartReports)) throw new Error("restart-update reports must be an array");
  const byTarget = new Map();
  for (const report of restartReports) {
    const validated = validateRestartUpdateQualificationReport(report, { manifest });
    if (byTarget.has(validated.target_id)) {
      throw new Error(`restart-update report repeats target ${validated.target_id}`);
    }
    if (validated.fixture.from_tag !== source.from_tag ||
        validated.fixture.from_version !== source.from_version ||
        validated.fixture.from_commit !== source.from_commit) {
      throw new Error(`restart-update report fixture source does not match ${validated.target_id}`);
    }
    byTarget.set(validated.target_id, validated);
  }
  const actualTargets = [...byTarget.keys()].sort();
  const expectedTargets = [...RESTART_UPDATE_TARGET_IDS].sort();
  if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) {
    throw new Error(`restart-update reports must match required targets: ${expectedTargets.join(", ")}`);
  }
  return validateReleaseUpdateQualificationReceipt({
    schema: RELEASE_UPDATE_QUALIFICATION_SCHEMA,
    status: "passed",
    candidate_run_id: fresh.candidate_run_id,
    qualification_run_id: fresh.qualification_run_id,
    manifest_digest: fresh.manifest_digest,
    release: fresh.release,
    fixture_source: source,
    fresh_targets: fresh.targets,
    restart_targets: expectedTargets.map((id) => ({ id, status: "passed" })),
  }, manifest, contract);
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  for (const key of [
    "candidate-dir", "fresh-reports-dir", "restart-reports-dir", "qualification-run-id",
    "from-tag", "from-version", "from-commit", "out",
  ]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
    const candidateDir = path.resolve(args["candidate-dir"]);
    const freshReportPaths = listNamedFiles(path.resolve(args["fresh-reports-dir"]), "installed-package-qualification.json");
    const restartReportPaths = listNamedFiles(path.resolve(args["restart-reports-dir"]), "restart-update-qualification.json");
    if (freshReportPaths.length === 0 || restartReportPaths.length === 0) {
      throw new Error("fresh-install and restart-update reports are both required");
    }
    const receipt = buildReleaseUpdateQualificationReceipt({
      manifest: readJson(path.join(candidateDir, "release-assets.v1.json")),
      contract,
      freshReports: freshReportPaths.map(readJson),
      restartReports: restartReportPaths.map(readJson),
      qualificationRunId: args["qualification-run-id"],
      fixtureSource: {
        fromTag: args["from-tag"],
        fromVersion: args["from-version"],
        fromCommit: args["from-commit"],
      },
    });
    writeJson(path.resolve(args.out), receipt);
    console.log(`[release-update-qualification] receipt passed for ${receipt.restart_targets.length} restart targets`);
  } catch (error) {
    console.error(`[release-update-qualification] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
