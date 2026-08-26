#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import YAML from "yaml";

import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readJson,
  readReleaseArtifactContract,
  verifyRawPackageOutputDirectory,
  writeJson,
} from "./release-artifact-manifest.mjs";
import { validateWindowsReleaseCandidateSigningEvidence } from "./windows-release-candidate-signing.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function requiredArg(args, key) {
  if (!args[key]) throw new Error(`--${key} is required`);
  return path.resolve(args[key]);
}

function listFiles(root) {
  const results = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      if (entry.isFile()) results.push(entryPath);
    }
  };
  visit(root);
  return results;
}

function oneFileNamed(root, name) {
  const matches = listFiles(root).filter((filePath) => path.basename(filePath) === name);
  if (matches.length !== 1) {
    throw new Error(`candidate package input must contain exactly one ${name}, found ${matches.length}`);
  }
  return matches[0];
}

function parseUpdaterYaml(filePath, version, expectedPayloadName, expectedPayloadPath) {
  const document = YAML.parseDocument(fs.readFileSync(filePath, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`invalid updater YAML ${filePath}: ${document.errors[0].message}`);
  }
  const value = document.toJSON();
  if (!value || typeof value !== "object" || value.version !== version || !Array.isArray(value.files)) {
    throw new Error(`updater YAML ${path.basename(filePath)} has an invalid version or files list`);
  }
  const matches = value.files.filter((file) => file && file.url === expectedPayloadName);
  if (matches.length !== 1 || typeof matches[0].sha512 !== "string" || !Number.isSafeInteger(matches[0].size) || matches[0].size <= 0) {
    throw new Error(`updater YAML ${path.basename(filePath)} must describe ${expectedPayloadName} exactly once`);
  }
  if (value.path !== expectedPayloadName || value.sha512 !== matches[0].sha512) {
    throw new Error(`updater YAML ${path.basename(filePath)} primary payload must be ${expectedPayloadName}`);
  }
  if (matches[0].sha512 !== hashFileSha512(expectedPayloadPath)) {
    throw new Error(`updater YAML ${path.basename(filePath)} SHA-512 does not match ${expectedPayloadName}`);
  }
  return { document: value, reference: matches[0] };
}

function copyRequiredAssets({ packageDir, assetDir, expectedAssets }) {
  const sourceByName = new Map();
  for (const asset of expectedAssets) {
    const source = oneFileNamed(packageDir, asset.name);
    const destination = path.join(assetDir, asset.name);
    if (fs.existsSync(destination)) throw new Error(`candidate asset destination already exists: ${asset.name}`);
    fs.copyFileSync(source, destination);
    sourceByName.set(asset.name, source);
  }
  return sourceByName;
}

function verifyRawPackageOutputDirectories({ contract, version, expectedAssets, sourceByName }) {
  for (const target of contract.targets.filter((candidate) => candidate.status === "required")) {
    const sourceDirectories = new Set(
      expectedAssets
        .filter((asset) => asset.target_id === target.id)
        .map((asset) => path.dirname(sourceByName.get(asset.name))),
    );
    if (sourceDirectories.size !== 1) {
      throw new Error(`candidate package input must keep ${target.id} output files in one directory`);
    }
    verifyRawPackageOutputDirectory({
      contract,
      targetId: target.id,
      version,
      distDir: [...sourceDirectories][0],
    });
  }
}

