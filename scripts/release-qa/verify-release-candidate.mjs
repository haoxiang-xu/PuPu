#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  readJson,
  readReleaseArtifactContract,
  validateQualificationReceipt,
  validateReleaseAssetManifest,
  verifyReleaseAssetDirectory,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

function parseArgs(argv) {
  const args = { "allow-extra": [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    if (key === "allow-extra") args[key].push(value);
    else args[key] = value;
    index += 1;
  }
  return args;
}

function requiredPath(args, key) {
  if (!args[key]) throw new Error(`--${key} is required`);
  return path.resolve(args[key]);
}

function assertQaReport(report, manifest) {
  if (report?.deterministic_result?.status !== "passed" || report.mode !== "release-candidate") {
    throw new Error("candidate QA report is not a passed release-candidate report");
  }
  if (report.version !== manifest.release.version) {
    throw new Error("candidate QA report version does not match the manifest");
  }
  if (report.git?.sha !== manifest.release.commit) {
    throw new Error("candidate QA report commit does not match the manifest");
  }
  if (report.git?.run_id !== manifest.release.candidate_run_id) {
    throw new Error("candidate QA report run ID does not match the manifest");
  }
  for (const field of ["artifact_sha256", "runtime_manifest_digest", "source_revision"]) {
    if (report.unchain?.[field] !== manifest.unchain[field]) {
      throw new Error(`candidate QA report unchain ${field} does not match the manifest`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const contractPath = args.contract ? path.resolve(args.contract) : path.join(ROOT, "contracts/release/release-artifact-contract.v1.json");
  const manifest = readJson(requiredPath(args, "manifest"));
  const assetDir = requiredPath(args, "asset-dir");
  const qaReport = readJson(requiredPath(args, "qa-report"));
  const contract = readReleaseArtifactContract(contractPath);
  validateReleaseAssetManifest(manifest, contract);
  if (args.tag && args.tag !== manifest.release.tag) throw new Error("requested tag does not match the candidate manifest");
  if (args.commit && args.commit !== manifest.release.commit) throw new Error("requested commit does not match the candidate manifest");
  if (args["candidate-run-id"] && args["candidate-run-id"] !== manifest.release.candidate_run_id) {
    throw new Error("requested candidate run ID does not match the candidate manifest");
  }
  assertQaReport(qaReport, manifest);
  if (args["require-qualification"] === "true") {
    const qualification = readJson(requiredPath(args, "qualification"));
    validateQualificationReceipt(qualification, manifest, contract);
    if (args["qualification-run-id"] &&
        args["qualification-run-id"] !== qualification.qualification_run_id) {
      throw new Error("requested qualification run ID does not match the qualification receipt");
    }
  }
  verifyReleaseAssetDirectory({
    manifest,
    contract,
    assetDir,
    allowExtraNames: args["allow-extra"],
  });
  console.log(`[release-candidate] verified ${manifest.release.tag} ${manifest.manifest_digest}`);
}

try {
  main();
} catch (error) {
  console.error(`[release-candidate] ${error.message || String(error)}`);
  process.exit(1);
}
