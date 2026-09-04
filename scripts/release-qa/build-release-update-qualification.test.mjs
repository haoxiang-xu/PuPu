import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import { buildReleaseUpdateQualificationReceipt } from "./build-release-update-qualification.mjs";
import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const SHA512 = "cGF5bG9hZA==";
const CONTRACT = readReleaseArtifactContract("contracts/release/release-artifact-contract.v1.json");
const SOURCE = { fromTag: "v0.1.9", fromVersion: "0.1.9", fromCommit: "b".repeat(40) };

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-release-update-qualification-"));
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir);
  const version = "0.1.10";
  for (const asset of expectedTargetAssets(CONTRACT, version)) {
    fs.writeFileSync(path.join(assetDir, asset.name), `${asset.name}\n`, "utf8");
  }
  const writeUpdater = (name, names, primaryName) => {
    const files = names.map((assetName) => ({
      url: assetName,
      sha512: hashFileSha512(path.join(assetDir, assetName)),
      size: fs.statSync(path.join(assetDir, assetName)).size,
    }));
    const primary = files.find((file) => file.url === primaryName);
    fs.writeFileSync(path.join(assetDir, name), YAML.stringify({
      version,
      files,
      path: primaryName,
      sha512: primary.sha512,
    }), "utf8");
  };
  writeUpdater("latest-mac.yml", ["PuPu-0.1.10-macos-arm64.zip", "PuPu-0.1.10-macos-x64.zip"], "PuPu-0.1.10-macos-x64.zip");
  writeUpdater("latest.yml", ["PuPu-0.1.10-windows-x64-setup.exe"], "PuPu-0.1.10-windows-x64-setup.exe");
  return {
    root,
    manifest: buildReleaseAssetManifest({
      contract: CONTRACT,
      assetDir,
      tag: "v0.1.10",
      version,
      commit: "a".repeat(40),
      candidateRunId: "12345",
      unchain: {
        artifact_sha256: digest("1"), runtime_manifest_digest: digest("2"), source_revision: "c".repeat(40),
      },
    }),
  };
};

const form = (asset, letter) => ({
  format: asset.format,
  installer: { name: asset.name, sha256: asset.sha256 },
  installed: {
    executable_sha256: digest(letter), app_asar_sha256: digest(letter), sidecar_sha256: digest(letter),
    snapshot_sha256: digest(letter), snapshot_fingerprint: letter.repeat(64),
  },
  lifecycle: {
    executed_tests: 4, renderer_ready: true, packaged_sidecar_descendant: true,
    controlled_shutdown: true, process_cleanup: true,
  },
});

const installer = (manifest, targetId, format) => manifest.assets.find((asset) =>
  asset.target_id === targetId && asset.role === "installer" && asset.format === format);

const freshReports = (manifest) => [
  { schema: "pupu.installed-package-qualification.v1", target_id: "macos-arm64", candidate: { manifest_digest: manifest.manifest_digest }, executed_tests: 4, package_forms: [form(installer(manifest, "macos-arm64", "dmg"), "1")] },
  { schema: "pupu.installed-package-qualification.v1", target_id: "macos-x64", candidate: { manifest_digest: manifest.manifest_digest }, executed_tests: 4, package_forms: [form(installer(manifest, "macos-x64", "dmg"), "2")] },
  { schema: "pupu.installed-package-qualification.v1", target_id: "windows-x64", candidate: { manifest_digest: manifest.manifest_digest }, executed_tests: 4, package_forms: [form(installer(manifest, "windows-x64", "exe"), "3")] },
  { schema: "pupu.installed-package-qualification.v1", target_id: "linux-x64", candidate: { manifest_digest: manifest.manifest_digest }, executed_tests: 8, package_forms: [form(installer(manifest, "linux-x64", "AppImage"), "4"), form(installer(manifest, "linux-x64", "deb"), "5")] },
];

const restartReport = (manifest, targetId) => {
  const metadata = manifest.updater_metadata.find((item) => item.target_ids.includes(targetId));
  const payload = manifest.assets.find((asset) => asset.target_id === targetId && (
    asset.role === "updater-payload" || (targetId === "windows-x64" && asset.role === "installer")
  ));
  const blockmap = manifest.assets.find((asset) => asset.target_id === targetId && asset.role === "updater-blockmap");
  return {
    schema: "pupu.restart-update-qualification.v1", status: "passed", target_id: targetId,
    candidate: { manifest_digest: manifest.manifest_digest, to_tag: "v0.1.10", to_version: "0.1.10" },
    fixture: {
      from_tag: SOURCE.fromTag, from_version: SOURCE.fromVersion, from_commit: SOURCE.fromCommit,
      sha256: digest(targetId === "windows-x64" ? "6" : "7"), signer_subject: "CN=PuPu", signer_thumbprint: "A".repeat(40),
      allowed_differences: ["app-update.yml"],
    },
    feed: {
      schema: "pupu.qualification-feed.v1", transport: "runner-loopback",
      metadata: { name: metadata.name, sha256: metadata.sha256 },
      payload: { name: payload.name, sha256: payload.sha256, sha512: metadata.references.find((item) => item.name === payload.name).sha512 || SHA512 },
      blockmap: { name: blockmap.name, sha256: blockmap.sha256 },
    },
    update: {
      attempts: 1, duplicate_install_blocked: true, old_process_cleanup: true,
      events: ["checking", "downloading", "downloaded", "install_requested", "old_process_exited", "relaunched"],
    },
    installed: {
      identity: {
        app_asar_sha256: digest("8"), executable_sha256: digest("8"), sidecar_sha256: digest("8"),
        snapshot_sha256: digest("8"), snapshot_fingerprint: "8".repeat(64),
      },
      sentinel: { before_sha256: digest("9"), after_sha256: digest("9"), retained: true },
    },
    executed_tests: 12,
  };
};

test("complete update receipt requires every fresh and restart target with one explicit N-1 source", () => {
  const { root, manifest } = fixture();
  try {
    const receipt = buildReleaseUpdateQualificationReceipt({
      manifest, contract: CONTRACT, freshReports: freshReports(manifest),
      restartReports: ["macos-arm64", "macos-x64", "windows-x64"].map((targetId) => restartReport(manifest, targetId)),
      qualificationRunId: "76543", fixtureSource: SOURCE,
    });
    assert.equal(receipt.schema, "pupu.release-update-qualification.v1");
    assert.deepEqual(receipt.restart_targets.map((target) => target.id), ["macos-arm64", "macos-x64", "windows-x64"]);
    assert.deepEqual(receipt.fixture_source, {
      from_tag: "v0.1.9", from_version: "0.1.9", from_commit: "b".repeat(40),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("complete update receipt rejects a missing restart report or a fixture source mismatch", () => {
  const { root, manifest } = fixture();
  try {
    const incomplete = ["macos-arm64", "windows-x64"].map((targetId) => restartReport(manifest, targetId));
    assert.throws(
      () => buildReleaseUpdateQualificationReceipt({
        manifest, contract: CONTRACT, freshReports: freshReports(manifest), restartReports: incomplete,
        qualificationRunId: "76543", fixtureSource: SOURCE,
      }),
      /must match required targets/,
    );
    const mismatch = ["macos-arm64", "macos-x64", "windows-x64"].map((targetId) => restartReport(manifest, targetId));
    mismatch[0].fixture.from_commit = "d".repeat(40);
    assert.throws(
      () => buildReleaseUpdateQualificationReceipt({
        manifest, contract: CONTRACT, freshReports: freshReports(manifest), restartReports: mismatch,
        qualificationRunId: "76543", fixtureSource: SOURCE,
      }),
      /fixture source does not match/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