function writeUpdaterMetadata({ contract, version, assets, sourceByName, assetDir }) {
  for (const channel of contract.updater_channels) {
    const payloads = channel.target_ids.map((targetId) =>
      assets.find((asset) => asset.target_id === targetId && (
        asset.role === "updater-payload" ||
        (channel.id === "windows" && asset.role === "installer" && asset.format === "exe")
      ))
    );
    if (payloads.some((payload) => !payload)) {
      throw new Error(`updater channel ${channel.name} has no payload for every target`);
    }
    const rawEntries = payloads.map((payload) => {
      const source = sourceByName.get(payload.name);
      const rawPath = path.join(path.dirname(source), channel.name);
      if (!fs.existsSync(rawPath)) throw new Error(`package output is missing ${channel.name} next to ${payload.name}`);
      const parsed = parseUpdaterYaml(rawPath, version, payload.name, source);
      if (parsed.reference.size !== fs.statSync(source).size) {
        throw new Error(`updater YAML ${channel.name} size does not match ${payload.name}`);
      }
      return { payload, rawPath, ...parsed };
    });
    const outputPath = path.join(assetDir, channel.name);
    if (channel.id === "macos") {
      const primary = rawEntries.find((entry) => entry.payload.target_id === channel.primary_target);
      const files = rawEntries
        .map((entry) => ({
          url: entry.payload.name,
          sha512: entry.reference.sha512,
          size: entry.reference.size,
        }))
        .sort((left, right) => Buffer.compare(Buffer.from(left.url), Buffer.from(right.url)));
      const merged = {
        version,
        files,
        path: primary.payload.name,
        sha512: primary.reference.sha512,
      };
      if (typeof primary.document.releaseDate === "string") merged.releaseDate = primary.document.releaseDate;
      fs.writeFileSync(outputPath, YAML.stringify(merged), "utf8");
    } else {
      fs.copyFileSync(rawEntries[0].rawPath, outputPath);
    }
  }
}

function assertQaReport(report, { version, commit, runId }) {
  if (report?.deterministic_result?.status !== "passed") {
    throw new Error("candidate QA report must have a passed deterministic result");
  }
  if (report.mode !== "release-candidate") {
    throw new Error("candidate QA report must use release-candidate mode");
  }
  if (report.version !== version) {
    throw new Error("candidate QA report version does not match the release version");
  }
  if (report.git?.sha !== commit) {
    throw new Error("candidate QA report commit does not match the release commit");
  }
  if (report.git?.run_id !== runId) {
    throw new Error("candidate QA report run ID does not match the candidate run");
  }
  const unchain = report.unchain || {};
  for (const key of ["artifact_sha256", "runtime_manifest_digest", "source_revision"]) {
    if (typeof unchain[key] !== "string" || !unchain[key]) {
      throw new Error(`candidate QA report is missing unchain ${key}`);
    }
  }
  return unchain;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const contractPath = args.contract ? path.resolve(args.contract) : path.join(ROOT, "contracts/release/release-artifact-contract.v1.json");
  const packageDir = requiredArg(args, "package-dir");
  const qaReportPath = requiredArg(args, "qa-report");
  const outDir = requiredArg(args, "out-dir");
  const tag = args.tag || "";
  const version = args.version || "";
  const commit = args.commit || "";
  const runId = args["run-id"] || "";
  if (!tag || !version || !commit || !runId) {
    throw new Error("--tag, --version, --commit, and --run-id are required");
  }
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    throw new Error(`package directory is missing: ${packageDir}`);
  }
  if (fs.existsSync(outDir)) throw new Error(`candidate output directory must not already exist: ${outDir}`);

  const contract = readReleaseArtifactContract(contractPath);
  const qaReport = readJson(qaReportPath);
  const unchain = assertQaReport(qaReport, { version, commit, runId });
  const assetDir = path.join(outDir, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  const expectedAssets = expectedTargetAssets(contract, version);
  const sourceByName = copyRequiredAssets({ packageDir, assetDir, expectedAssets });
  verifyRawPackageOutputDirectories({ contract, version, expectedAssets, sourceByName });
  writeUpdaterMetadata({ contract, version, assets: expectedAssets, sourceByName, assetDir });
  const manifest = buildReleaseAssetManifest({
    contract,
    assetDir,
    tag,
    version,
    commit,
    candidateRunId: runId,
    unchain,
  });
  const windowsSigningEvidencePath = oneFileNamed(packageDir, "windows-signing-evidence.v1.json");
  const windowsSigningEvidence = readJson(windowsSigningEvidencePath);
  validateWindowsReleaseCandidateSigningEvidence({ evidence: windowsSigningEvidence, manifest });
  writeJson(path.join(outDir, "release-assets.v1.json"), manifest);
  fs.copyFileSync(qaReportPath, path.join(outDir, "release-qa-report.json"));
  fs.copyFileSync(windowsSigningEvidencePath, path.join(outDir, "windows-signing-evidence.v1.json"));
  console.log(`[release-candidate] assembled ${manifest.assets.length} package assets; manifest=${manifest.manifest_digest}`);
}

try {
  main();
} catch (error) {
  console.error(`[release-candidate] ${error.message || String(error)}`);
  process.exit(1);
}
