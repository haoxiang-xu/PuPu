import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import {
  certificateExtractionArguments,
  createMacSigningEvidence,
  readAndValidateMacUpdaterMetadata,
  validateMacSigningEvidence,
} from "./macos-signing-evidence.mjs";
import { hashFileSha512 } from "./release-artifact-manifest.mjs";

const QUALIFICATION_SCHEMA = "pupu.macos-signing-qualification.v1";
const RELEASE_SCHEMA = "pupu.macos-release-candidate-signing.v1";
const VERSION = "0.1.10";
const TARGET_ID = "macos-arm64";
const SOURCE_COMMIT = "a".repeat(40);
const UNCHAIN_REF = "b".repeat(40);
const ZIP_NAME = `PuPu-${VERSION}-macos-arm64.zip`;

test("macOS certificate extraction passes the output prefix as one codesign option", () => {
  assert.deepEqual(
    certificateExtractionArguments("/tmp/pupu-certificate-", "/tmp/PuPu.app"),
    [
      "--display",
      "--extract-certificates=/tmp/pupu-certificate-",
      "/tmp/PuPu.app",
    ],
  );
});

function artifact(format, name, sha256, sizeBytes) {
  return { format, name, sha256, size_bytes: sizeBytes };
}

function application(location) {
  return {
    location,
    bundle_id: "com.red.pupu",
    version: VERSION,
    team_id: "9DNPKH7N88",
    architecture: "arm64",
  };
}

function validEvidence({ schema = QUALIFICATION_SCHEMA, release } = {}) {
  const evidence = {
    schema,
    status: "passed",
    workflow: { run_id: "123456789", run_attempt: 2 },
    source: {
      ref: "refs/heads/dev",
      commit: SOURCE_COMMIT,
      expected_commit: SOURCE_COMMIT,
      unchain_ref: UNCHAIN_REF,
    },
    target: { id: TARGET_ID, architecture: "arm64" },
    package: { bundle_id: "com.red.pupu", version: VERSION },
    certificate: {
      subject: "CN=Developer ID Application: Haoxiang Xu (9DNPKH7N88)",
      leaf_sha256: `sha256:${"c".repeat(64)}`,
      team_id: "9DNPKH7N88",
      valid_from: "2026-08-25T00:00:00.000Z",
      valid_until: "2031-08-26T00:00:00.000Z",
    },
    applications: [application("build"), application("dmg"), application("zip")],
    artifacts: [
      artifact("blockmap", `${ZIP_NAME}.blockmap`, `sha256:${"d".repeat(64)}`, 101),
      artifact("dmg", `PuPu-${VERSION}-macos-arm64.dmg`, `sha256:${"e".repeat(64)}`, 102),
      artifact("metadata", "latest-mac.yml", `sha256:${"f".repeat(64)}`, 103),
      artifact("zip", ZIP_NAME, `sha256:${"1".repeat(64)}`, 104),
    ],
    updater: {
      metadata_name: "latest-mac.yml",
      payload_name: ZIP_NAME,
      payload_sha512: "ZmFrZS1zaGE1MTItZGlnZXN0",
      payload_size_bytes: 104,
    },
    checks: {
      codesign: true,
      hardened_runtime: true,
      notarization: true,
      gatekeeper: true,
    },
  };
  if (schema === RELEASE_SCHEMA) {
    evidence.release = release || { tag: `v${VERSION}`, commit: SOURCE_COMMIT };
  }
  return evidence;
}

test("macOS qualification and formal signing evidence use closed, non-interchangeable schemas", () => {
  assert.deepEqual(validateMacSigningEvidence(validEvidence()), validEvidence());

  const formal = validEvidence({ schema: RELEASE_SCHEMA });
  assert.deepEqual(validateMacSigningEvidence(formal), formal);

  const missingFormalRelease = validEvidence({ schema: RELEASE_SCHEMA });
  delete missingFormalRelease.release;
  assert.throws(() => validateMacSigningEvidence(missingFormalRelease), /missing required key: release/);

  const qualificationWithRelease = validEvidence();
  qualificationWithRelease.release = { tag: `v${VERSION}`, commit: SOURCE_COMMIT };
  assert.throws(() => validateMacSigningEvidence(qualificationWithRelease), /unexpected key: release/);
});

test("macOS signing evidence rejects unknown keys and invalid provenance", () => {
  const withUnknownKey = validEvidence();
  withUnknownKey.debug = true;
  assert.throws(() => validateMacSigningEvidence(withUnknownKey), /unexpected key: debug/);

  const mismatchedCommit = validEvidence();
  mismatchedCommit.source.expected_commit = "c".repeat(40);
  assert.throws(() => validateMacSigningEvidence(mismatchedCommit), /expected_commit must equal source.commit/);

  const wrongRef = validEvidence();
  wrongRef.source.ref = "refs/tags/v0.1.10";
  assert.throws(() => validateMacSigningEvidence(wrongRef), /qualification evidence must originate from refs\/heads\/dev/);
});

