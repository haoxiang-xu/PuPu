import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildReleaseQualificationReceipt } from "./build-release-qualification.mjs";
import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";
import YAML from "yaml";

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const fingerprint = "f".repeat(64);
const contract = readReleaseArtifactContract("contracts/release/release-artifact-contract.v1.json");
const createManifest = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-qualification-"));
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir);
  const version = "0.1.10";
  for (const asset of expectedTargetAssets(contract, version)) {
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
  writeUpdater("latest-mac.yml", [
    "PuPu-0.1.10-macos-arm64.zip",
    "PuPu-0.1.10-macos-x64.zip",
  ], "PuPu-0.1.10-macos-x64.zip");
  writeUpdater("latest.yml", ["PuPu-0.1.10-windows-x64-setup.exe"], "PuPu-0.1.10-windows-x64-setup.exe");
  return {
    root,
    manifest: buildReleaseAssetManifest({
      contract,
      assetDir,
      tag: "v0.1.10",
      version,
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

const form = (asset, letter) => ({
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

const report = (manifest, targetId, packageForms) => ({
  schema: "pupu.installed-package-qualification.v1",
  target_id: targetId,
  candidate: { manifest_digest: manifest.manifest_digest },
  executed_tests: packageForms.length * 4,
  package_forms: packageForms,
});

const installer = (manifest, targetId, format) => manifest.assets.find((asset) =>
  asset.target_id === targetId && asset.role === "installer" && asset.format === format);

const reports = (manifest) => [
  report(manifest, "macos-arm64", [form(installer(manifest, "macos-arm64", "dmg"), "4")]),
  report(manifest, "macos-x64", [form(installer(manifest, "macos-x64", "dmg"), "5")]),
  report(manifest, "windows-x64", [form(installer(manifest, "windows-x64", "exe"), "6")]),
  report(manifest, "linux-x64", [
    form(installer(manifest, "linux-x64", "AppImage"), "7"),
    form(installer(manifest, "linux-x64", "deb"), "8"),
  ]),
];

test("builds a strict qualification receipt from all required targets", () => {
  const { root, manifest } = createManifest();
  try {
    const receipt = buildReleaseQualificationReceipt({
      manifest,
      contract,
      reports: reports(manifest),
      qualificationRunId: "76543",
    });
    assert.equal(receipt.qualification_run_id, "76543");
    assert.deepEqual(receipt.targets.map((target) => target.id), [
      "linux-x64", "macos-arm64", "macos-x64", "windows-x64",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a missing or duplicate installed target report", () => {
  const { root, manifest } = createManifest();
  try {
    assert.throws(
      () => buildReleaseQualificationReceipt({ manifest, contract, reports: reports(manifest).slice(1), qualificationRunId: "76543" }),
      /must match required targets/,
    );
    const duplicate = reports(manifest);
    duplicate.push(duplicate[0]);
    assert.throws(
      () => buildReleaseQualificationReceipt({ manifest, contract, reports: duplicate, qualificationRunId: "76543" }),
      /repeats target/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects installer name and hash drift from the sealed candidate", () => {
  const { root, manifest } = createManifest();
  try {
    const wrongName = reports(manifest);
    wrongName[2].package_forms[0].installer.name = "not-in-candidate.exe";
    assert.throws(
      () => buildReleaseQualificationReceipt({ manifest, contract, reports: wrongName, qualificationRunId: "76543" }),
      /installer.name does not match candidate manifest/,
    );
    const wrongHash = reports(manifest);
    wrongHash[2].package_forms[0].installer.sha256 = digest("f");
    assert.throws(
      () => buildReleaseQualificationReceipt({ manifest, contract, reports: wrongHash, qualificationRunId: "76543" }),
      /installer.sha256 does not match candidate manifest/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
