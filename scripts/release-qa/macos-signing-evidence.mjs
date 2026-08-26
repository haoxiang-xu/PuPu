#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import YAML from "yaml";

import {
  hashFileSha256,
  hashFileSha512,
  readReleaseArtifactContract,
  verifyRawPackageOutputDirectory,
} from "./release-artifact-manifest.mjs";

export const MACOS_SIGNING_QUALIFICATION_SCHEMA = "pupu.macos-signing-qualification.v1";
export const MACOS_RELEASE_CANDIDATE_SIGNING_SCHEMA = "pupu.macos-release-candidate-signing.v1";

const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUN_ID_PATTERN = /^[1-9]\d*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SHA512_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const APP_LOCATIONS = Object.freeze(["build", "dmg", "zip"]);
const ARTIFACT_FORMATS = Object.freeze(["blockmap", "dmg", "metadata", "zip"]);
const TARGETS = Object.freeze({
  "macos-arm64": { architecture: "arm64", artifactArchitecture: "arm64" },
  "macos-x64": { architecture: "x86_64", artifactArchitecture: "x64" },
});
const ROOT = path.resolve(import.meta.dirname, "../..");

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

function exactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(`missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new Error(`unexpected key: ${key}`);
  }
  if (Object.keys(value).length !== expectedKeys.length) {
    throw new Error(`${label} must not contain duplicate keys`);
  }
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requiredBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function requiredPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function exactString(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must equal ${expected}`);
  return value;
}

function assertIsoDate(value, label) {
  requiredString(value, label);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return timestamp;
}

function expectedArtifactNames(version, target) {
  const suffix = target.artifactArchitecture;
  const prefix = `PuPu-${version}-macos-${suffix}`;
  return [
    `${prefix}.zip.blockmap`,
    `${prefix}.dmg`,
    "latest-mac.yml",
    `${prefix}.zip`,
  ];
}

function validateSource(source, schema) {
  exactKeys(source, ["ref", "commit", "expected_commit", "unchain_ref"], "source");
  const ref = requiredString(source.ref, "source.ref");
  const commit = requiredString(source.commit, "source.commit");
  const expectedCommit = requiredString(source.expected_commit, "source.expected_commit");
  const unchainRef = requiredString(source.unchain_ref, "source.unchain_ref");
  if (!GIT_SHA_PATTERN.test(commit)) throw new Error("source.commit must be a full lowercase Git SHA");
  if (!GIT_SHA_PATTERN.test(expectedCommit)) throw new Error("source.expected_commit must be a full lowercase Git SHA");
  if (!GIT_SHA_PATTERN.test(unchainRef)) throw new Error("source.unchain_ref must be a full lowercase Git SHA");
  if (expectedCommit !== commit) throw new Error("expected_commit must equal source.commit");
  if (schema === MACOS_SIGNING_QUALIFICATION_SCHEMA && ref !== "refs/heads/dev") {
    throw new Error("qualification evidence must originate from refs/heads/dev");
  }
}

function validateWorkflow(workflow) {
  exactKeys(workflow, ["run_id", "run_attempt"], "workflow");
  const runId = requiredString(workflow.run_id, "workflow.run_id");
  if (!RUN_ID_PATTERN.test(runId)) throw new Error("workflow.run_id must be a positive GitHub Actions run ID");
  requiredPositiveInteger(workflow.run_attempt, "workflow.run_attempt");
}

function validateCertificate(certificate) {
  exactKeys(certificate, ["subject", "leaf_sha256", "team_id", "valid_from", "valid_until"], "certificate");
  const subject = requiredString(certificate.subject, "certificate.subject");
  const leafSha256 = requiredString(certificate.leaf_sha256, "certificate.leaf_sha256");
  const teamId = requiredString(certificate.team_id, "certificate.team_id");
  if (!SHA256_PATTERN.test(leafSha256)) {
    throw new Error("certificate.leaf_sha256 must be sha256:<64 lowercase hex>");
  }
  if (!/^\w{10}$/.test(teamId)) throw new Error("certificate.team_id must be a 10-character Team ID");
  if (!subject.includes("Developer ID Application:") || !subject.includes(teamId)) {
    throw new Error("certificate.subject must identify the Developer ID Application and Team ID");
  }
  const validFrom = assertIsoDate(certificate.valid_from, "certificate.valid_from");
  const validUntil = assertIsoDate(certificate.valid_until, "certificate.valid_until");
  if (validUntil <= validFrom) throw new Error("certificate.valid_until must be after certificate.valid_from");
}

