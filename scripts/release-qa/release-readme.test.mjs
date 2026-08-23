import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import YAML from "yaml";

import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";
import {
  README_DOWNLOADS_END,
  README_DOWNLOADS_START,
  renderReleaseDownloadBlock,
  replaceReleaseDownloadBlock,
} from "./release-readme.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT = readReleaseArtifactContract(
  path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"),
);

function manifestFixture() {
  const version = "0.1.10";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-release-readme-"));
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir);
  const assets = expectedTargetAssets(CONTRACT, version);
  for (const asset of assets) fs.writeFileSync(path.join(assetDir, asset.name), asset.name, "utf8");
  const writeMetadata = (name, names, primary) => fs.writeFileSync(path.join(assetDir, name), YAML.stringify({
    version,
    files: names.map((assetName) => ({
      url: assetName,
      sha512: hashFileSha512(path.join(assetDir, assetName)),
      size: fs.statSync(path.join(assetDir, assetName)).size,
    })),
    path: primary,
    sha512: hashFileSha512(path.join(assetDir, primary)),
  }), "utf8");
  writeMetadata("latest-mac.yml", ["PuPu-0.1.10-macos-arm64.zip", "PuPu-0.1.10-macos-x64.zip"], "PuPu-0.1.10-macos-x64.zip");
  writeMetadata("latest.yml", ["PuPu-0.1.10-windows-x64-setup.exe"], "PuPu-0.1.10-windows-x64-setup.exe");
  return {
    root,
    manifest: buildReleaseAssetManifest({
    contract: CONTRACT,
    assetDir,
    tag: "v0.1.10",
    version,
    commit: "a".repeat(40),
    candidateRunId: "777",
    unchain: {
      artifact_sha256: `sha256:${"b".repeat(64)}`,
      runtime_manifest_digest: `sha256:${"c".repeat(64)}`,
      source_revision: "d".repeat(40),
    },
    }),
  };
}

test("README download block is manifest-derived, explicit, and excludes reserved ARM targets", () => {
  const { manifest } = manifestFixture();
  const block = renderReleaseDownloadBlock({ manifest, contract: CONTRACT });
  assert.match(block, /releases\/download\/v0\.1\.10\/PuPu-0\.1\.10-macos-arm64\.dmg/);
  assert.match(block, /PuPu-0\.1\.10-windows-x64-setup\.exe/);
  assert.match(block, /PuPu-0\.1\.10-linux-x64\.deb/);
  assert.doesNotMatch(block, /windows-arm64|linux-arm64|intel|amd64/);
  const readme = `# Get PuPu\n\n${README_DOWNLOADS_START}\nold\n${README_DOWNLOADS_END}\n`;
  const updated = replaceReleaseDownloadBlock(readme, block);
  assert.equal(replaceReleaseDownloadBlock(updated, block), updated);
});

test("README CLI requires and consumes a verified manifest rather than package.json", () => {
  const { root, manifest } = manifestFixture();
  const manifestPath = path.join(root, "release-assets.v1.json");
  const readmePath = path.join(root, "README.md");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(readmePath, `# PuPu\n\n${README_DOWNLOADS_START}\nold\n${README_DOWNLOADS_END}\n`, "utf8");
  const script = path.join(ROOT, "scripts/update-readme-links.cjs");
  const result = spawnSync(process.execPath, [script, "--manifest", manifestPath, "--readme", readmePath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(readmePath, "utf8"), /PuPu-0\.1\.10-windows-x64-setup\.exe/);
});

test("README renderer fails closed when the marker pair is missing or duplicated", () => {
  const block = "replacement";
  assert.throws(() => replaceReleaseDownloadBlock("# no marker", block), /marker pair/);
  assert.throws(
    () => replaceReleaseDownloadBlock(`${README_DOWNLOADS_START}${README_DOWNLOADS_END}${README_DOWNLOADS_START}${README_DOWNLOADS_END}`, block),
    /exactly one/,
  );
});

test("build version preparation no longer mutates README links", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts/prepare-build-version.cjs"), "utf8");
  assert.doesNotMatch(source, /update-readme-links/);
});
