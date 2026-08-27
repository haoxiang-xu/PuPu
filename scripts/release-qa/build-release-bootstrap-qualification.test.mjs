import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import { buildReleaseBootstrapQualificationReceipt } from "./build-release-bootstrap-qualification.mjs";
import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readReleaseArtifactContract,
  validateQualificationReceipt,
} from "./release-artifact-manifest.mjs";
import {
  LEGACY_RELEASE_PROJECTION_SCHEMA,
  readReleaseBootstrapPolicy,
} from "./release-bootstrap-policy.mjs";

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const fingerprint = "f".repeat(64);
const contract = readReleaseArtifactContract("contracts/release/release-artifact-contract.v1.json");
const policy = readReleaseBootstrapPolicy("contracts/release/release-bootstrap-policy.v1.json");

const createManifest = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-bootstrap-qualification-"));
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir);
  for (const asset of expectedTargetAssets(contract, "0.1.11")) {
    fs.writeFileSync(path.join(assetDir, asset.name), `${asset.name}\n`, "utf8");
  }
  const writeUpdater = (name, names, primaryName) => {
    const files = names.map((assetName) => ({
      url: assetName,
      sha512: hashFileSha512(path.join(assetDir, assetName)),
      size: fs.statSync(path.join(assetDir, assetName)).size,
    }));
    const primary = files.find((entry) => entry.url === primaryName);
    fs.writeFileSync(path.join(assetDir, name), YAML.stringify({
      version: "0.1.11",
      files,
      path: primaryName,
      sha512: primary.sha512,
    }), "utf8");
  };
  writeUpdater("latest-mac.yml", ["PuPu-0.1.11-macos-arm64.zip", "PuPu-0.1.11-macos-x64.zip"], "PuPu-0.1.11-macos-x64.zip");
  writeUpdater("latest.yml", ["PuPu-0.1.11-windows-x64-setup.exe"], "PuPu-0.1.11-windows-x64-setup.exe");
  return {
    root,
    manifest: buildReleaseAssetManifest({
      contract,
      assetDir,
      tag: "v0.1.11",
      version: "0.1.11",
      commit: "a".repeat(40),
      candidateRunId: "12345",
      unchain: {
        artifact_sha256: digest("1"),
        runtime_manifest_digest: digest("2"),
        source_revision: "b".repeat(40),
      },
    }),
  };
};

const form = (asset) => ({
  format: asset.format,
  installer: { name: asset.name, sha256: asset.sha256 },
  installed: {
    executable_sha256: digest("0"), app_asar_sha256: digest("1"), sidecar_sha256: digest("2"),
    snapshot_sha256: digest("3"), snapshot_fingerprint: fingerprint,
  },
  lifecycle: {
    executed_tests: 4, renderer_ready: true, packaged_sidecar_descendant: true,
    controlled_shutdown: true, process_cleanup: true,
  },
});
const installer = (manifest, targetId, format) => manifest.assets.find((asset) =>
  asset.target_id === targetId && asset.role === "installer" && asset.format === format);
const report = (manifest, targetId, forms) => ({
  schema: "pupu.installed-package-qualification.v1",
  target_id: targetId,
  candidate: { manifest_digest: manifest.manifest_digest },
  executed_tests: forms.length * 4,
  package_forms: forms,
});
const reports = (manifest) => [
  report(manifest, "macos-arm64", [form(installer(manifest, "macos-arm64", "dmg"))]),
  report(manifest, "macos-x64", [form(installer(manifest, "macos-x64", "dmg"))]),
  report(manifest, "windows-x64", [form(installer(manifest, "windows-x64", "exe"))]),
  report(manifest, "linux-x64", [form(installer(manifest, "linux-x64", "AppImage")), form(installer(manifest, "linux-x64", "deb"))]),
];
const projection = () => ({ schema: LEGACY_RELEASE_PROJECTION_SCHEMA, release: structuredClone(policy.legacy_release) });

test("bootstrap receipt binds exact v0.1.11, four fresh targets, policy, and explicit restart NOT_RUN", () => {
  const { root, manifest } = createManifest();
  try {
    const receipt = buildReleaseBootstrapQualificationReceipt({
      manifest,
      contract,
      policy,
      legacyProjection: projection(),
      reports: reports(manifest),
      qualificationRunId: "67890",
      confirmation: "BOOTSTRAP_V0_1_11",
    });
    assert.equal(receipt.schema, "pupu.release-bootstrap-qualification.v1");
    assert.equal(receipt.restart_disposition.status, "not_run");
    assert.deepEqual(receipt.restart_targets, []);
    assert.equal(receipt.fresh_targets.length, 4);
    assert.equal(validateQualificationReceipt(receipt, manifest, contract, { bootstrapPolicy: policy }).status, "passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bootstrap receipt rejects wrong confirmation, same run, and legacy or target drift", () => {
  const { root, manifest } = createManifest();
  const input = {
    manifest,
    contract,
    policy,
    legacyProjection: projection(),
    reports: reports(manifest),
    qualificationRunId: "67890",
    confirmation: "BOOTSTRAP_V0_1_11",
  };
  try {
    assert.throws(() => buildReleaseBootstrapQualificationReceipt({ ...input, confirmation: "PUBLISH" }), /confirmation/);
    assert.throws(() => buildReleaseBootstrapQualificationReceipt({ ...input, qualificationRunId: "12345" }), /must be different/);
    const legacyDrift = projection();
    legacyDrift.release.assets[0].size += 1;
    assert.throws(() => buildReleaseBootstrapQualificationReceipt({ ...input, legacyProjection: legacyDrift }), /frozen bootstrap policy/);
    assert.throws(() => buildReleaseBootstrapQualificationReceipt({ ...input, reports: reports(manifest).slice(1) }), /must match required targets/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