function validateApplications(applications, packageIdentity, target, certificate) {
  const values = requiredArray(applications, "applications");
  if (values.length !== APP_LOCATIONS.length) throw new Error("applications must contain build, dmg, and zip exactly once");
  values.forEach((application, index) => {
    exactKeys(application, ["location", "bundle_id", "version", "team_id", "architecture"], `applications[${index}]`);
    exactString(application.location, APP_LOCATIONS[index], `applications[${index}].location`);
    if (application.bundle_id !== packageIdentity.bundle_id) {
      throw new Error(`applications[${index}].bundle_id must equal package.bundle_id`);
    }
    if (application.version !== packageIdentity.version) {
      throw new Error(`applications[${index}].version must equal package.version`);
    }
    if (application.team_id !== certificate.team_id) {
      throw new Error(`applications[${index}].team_id must equal certificate.team_id`);
    }
    exactString(application.architecture, target.architecture, `applications[${index}].architecture`);
  });
}

function validateArtifacts(artifacts, version, target) {
  const values = requiredArray(artifacts, "artifacts");
  if (values.length !== ARTIFACT_FORMATS.length) {
    throw new Error("artifacts must contain blockmap, dmg, metadata, and zip exactly once");
  }
  const expectedNames = expectedArtifactNames(version, target);
  values.forEach((artifact, index) => {
    exactKeys(artifact, ["format", "name", "sha256", "size_bytes"], `artifacts[${index}]`);
    exactString(artifact.format, ARTIFACT_FORMATS[index], `artifacts[${index}].format`);
    exactString(artifact.name, expectedNames[index], `artifacts[${index}].name`);
    if (!SHA256_PATTERN.test(requiredString(artifact.sha256, `artifacts[${index}].sha256`))) {
      throw new Error(`artifacts[${index}].sha256 must be sha256:<64 lowercase hex>`);
    }
    requiredPositiveInteger(artifact.size_bytes, `artifacts[${index}].size_bytes`);
  });
  return values;
}

function validateUpdater(updater, artifacts) {
  exactKeys(updater, ["metadata_name", "payload_name", "payload_sha512", "payload_size_bytes"], "updater");
  const metadata = artifacts.find((artifact) => artifact.format === "metadata");
  const zip = artifacts.find((artifact) => artifact.format === "zip");
  exactString(updater.metadata_name, metadata.name, "updater.metadata_name");
  exactString(updater.payload_name, zip.name, "updater.payload_name");
  if (!SHA512_PATTERN.test(requiredString(updater.payload_sha512, "updater.payload_sha512"))) {
    throw new Error("updater.payload_sha512 must be a base64 SHA-512 digest");
  }
  if (updater.payload_size_bytes !== zip.size_bytes) {
    throw new Error("updater.payload_size_bytes must equal ZIP artifact size_bytes");
  }
  requiredPositiveInteger(updater.payload_size_bytes, "updater.payload_size_bytes");
}

function validateChecks(checks) {
  exactKeys(checks, ["codesign", "hardened_runtime", "notarization", "gatekeeper"], "checks");
  for (const key of ["codesign", "hardened_runtime", "notarization", "gatekeeper"]) {
    if (requiredBoolean(checks[key], `checks.${key}`) !== true) {
      throw new Error(`checks.${key} must be true`);
    }
  }
}

