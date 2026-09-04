import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import {
  buildReleaseAssetManifest,
  computeReleaseAssetManifestDigest,
  expectedTargetAssets,
  hashFileSha512,
  readReleaseArtifactContract,
  validateQualificationReceipt,
  validateReleaseAssetManifest,
  verifyReleaseAssetDirectory,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = path.join(ROOT, "contracts/release/release-artifact-contract.v1.json");
const CONTRACT = readReleaseArtifactContract(CONTRACT_PATH);
const VERSION = "0.1.10";
const TAG = `v${VERSION}`;
const COMMIT = "a".repeat(40);
const UNCHAIN = {
  artifact_sha256: `sha256:${"b".repeat(64)}`,
  runtime_manifest_digest: `sha256:${"c".repeat(64)}`,
  source_revision: "d".repeat(40),
};

const createFixture = (version = VERSION) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-release-assets-"));
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir);
  const assets = expectedTargetAssets(CONTRACT, version);
  for (const asset of assets) {
    fs.writeFileSync(path.join(assetDir, asset.name), `${asset.name}\n`, "utf8");
  }
  const buildUpdater = (name, payloadNames, primaryName) => {
    const files = payloadNames.map((payloadName) => ({
      url: payloadName,
      sha512: hashFileSha512(path.join(assetDir, payloadName)),
      size: fs.statSync(path.join(assetDir, payloadName)).size,
    }));
    const primary = files.find((file) => file.url === primaryName);
    fs.writeFileSync(path.join(assetDir, name), YAML.stringify({
      version,
      files,
      path: primaryName,
      sha512: primary.sha512,
      releaseDate: "2026-08-22T00:00:00.000Z",
    }), "utf8");
  };
  buildUpdater(
    "latest-mac.yml",
    [`PuPu-${version}-macos-arm64.zip`, `PuPu-${version}-macos-x64.zip`],
    `PuPu-${version}-macos-x64.zip`,
  );
  buildUpdater(
    "latest.yml",
    [`PuPu-${version}-windows-x64-setup.exe`],
    `PuPu-${version}-windows-x64-setup.exe`,
  );
  const manifest = buildReleaseAssetManifest({
    contract: CONTRACT,
    assetDir,
    tag: `v${version}`,
    version,
    commit: COMMIT,
    candidateRunId: "12345",
    unchain: UNCHAIN,
  });
  return { root, assetDir, manifest };
};

test("release artifact contract seals the four v0.1.10 targets and reserves future ARM slots", () => {
  assert.deepEqual(
    CONTRACT.targets.filter((target) => target.status === "required").map((target) => target.id),
    ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
  );
  assert.deepEqual(
    CONTRACT.targets.filter((target) => target.status === "reserved").map((target) => target.id),
    ["windows-arm64", "linux-arm64"],
  );
  assert.equal(expectedTargetAssets(CONTRACT, VERSION).some((asset) => asset.name.includes("intel") || asset.name.includes("amd64")), false);
});

test("valid release asset manifest and exact directory pass with merged Mac and Windows updater metadata", () => {
  const { assetDir, manifest } = createFixture();
  assert.equal(validateReleaseAssetManifest(manifest, CONTRACT).manifest_digest, manifest.manifest_digest);
  assert.equal(verifyReleaseAssetDirectory({ manifest, contract: CONTRACT, assetDir }).manifest_digest, manifest.manifest_digest);
  assert.equal(manifest.assets.length, 10);
  assert.deepEqual(manifest.updater_metadata.map((metadata) => metadata.name), ["latest-mac.yml", "latest.yml"]);
  assert.deepEqual(
    manifest.updater_metadata.find((metadata) => metadata.name === "latest-mac.yml").references.map((reference) => reference.name),
    ["PuPu-0.1.10-macos-arm64.zip", "PuPu-0.1.10-macos-x64.zip"],
  );
});

test("RC manifest keeps the full prerelease identity in tag, metadata, and filenames", () => {
  const version = "0.1.10-rc.1";
  const { assetDir, manifest } = createFixture(version);
  assert.equal(validateReleaseAssetManifest(manifest, CONTRACT).release.tag, `v${version}`);
  assert.equal(manifest.release.version, version);
  assert.ok(manifest.assets.every((asset) => asset.name.includes(version)));
  assert.equal(YAML.parse(fs.readFileSync(path.join(assetDir, "latest-mac.yml"), "utf8")).version, version);
  assert.equal(YAML.parse(fs.readFileSync(path.join(assetDir, "latest.yml"), "utf8")).version, version);
  assert.equal(verifyReleaseAssetDirectory({ manifest, contract: CONTRACT, assetDir }).release.version, version);
});

