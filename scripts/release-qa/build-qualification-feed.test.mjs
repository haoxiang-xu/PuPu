import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import {
  buildQualificationFeed,
  verifyQualificationFeedDirectory,
} from "./build-qualification-feed.mjs";
import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readJson,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
const VERSION = "0.1.10";
const digest = (character) => `sha256:${character.repeat(64)}`;

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-qualification-feed-"));
  const assetDir = path.join(root, "candidate", "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  for (const asset of expectedTargetAssets(CONTRACT, VERSION)) {
    fs.writeFileSync(path.join(assetDir, asset.name), `${asset.name}\n`, "utf8");
  }
  const writeMetadata = (name, payloadNames, primaryName) => {
    const files = payloadNames.map((payloadName) => ({
      url: payloadName,
      sha512: hashFileSha512(path.join(assetDir, payloadName)),
      size: fs.statSync(path.join(assetDir, payloadName)).size,
    }));
    const primary = files.find((file) => file.url === primaryName);
    fs.writeFileSync(path.join(assetDir, name), YAML.stringify({
      version: VERSION,
      files,
      path: primaryName,
      sha512: primary.sha512,
    }), "utf8");
  };
  writeMetadata("latest-mac.yml", [
    "PuPu-0.1.10-macos-arm64.zip",
    "PuPu-0.1.10-macos-x64.zip",
  ], "PuPu-0.1.10-macos-x64.zip");
  writeMetadata("latest.yml", ["PuPu-0.1.10-windows-x64-setup.exe"], "PuPu-0.1.10-windows-x64-setup.exe");
  const manifest = buildReleaseAssetManifest({
    contract: CONTRACT,
    assetDir,
    tag: "v0.1.10",
    version: VERSION,
    commit: "a".repeat(40),
    candidateRunId: "12345",
    unchain: {
      artifact_sha256: digest("a"),
      runtime_manifest_digest: digest("b"),
      source_revision: "c".repeat(40),
    },
  });
  fs.writeFileSync(path.join(root, "candidate", "release-assets.v1.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { root, candidateDir: path.join(root, "candidate"), manifest };
};

test("qualification feed contains only the exact Windows updater bytes from the sealed candidate", () => {
  const { root, candidateDir, manifest } = fixture();
  try {
    const feedDir = path.join(root, "windows-feed");
    const feed = buildQualificationFeed({ candidateDir, outDir: feedDir, targetId: "windows-x64", contract: CONTRACT });
    assert.equal(feed.candidate_manifest_digest, manifest.manifest_digest);
    assert.deepEqual(fs.readdirSync(feedDir).sort(), [
      "PuPu-0.1.10-windows-x64-setup.exe",
      "PuPu-0.1.10-windows-x64-setup.exe.blockmap",
      "latest.yml",
      "qualification-feed.v1.json",
    ]);
    assert.deepEqual(readJson(path.join(feedDir, "qualification-feed.v1.json")), feed);
    assert.equal(
      verifyQualificationFeedDirectory({ feedDir, manifest, contract: CONTRACT, targetId: "windows-x64" }).target_id,
      "windows-x64",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("qualification feed fails closed for unsupported targets, altered bytes, and extra files", () => {
  const { root, candidateDir, manifest } = fixture();
  try {
    assert.throws(
      () => buildQualificationFeed({ candidateDir, outDir: path.join(root, "linux-feed"), targetId: "linux-x64", contract: CONTRACT }),
      /unsupported/,
    );
    const feedDir = path.join(root, "mac-feed");
    buildQualificationFeed({ candidateDir, outDir: feedDir, targetId: "macos-arm64", contract: CONTRACT });
    fs.appendFileSync(path.join(feedDir, "latest-mac.yml"), "changed", "utf8");
    assert.throws(
      () => verifyQualificationFeedDirectory({ feedDir, manifest, contract: CONTRACT, targetId: "macos-arm64" }),
      /file bytes do not match sealed candidate/,
    );
    fs.writeFileSync(path.join(feedDir, "latest-mac.yml"), fs.readFileSync(path.join(candidateDir, "assets", "latest-mac.yml")));
    fs.writeFileSync(path.join(feedDir, "unexpected.bin"), "no", "utf8");
    assert.throws(
      () => verifyQualificationFeedDirectory({ feedDir, manifest, contract: CONTRACT, targetId: "macos-arm64" }),
      /inventory mismatch/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