export function validateMacSigningEvidence(evidence) {
  if (!isPlainObject(evidence)) throw new Error("evidence must be an object");
  const schema = evidence.schema;
  if (![MACOS_SIGNING_QUALIFICATION_SCHEMA, MACOS_RELEASE_CANDIDATE_SIGNING_SCHEMA].includes(schema)) {
    throw new Error("evidence.schema must be a supported macOS signing evidence schema");
  }
  const rootKeys = [
    "schema",
    "status",
    "workflow",
    "source",
    "target",
    "package",
    "certificate",
    "applications",
    "artifacts",
    "updater",
    "checks",
    ...(schema === MACOS_RELEASE_CANDIDATE_SIGNING_SCHEMA ? ["release"] : []),
  ];
  exactKeys(evidence, rootKeys, "evidence");
  exactString(evidence.status, "passed", "status");
  validateWorkflow(evidence.workflow);
  validateSource(evidence.source, schema);

  exactKeys(evidence.target, ["id", "architecture"], "target");
  const targetId = requiredString(evidence.target.id, "target.id");
  const target = TARGETS[targetId];
  if (!target) throw new Error("target.id must be macos-arm64 or macos-x64");
  exactString(evidence.target.architecture, target.architecture, "target.architecture");

  exactKeys(evidence.package, ["bundle_id", "version"], "package");
  const bundleId = requiredString(evidence.package.bundle_id, "package.bundle_id");
  const version = requiredString(evidence.package.version, "package.version");
  if (bundleId !== "com.red.pupu") throw new Error("package.bundle_id must equal com.red.pupu");
  if (!SEMVER_PATTERN.test(version)) throw new Error("package.version must be valid SemVer");

  validateCertificate(evidence.certificate);
  validateApplications(evidence.applications, evidence.package, target, evidence.certificate);
  const artifacts = validateArtifacts(evidence.artifacts, version, target);
  validateUpdater(evidence.updater, artifacts);
  validateChecks(evidence.checks);

  if (schema === MACOS_RELEASE_CANDIDATE_SIGNING_SCHEMA) {
    exactKeys(evidence.release, ["tag", "commit"], "release");
    exactString(evidence.release.tag, `v${version}`, "release.tag");
    exactString(evidence.release.commit, evidence.source.commit, "release.commit");
  }
  return evidence;
}

function runChecked(command, args, label) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error(`${label} failed`);
  }
}

function runCaptured(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) throw new Error(`${label} failed`);
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function findApplications(root) {
  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name === "PuPu.app") matches.push(candidate);
      else if (entry.isDirectory()) visit(candidate);
    }
  };
  visit(root);
  return matches;
}

function requireOneApplication(root, location) {
  const applications = findApplications(root);
  if (applications.length !== 1) {
    throw new Error(`${location} must contain exactly one PuPu.app`);
  }
  return applications[0];
}