test("missing, extra, renamed, and byte-changed assets fail closed", () => {
  const missing = createFixture();
  fs.unlinkSync(path.join(missing.assetDir, "PuPu-0.1.10-linux-x64.deb"));
  assert.throws(() => verifyReleaseAssetDirectory({ manifest: missing.manifest, contract: CONTRACT, assetDir: missing.assetDir }), /missing/);

  const extra = createFixture();
  fs.writeFileSync(path.join(extra.assetDir, "PuPu-0.1.10-windows-arm64-setup.exe"), "future", "utf8");
  assert.throws(() => verifyReleaseAssetDirectory({ manifest: extra.manifest, contract: CONTRACT, assetDir: extra.assetDir }), /unexpected/);

  const renamed = createFixture();
  fs.renameSync(
    path.join(renamed.assetDir, "PuPu-0.1.10-macos-x64.dmg"),
    path.join(renamed.assetDir, "PuPu-0.1.10-macos-intel.dmg"),
  );
  assert.throws(() => verifyReleaseAssetDirectory({ manifest: renamed.manifest, contract: CONTRACT, assetDir: renamed.assetDir }), /missing/);

  const changed = createFixture();
  fs.appendFileSync(path.join(changed.assetDir, "PuPu-0.1.10-linux-x64.AppImage"), "changed", "utf8");
  assert.throws(() => verifyReleaseAssetDirectory({ manifest: changed.manifest, contract: CONTRACT, assetDir: changed.assetDir }), /bytes do not match/);
});

test("manifest rejects stale identity, altered target state, and stale updater payload metadata", () => {
  const { assetDir, manifest } = createFixture();
  const staleTag = structuredClone(manifest);
  staleTag.release.tag = "v0.1.11";
  staleTag.manifest_digest = computeReleaseAssetManifestDigest(staleTag);
  assert.throws(() => validateReleaseAssetManifest(staleTag, CONTRACT), /tag must equal/);

  const futureRequired = structuredClone(manifest);
  futureRequired.targets.find((target) => target.id === "windows-arm64").state = "required";
  futureRequired.manifest_digest = computeReleaseAssetManifestDigest(futureRequired);
  assert.throws(() => validateReleaseAssetManifest(futureRequired, CONTRACT), /does not match/);

  const staleMetadata = createFixture();
  const windowsPath = path.join(staleMetadata.assetDir, "latest.yml");
  const document = YAML.parse(fs.readFileSync(windowsPath, "utf8"));
  document.version = "0.1.9";
  fs.writeFileSync(windowsPath, YAML.stringify(document), "utf8");
  assert.throws(() => buildReleaseAssetManifest({
    contract: CONTRACT,
    assetDir: staleMetadata.assetDir,
    tag: TAG,
    version: VERSION,
    commit: COMMIT,
    candidateRunId: "12345",
    unchain: UNCHAIN,
  }), /version does not match/);
  assert.ok(assetDir);
});

test("updater metadata must carry the real SHA-512 of every payload", () => {
  const stale = createFixture();
  const updaterPath = path.join(stale.assetDir, "latest.yml");
  const document = YAML.parse(fs.readFileSync(updaterPath, "utf8"));
  document.files[0].sha512 = "not-the-payload-hash";
  document.sha512 = document.files[0].sha512;
  fs.writeFileSync(updaterPath, YAML.stringify(document), "utf8");
  assert.throws(() => buildReleaseAssetManifest({
    contract: CONTRACT,
    assetDir: stale.assetDir,
    tag: TAG,
    version: VERSION,
    commit: COMMIT,
    candidateRunId: "12345",
    unchain: UNCHAIN,
  }), /SHA-512/);
});

test("qualification receipt must bind every required target to the candidate manifest", () => {
  const { manifest } = createFixture();
  const receipt = {
    schema: "pupu.release-qualification.v1",
    status: "passed",
    candidate_run_id: manifest.release.candidate_run_id,
    qualification_run_id: "76543",
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
  };
  assert.equal(validateQualificationReceipt(receipt, manifest, CONTRACT).status, "passed");
  const missing = structuredClone(receipt);
  missing.targets.pop();
  assert.throws(() => validateQualificationReceipt(missing, manifest, CONTRACT), /must match all required/);
  const wrongRun = structuredClone(receipt);
  wrongRun.candidate_run_id = "other-run";
  assert.throws(() => validateQualificationReceipt(wrongRun, manifest, CONTRACT), /candidate_run_id/);
  const malformedQualificationRun = structuredClone(receipt);
  malformedQualificationRun.qualification_run_id = "not-a-run";
  assert.throws(() => validateQualificationReceipt(malformedQualificationRun, manifest, CONTRACT), /qualification_run_id/);
});
