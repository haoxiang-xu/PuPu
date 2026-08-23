import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import YAML from "yaml";

import {
  expectedTargetAssets,
  hashFileSha512,
  readJson,
  readReleaseArtifactContract,
  validateReleaseAssetManifest,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ASSEMBLER = path.join(ROOT, "scripts/release-qa/assemble-release-candidate.mjs");
const VERIFIER = path.join(ROOT, "scripts/release-qa/verify-release-candidate.mjs");
const CONTRACT = readReleaseArtifactContract(
  path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"),
);
const VERSION = "0.1.10";
const TAG = `v${VERSION}`;
const COMMIT = "a".repeat(40);
const UNCHAIN = {
  artifact_sha256: `sha256:${"b".repeat(64)}`,
  runtime_manifest_digest: `sha256:${"c".repeat(64)}`,
  source_revision: "d".repeat(40),
};

const packageArtifactNames = {
  "macos-arm64": "pupu-package-mac-arm64",
  "macos-x64": "pupu-package-mac-intel",
  "windows-x64": "pupu-package-windows",
  "linux-x64": "pupu-package-linux",
};

function writeRawUpdater(target, distDir, targetAssets) {
  if (!target.updater_channel) return;
  const payload = targetAssets.find((asset) =>
    asset.role === "updater-payload" || (target.id === "windows-x64" && asset.format === "exe")
  );
  fs.writeFileSync(path.join(distDir, target.updater_channel), YAML.stringify({
    version: VERSION,
    files: [{
      url: payload.name,
      sha512: hashFileSha512(path.join(distDir, payload.name)),
      size: fs.statSync(path.join(distDir, payload.name)).size,
    }],
    path: payload.name,
    sha512: hashFileSha512(path.join(distDir, payload.name)),
    releaseDate: "2026-08-22T00:00:00.000Z",
  }), "utf8");
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-release-candidate-"));
  const packageDir = path.join(root, "package-artifacts");
  fs.mkdirSync(packageDir);
  for (const target of CONTRACT.targets.filter((candidate) => candidate.status === "required")) {
    const distDir = path.join(packageDir, packageArtifactNames[target.id], "dist");
    fs.mkdirSync(distDir, { recursive: true });
    const targetAssets = expectedTargetAssets(CONTRACT, VERSION)
      .filter((asset) => asset.target_id === target.id);
    for (const asset of targetAssets) {
      fs.writeFileSync(path.join(distDir, asset.name), `${asset.name}\n`, "utf8");
    }
    writeRawUpdater(target, distDir, targetAssets);
  }
  const reportPath = path.join(root, "release-qa-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify({
    mode: "release-candidate",
    version: VERSION,
    git: { sha: COMMIT, run_id: "554433" },
    unchain: UNCHAIN,
    deterministic_result: { status: "passed" },
  }, null, 2)}\n`, "utf8");
  return { root, packageDir, reportPath, outDir: path.join(root, "candidate") };
}

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], { encoding: "utf8" });
}

function writeQualificationReceipt(root, manifest, qualificationRunId = "665544") {
  const qualificationPath = path.join(root, "release-qualification.v1.json");
  fs.writeFileSync(qualificationPath, `${JSON.stringify({
    schema: "pupu.release-qualification.v1",
    status: "passed",
    candidate_run_id: manifest.release.candidate_run_id,
    qualification_run_id: qualificationRunId,
    manifest_digest: manifest.manifest_digest,
    release: {
      tag: TAG,
      version: VERSION,
      commit: COMMIT,
    },
    targets: [
      { id: "linux-x64", status: "passed" },
      { id: "macos-arm64", status: "passed" },
      { id: "macos-x64", status: "passed" },
      { id: "windows-x64", status: "passed" },
    ],
  }, null, 2)}\n`, "utf8");
  return qualificationPath;
}

test("candidate assembler merges architecture-specific updater metadata and seals exact bytes", () => {
  const { packageDir, reportPath, outDir } = fixture();
  const assembled = run(ASSEMBLER, [
    "--package-dir", packageDir,
    "--qa-report", reportPath,
    "--out-dir", outDir,
    "--tag", TAG,
    "--version", VERSION,
    "--commit", COMMIT,
    "--run-id", "554433",
  ]);
  assert.equal(assembled.status, 0, assembled.stderr);
  const manifestPath = path.join(outDir, "release-assets.v1.json");
  const manifest = readJson(manifestPath);
  validateReleaseAssetManifest(manifest, CONTRACT);
  const mac = YAML.parse(fs.readFileSync(path.join(outDir, "assets", "latest-mac.yml"), "utf8"));
  assert.deepEqual(mac.files.map((file) => file.url), [
    "PuPu-0.1.10-macos-arm64.zip",
    "PuPu-0.1.10-macos-x64.zip",
  ]);
  assert.equal(mac.path, "PuPu-0.1.10-macos-x64.zip");
  const verified = run(VERIFIER, [
    "--manifest", manifestPath,
    "--asset-dir", path.join(outDir, "assets"),
    "--qa-report", path.join(outDir, "release-qa-report.json"),
    "--tag", TAG,
    "--commit", COMMIT,
  ]);
  assert.equal(verified.status, 0, verified.stderr);
});

test("candidate verifier binds QA report and qualification receipt to the requested Actions runs", () => {
  const { root, packageDir, reportPath, outDir } = fixture();
  const assembled = run(ASSEMBLER, [
    "--package-dir", packageDir,
    "--qa-report", reportPath,
    "--out-dir", outDir,
    "--tag", TAG,
    "--version", VERSION,
    "--commit", COMMIT,
    "--run-id", "554433",
  ]);
  assert.equal(assembled.status, 0, assembled.stderr);
  const manifestPath = path.join(outDir, "release-assets.v1.json");
  const manifest = readJson(manifestPath);
  const qualificationPath = writeQualificationReceipt(root, manifest);
  const command = [
    "--manifest", manifestPath,
    "--asset-dir", path.join(outDir, "assets"),
    "--qa-report", path.join(outDir, "release-qa-report.json"),
    "--qualification", qualificationPath,
    "--require-qualification", "true",
    "--tag", TAG,
    "--commit", COMMIT,
    "--candidate-run-id", "554433",
    "--qualification-run-id", "665544",
  ];
  assert.equal(run(VERIFIER, command).status, 0);
  const wrongCandidate = [...command];
  wrongCandidate[wrongCandidate.indexOf("--candidate-run-id") + 1] = "554432";
  assert.match(run(VERIFIER, wrongCandidate).stderr, /candidate run ID/);
  const wrongQualification = [...command];
  wrongQualification[wrongQualification.indexOf("--qualification-run-id") + 1] = "665543";
  assert.match(run(VERIFIER, wrongQualification).stderr, /qualification run ID/);
});

test("candidate assembler rejects missing updater metadata instead of guessing it", () => {
  const { packageDir, reportPath, outDir } = fixture();
  fs.unlinkSync(path.join(packageDir, "pupu-package-mac-arm64", "dist", "latest-mac.yml"));
  const result = run(ASSEMBLER, [
    "--package-dir", packageDir,
    "--qa-report", reportPath,
    "--out-dir", outDir,
    "--tag", TAG,
    "--version", VERSION,
    "--commit", COMMIT,
    "--run-id", "554433",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing=latest-mac\.yml/);
});

test("candidate assembler rejects updater metadata with a fake payload SHA-512", () => {
  const { packageDir, reportPath, outDir } = fixture();
  const updaterPath = path.join(packageDir, "pupu-package-windows", "dist", "latest.yml");
  const updater = YAML.parse(fs.readFileSync(updaterPath, "utf8"));
  updater.files[0].sha512 = "fake-payload-hash";
  updater.sha512 = updater.files[0].sha512;
  fs.writeFileSync(updaterPath, YAML.stringify(updater), "utf8");
  const result = run(ASSEMBLER, [
    "--package-dir", packageDir,
    "--qa-report", reportPath,
    "--out-dir", outDir,
    "--tag", TAG,
    "--version", VERSION,
    "--commit", COMMIT,
    "--run-id", "554433",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-512/);
});

test("candidate assembler rejects a QA report from another Actions run", () => {
  const { packageDir, reportPath, outDir } = fixture();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.git.run_id = "554432";
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const result = run(ASSEMBLER, [
    "--package-dir", packageDir,
    "--qa-report", reportPath,
    "--out-dir", outDir,
    "--tag", TAG,
    "--version", VERSION,
    "--commit", COMMIT,
    "--run-id", "554433",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /run ID/);
});

test("candidate assembler rejects an unallowlisted raw package output", () => {
  const { packageDir, reportPath, outDir } = fixture();
  fs.writeFileSync(
    path.join(packageDir, "pupu-package-linux", "dist", "PuPu-0.1.10-linux-arm64.AppImage"),
    "future asset",
    "utf8",
  );
  const result = run(ASSEMBLER, [
    "--package-dir", packageDir,
    "--qa-report", reportPath,
    "--out-dir", outDir,
    "--tag", TAG,
    "--version", VERSION,
    "--commit", COMMIT,
    "--run-id", "554433",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /package output inventory mismatch/);
});