function readPlistValue(appPath, key) {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  return runChecked("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plistPath], `read ${key}`).trim();
}

function parseCertificate(appPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-macos-certificate-"));
  const certificatePrefix = path.join(tempRoot, "certificate-");
  try {
    runChecked("/usr/bin/codesign", ["--display", "--extract-certificates", certificatePrefix, appPath], "extract signing certificate");
    const leafPath = `${certificatePrefix}0`;
    if (!fs.existsSync(leafPath)) throw new Error("extract signing certificate failed");
    const details = runChecked(
      "/usr/bin/openssl",
      ["x509", "-inform", "der", "-noout", "-fingerprint", "-sha256", "-subject", "-startdate", "-enddate", "-in", leafPath],
      "inspect signing certificate",
    );
    const entries = Object.fromEntries(
      details.trim().split(/\r?\n/).map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
      }),
    );
    const fingerprint = (entries["sha256 fingerprint"] || "").replaceAll(":", "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error("inspect signing certificate failed");
    const validFrom = new Date(entries.notbefore || "");
    const validUntil = new Date(entries.notafter || "");
    if (Number.isNaN(validFrom.valueOf()) || Number.isNaN(validUntil.valueOf())) {
      throw new Error("inspect signing certificate failed");
    }
    return {
      subject: entries.subject || "",
      leaf_sha256: `sha256:${fingerprint}`,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function inspectApplication(appPath, location) {
  runChecked("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath], `${location} codesign verification`);
  const details = runCaptured("/usr/bin/codesign", ["-d", "--verbose=4", appPath], `${location} codesign inspection`);
  const bundleId = readPlistValue(appPath, "CFBundleIdentifier");
  const version = readPlistValue(appPath, "CFBundleShortVersionString");
  const executable = readPlistValue(appPath, "CFBundleExecutable");
  if (!/^[A-Za-z0-9._-]+$/.test(executable)) throw new Error(`${location} app executable is invalid`);
  const architecture = runChecked(
    "/usr/bin/lipo",
    ["-archs", path.join(appPath, "Contents", "MacOS", executable)],
    `${location} architecture inspection`,
  ).trim();
  const teamMatch = details.match(/^TeamIdentifier=(.+)$/m);
  if (!teamMatch) throw new Error(`${location} signing Team ID is missing`);
  if (!/flags=.*runtime/.test(details)) throw new Error(`${location} app lacks hardened runtime`);
  runChecked("/usr/bin/xcrun", ["stapler", "validate", appPath], `${location} notarization validation`);
  const assessment = runCaptured("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", appPath], `${location} Gatekeeper assessment`);
  if (!assessment.includes("Notarized Developer ID")) {
    throw new Error(`${location} Gatekeeper assessment did not confirm a notarized Developer ID`);
  }
  return {
    application: {
      location,
      bundle_id: bundleId,
      version,
      team_id: teamMatch[1].trim(),
      architecture,
    },
    certificate: parseCertificate(appPath),
  };
}

function mountDmgAndInspect(dmgPath) {
  const mountRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-macos-dmg-"));
  try {
    runChecked("/usr/bin/hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountRoot], "mount signed DMG");
    return inspectApplication(requireOneApplication(mountRoot, "DMG"), "dmg");
  } finally {
    try {
      runChecked("/usr/bin/hdiutil", ["detach", mountRoot, "-force"], "detach signed DMG");
    } finally {
      fs.rmSync(mountRoot, { recursive: true, force: true });
    }
  }
}

function extractZipAndInspect(zipPath) {
  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-macos-zip-"));
  try {
    runChecked("/usr/bin/ditto", ["-x", "-k", zipPath, extractRoot], "extract signed ZIP");
    return inspectApplication(requireOneApplication(extractRoot, "ZIP"), "zip");
  } finally {
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }
}

export function readAndValidateMacUpdaterMetadata({ metadataPath, zipPath, zipName, version }) {
  const metadata = YAML.parse(fs.readFileSync(metadataPath, "utf8"));
  if (!isPlainObject(metadata)) throw new Error("latest-mac.yml must be an object");
  if (metadata.version !== version) {
    throw new Error("latest-mac.yml version must equal package version");
  }
  const records = Array.isArray(metadata.files) ? metadata.files : [];
  if (records.length !== 1 || !isPlainObject(records[0]) || records[0].url !== zipName) {
    throw new Error("latest-mac.yml must describe the final ZIP exactly once");
  }
  if (!fs.existsSync(zipPath) || !fs.statSync(zipPath).isFile()) {
    throw new Error("final ZIP is missing for updater metadata verification");
  }
  const zipRecord = records[0];
  const actualSha512 = hashFileSha512(zipPath);
  const actualSize = fs.statSync(zipPath).size;
  if (
    metadata.path !== zipName ||
    metadata.sha512 !== actualSha512 ||
    zipRecord.sha512 !== actualSha512 ||
    zipRecord.size !== actualSize
  ) {
    throw new Error("latest-mac.yml must exact-bind the real ZIP SHA-512 and size");
  }
  if (!SHA512_PATTERN.test(requiredString(actualSha512, "final ZIP SHA-512"))) {
    throw new Error("final ZIP SHA-512 must be base64");
  }
  requiredPositiveInteger(actualSize, "final ZIP size");
  return {
    metadata_name: path.basename(metadataPath),
    payload_name: zipName,
    payload_sha512: actualSha512,
    payload_size_bytes: actualSize,
  };
}

function sameCertificate(left, right) {
  return left.subject === right.subject &&
    left.leaf_sha256 === right.leaf_sha256 &&
    left.valid_from === right.valid_from &&
    left.valid_until === right.valid_until;
}

function parseArgs(argv) {
  const options = {};
  const allowed = new Set([
    "--schema", "--target", "--version", "--source-ref", "--source-sha", "--expected-commit",
    "--unchain-ref", "--run-id", "--run-attempt", "--dist-dir", "--out",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) throw new Error(`unsupported argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${flag}`);
    const key = flag.slice(2).replaceAll("-", "_");
    if (Object.hasOwn(options, key)) throw new Error(`duplicate argument: ${flag}`);
    options[key] = value;
    index += 1;
  }
  const required = ["schema", "target", "version", "source_ref", "source_sha", "expected_commit", "unchain_ref", "run_id", "run_attempt", "dist_dir", "out"];
  for (const key of required) {
    if (!Object.hasOwn(options, key)) throw new Error(`missing required argument: --${key.replaceAll("_", "-")}`);
  }
  return options;
}

export function createMacSigningEvidence({
  schema,
  target: targetId,
  version,
  source_ref: sourceRef,
  source_sha: sourceSha,
  expected_commit: expectedCommit,
  unchain_ref: unchainRef,
  run_id: runId,
  run_attempt: runAttempt,
  dist_dir: distDir,
}) {
  const target = TARGETS[targetId];
  if (!target) throw new Error("target must be macos-arm64 or macos-x64");
  const contract = readReleaseArtifactContract(
    path.join(ROOT, "contracts", "release", "release-artifact-contract.v1.json"),
  );
  const resolvedDistDir = path.resolve(distDir);
  verifyRawPackageOutputDirectory({ contract, targetId, version, distDir: resolvedDistDir });
  const [blockmapName, dmgName, metadataName, zipName] = expectedArtifactNames(version, target);
  const build = inspectApplication(requireOneApplication(resolvedDistDir, "build output"), "build");
  const dmg = mountDmgAndInspect(path.join(resolvedDistDir, dmgName));
  const zip = extractZipAndInspect(path.join(resolvedDistDir, zipName));
  if (!sameCertificate(build.certificate, dmg.certificate) || !sameCertificate(build.certificate, zip.certificate)) {
    throw new Error("build, DMG, and ZIP signing certificates must match exactly");
  }
  const evidence = {
    schema,
    status: "passed",
    workflow: { run_id: runId, run_attempt: Number(runAttempt) },
    source: {
      ref: sourceRef,
      commit: sourceSha,
      expected_commit: expectedCommit,
      unchain_ref: unchainRef,
    },
    target: { id: targetId, architecture: target.architecture },
    package: { bundle_id: build.application.bundle_id, version: build.application.version },
    certificate: { ...build.certificate, team_id: build.application.team_id },
    applications: [build.application, dmg.application, zip.application],
    artifacts: [
      { format: "blockmap", name: blockmapName, sha256: hashFileSha256(path.join(resolvedDistDir, blockmapName)), size_bytes: fs.statSync(path.join(resolvedDistDir, blockmapName)).size },
      { format: "dmg", name: dmgName, sha256: hashFileSha256(path.join(resolvedDistDir, dmgName)), size_bytes: fs.statSync(path.join(resolvedDistDir, dmgName)).size },
      { format: "metadata", name: metadataName, sha256: hashFileSha256(path.join(resolvedDistDir, metadataName)), size_bytes: fs.statSync(path.join(resolvedDistDir, metadataName)).size },
      { format: "zip", name: zipName, sha256: hashFileSha256(path.join(resolvedDistDir, zipName)), size_bytes: fs.statSync(path.join(resolvedDistDir, zipName)).size },
    ],
    updater: readAndValidateMacUpdaterMetadata({
      metadataPath: path.join(resolvedDistDir, metadataName),
      zipPath: path.join(resolvedDistDir, zipName),
      zipName,
      version,
    }),
    checks: { codesign: true, hardened_runtime: true, notarization: true, gatekeeper: true },
  };
  if (schema === MACOS_RELEASE_CANDIDATE_SIGNING_SCHEMA) {
    evidence.release = { tag: `v${version}`, commit: sourceSha };
  }
  validateMacSigningEvidence(evidence);
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = createMacSigningEvidence(options);
    fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`[macos-signing-evidence] wrote ${path.basename(options.out)}`);
  } catch (error) {
    console.error(`[macos-signing-evidence] ${error.message || String(error)}`);
    process.exit(1);
  }
}
