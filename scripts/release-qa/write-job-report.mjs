#!/usr/bin/env node

import process from "node:process";

import {
  buildJobReport,
  collectArtifacts,
  readJson,
  readPackageVersion,
  writeJson,
} from "./reporting.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function readJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return [
      {
        name: `${name} parse`,
        outcome: "failure",
        details: error.message,
      },
    ];
  }
}

const args = parseArgs(process.argv.slice(2));
const outPath = args.out || "release-qa-job-report.json";
const mode = args.mode || process.env.QA_MODE || "lite";
const version = args.version || process.env.QA_VERSION || readPackageVersion();
const expectedVersion = args["expected-version"] || process.env.QA_EXPECTED_VERSION || "";
const checks = readJsonEnv("QA_CHECKS_JSON", []);
const explicitArtifacts = readJsonEnv("QA_ARTIFACTS_JSON", []);
const artifactGlobs = readJsonEnv("QA_ARTIFACT_GLOBS_JSON", []);
const requiredChecks = readJsonEnv("QA_REQUIRED_CHECKS_JSON", []);
const collectedArtifacts = collectArtifacts(artifactGlobs);
const artifactEvidencePath = process.env.QA_UNCHAIN_ARTIFACT_EVIDENCE_PATH || "";
let artifactEvidence = {};
if (artifactEvidencePath) {
  try {
    artifactEvidence = readJson(artifactEvidencePath);
  } catch (error) {
    checks.push({
      name: "Unchain artifact continuity",
      outcome: "failure",
      details: `artifact evidence could not be read: ${error.message}`,
      executed_tests: 0,
    });
  }
}

const report = buildJobReport({
  mode,
  version,
  expectedVersion,
  git: {
    sha: process.env.GITHUB_SHA || "",
    ref: process.env.GITHUB_REF || "",
    ref_name: process.env.GITHUB_REF_NAME || "",
    head_ref: process.env.GITHUB_HEAD_REF || "",
    base_ref: process.env.GITHUB_BASE_REF || "",
    run_id: process.env.GITHUB_RUN_ID || "",
  },
  unchain: {
    artifact_name: artifactEvidence.artifact?.name || "",
    artifact_sha256: artifactEvidence.artifact?.sha256 || "",
    artifact_size_bytes: artifactEvidence.artifact?.size_bytes,
    runtime_manifest_digest:
      artifactEvidence.runtime_manifest?.manifest_digest || "",
    runtime_manifest: artifactEvidence.runtime_manifest,
    source_repository: artifactEvidence.source?.repository || "",
    source_ref: artifactEvidence.source?.ref || "",
    source_revision: artifactEvidence.source?.revision || "",
    source_dirty: artifactEvidence.source?.dirty,
  },
  requiredChecks,
  platform: {
    name: args.platform || process.env.QA_PLATFORM_NAME || process.env.RUNNER_OS || "",
    os: process.env.RUNNER_OS || args.platform || process.env.QA_PLATFORM_NAME || "",
    arch: process.env.RUNNER_ARCH || "",
    command: process.env.QA_PLATFORM_COMMAND || "",
  },
  checks,
  artifacts: [...explicitArtifacts, ...collectedArtifacts],
});

writeJson(outPath, report);
console.log(`[release-qa] wrote ${outPath}`);
