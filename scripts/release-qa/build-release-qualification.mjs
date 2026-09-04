#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  readJson,
  readReleaseArtifactContract,
  validateReleaseAssetManifest,
  validateQualificationReceipt,
  writeJson,
} from "./release-artifact-manifest.mjs";
import { validateInstalledPackageQualificationReport } from "./installed-package-qualification.mjs";

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
  return results;
};

const requireRunId = (value, label) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label} must be a positive decimal Actions run ID`);
  }
  return value;
};

export function buildReleaseQualificationReceipt({ manifest, contract, reports, qualificationRunId }) {
  validateReleaseAssetManifest(manifest, contract);
  requireRunId(qualificationRunId, "qualification run ID");
  const requiredTargets = contract.targets
    .filter((target) => target.status === "required")
    .map((target) => target.id)
    .sort();
  if (!Array.isArray(reports)) throw new Error("qualification reports must be an array");
  const byTarget = new Map();
  for (const report of reports) {
    const validated = validateInstalledPackageQualificationReport(report, {
      manifest,
      manifestDigest: manifest.manifest_digest,
    });
    if (byTarget.has(validated.target_id)) {
      throw new Error(`qualification report repeats target ${validated.target_id}`);
    }
    byTarget.set(validated.target_id, validated);
  }
  const actualTargets = [...byTarget.keys()].sort();
  if (JSON.stringify(actualTargets) !== JSON.stringify(requiredTargets)) {
    throw new Error(`qualification reports must match required targets: ${requiredTargets.join(", ")}`);
  }
  const receipt = {
    schema: "pupu.release-qualification.v1",
    status: "passed",
    candidate_run_id: manifest.release.candidate_run_id,
    qualification_run_id: qualificationRunId,
    manifest_digest: manifest.manifest_digest,
    release: {
      tag: manifest.release.tag,
      version: manifest.release.version,
      commit: manifest.release.commit,
    },
    targets: requiredTargets.map((id) => ({ id, status: "passed" })),
  };
  return validateQualificationReceipt(receipt, manifest, contract);
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
  for (const key of ["candidate-dir", "reports-dir", "qualification-run-id", "out"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const candidateDir = path.resolve(args["candidate-dir"]);
    const reportsDir = path.resolve(args["reports-dir"]);
    const contract = readReleaseArtifactContract(path.join(
      ROOT,
      "contracts/release/release-artifact-contract.v1.json",
    ));
    const manifest = readJson(path.join(candidateDir, "release-assets.v1.json"));
    const reportPaths = listNamedFiles(reportsDir, "installed-package-qualification.json");
    if (reportPaths.length === 0) throw new Error("qualification reports are missing");
    const receipt = buildReleaseQualificationReceipt({
      manifest,
      contract,
      reports: reportPaths.map(readJson),
      qualificationRunId: args["qualification-run-id"],
    });
    writeJson(path.resolve(args.out), receipt);
    console.log(`[release-qualification] receipt passed for ${receipt.targets.length} targets`);
  } catch (error) {
    console.error(`[release-qualification] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