test("macOS signing evidence exact-binds application identity and trust checks", () => {
  const wrongArchitecture = validEvidence();
  wrongArchitecture.applications[1].architecture = "x86_64";
  assert.throws(() => validateMacSigningEvidence(wrongArchitecture), /applications\[1\].architecture must equal arm64/);

  const wrongTeam = validEvidence();
  wrongTeam.applications[2].team_id = "WRONGTEAM";
  assert.throws(() => validateMacSigningEvidence(wrongTeam), /applications\[2\].team_id must equal certificate.team_id/);

  const wrongBundle = validEvidence();
  wrongBundle.applications[0].bundle_id = "com.example.other";
  assert.throws(() => validateMacSigningEvidence(wrongBundle), /applications\[0\].bundle_id must equal package.bundle_id/);

  const noRuntime = validEvidence();
  noRuntime.checks.hardened_runtime = false;
  assert.throws(() => validateMacSigningEvidence(noRuntime), /checks.hardened_runtime must be true/);

  const noStaple = validEvidence();
  noStaple.checks.notarization = false;
  assert.throws(() => validateMacSigningEvidence(noStaple), /checks.notarization must be true/);

  const noGatekeeper = validEvidence();
  noGatekeeper.checks.gatekeeper = false;
  assert.throws(() => validateMacSigningEvidence(noGatekeeper), /checks.gatekeeper must be true/);
});

test("macOS signing evidence exact-binds final package files and updater metadata", () => {
  const incorrectArtifactName = validEvidence();
  incorrectArtifactName.artifacts[3].name = "PuPu-other.zip";
  assert.throws(() => validateMacSigningEvidence(incorrectArtifactName), /artifacts\[3\].name must equal PuPu-0.1.10-macos-arm64.zip/);

  const duplicateFormat = validEvidence();
  duplicateFormat.artifacts[2].format = "zip";
  assert.throws(() => validateMacSigningEvidence(duplicateFormat), /artifacts\[2\].format must equal metadata/);

  const staleUpdaterPayload = validEvidence();
  staleUpdaterPayload.updater.payload_size_bytes = 999;
  assert.throws(() => validateMacSigningEvidence(staleUpdaterPayload), /updater.payload_size_bytes must equal ZIP artifact size_bytes/);

  const wrongReleaseTag = validEvidence({ schema: RELEASE_SCHEMA });
  wrongReleaseTag.release.tag = "v9.9.9";
  assert.throws(() => validateMacSigningEvidence(wrongReleaseTag), /release.tag must equal v0.1.10/);
});

test("macOS signing evidence resolves the checked-in contract before inspecting a package", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-macos-evidence-contract-"));
  try {
    assert.throws(() => createMacSigningEvidence({
      schema: QUALIFICATION_SCHEMA,
      target: TARGET_ID,
      version: VERSION,
      source_ref: "refs/heads/dev",
      source_sha: SOURCE_COMMIT,
      expected_commit: SOURCE_COMMIT,
      unchain_ref: UNCHAIN_REF,
      run_id: "123456789",
      run_attempt: "1",
      dist_dir: root,
    }), /package output inventory mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("macOS updater metadata binds the final ZIP version, SHA-512, size, and sole payload", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-macos-updater-"));
  const zipName = ZIP_NAME;
  const zipPath = path.join(root, zipName);
  const metadataPath = path.join(root, "latest-mac.yml");
  const writeMetadata = (overrides = {}) => {
    const payload = fs.readFileSync(zipPath);
    const file = {
      url: zipName,
      sha512: hashFileSha512(zipPath),
      size: payload.length,
      ...overrides.file,
    };
    fs.writeFileSync(metadataPath, YAML.stringify({
      version: VERSION,
      files: [file],
      path: zipName,
      sha512: file.sha512,
      ...overrides.root,
    }), "utf8");
  };
  try {
    fs.writeFileSync(zipPath, "signed ZIP bytes", "utf8");
    writeMetadata();
    assert.deepEqual(readAndValidateMacUpdaterMetadata({
      metadataPath,
      zipPath,
      zipName,
      version: VERSION,
    }), {
      metadata_name: "latest-mac.yml",
      payload_name: zipName,
      payload_sha512: hashFileSha512(zipPath),
      payload_size_bytes: fs.statSync(zipPath).size,
    });

    writeMetadata({ file: { sha512: "stale-sha512" }, root: { sha512: "stale-sha512" } });
    assert.throws(() => readAndValidateMacUpdaterMetadata({ metadataPath, zipPath, zipName, version: VERSION }), /real ZIP SHA-512/);

    writeMetadata({ root: { version: "0.1.9" } });
    assert.throws(() => readAndValidateMacUpdaterMetadata({ metadataPath, zipPath, zipName, version: VERSION }), /version must equal package version/);

    writeMetadata({ root: { files: [{ url: zipName, sha512: hashFileSha512(zipPath), size: fs.statSync(zipPath).size }, { url: "unexpected.zip", sha512: hashFileSha512(zipPath), size: fs.statSync(zipPath).size }] } });
    assert.throws(() => readAndValidateMacUpdaterMetadata({ metadataPath, zipPath, zipName, version: VERSION }), /must describe the final ZIP exactly once/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
