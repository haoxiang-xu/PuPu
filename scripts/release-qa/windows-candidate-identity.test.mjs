import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildWindowsCandidateIdentityReport, sealCandidateIdentityRecord, validateCandidateIdentityChain } from "./windows-candidate-identity.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(fs.readFileSync(path.join(repoRoot, "contracts/memory-v2/windows-candidate-identity-fixture.v1.json"), "utf8"));
const hash = (digit) => `sha256:${digit.repeat(64)}`;
const chainFor = (snapshot, { signed = false } = {}) => {
  const payloadLineage = sealCandidateIdentityRecord({ schema: "pupu.windows-payload-lineage.v1", ...fixture.payload_lineage });
  const releaseSnapshot = sealCandidateIdentityRecord({ schema: "pupu.windows-release-snapshot.v1", ...snapshot });
  const buildIdentity = sealCandidateIdentityRecord({ schema: "pupu.windows-build-identity.v1", payload_lineage_fingerprint: payloadLineage.fingerprint, release_snapshot_fingerprint: releaseSnapshot.fingerprint });
  const packageAttestation = sealCandidateIdentityRecord({
    app_sha256: hash("3"), asar_sha256: hash("4"), build_identity_fingerprint: buildIdentity.fingerprint,
    installer_sha256: signed ? hash("6") : hash("5"), schema: "pupu.windows-package-attestation.v1",
    signing: { allowed_deltas: signed ? ["installer_authenticode_envelope"] : [], kind: signed ? "authenticode" : "unsigned", pre_sign_app_sha256: hash("3"), pre_sign_asar_sha256: hash("4"), pre_sign_installer_sha256: hash("5") },
  });
  const installAttestation = sealCandidateIdentityRecord({ installed_app_sha256: hash("3"), installed_asar_sha256: hash("4"), installed_sidecar_sha256: fixture.payload_lineage.sidecar_sha256, package_attestation_fingerprint: packageAttestation.fingerprint, schema: "pupu.windows-install-attestation.v1" });
  const evidenceEnvelope = sealCandidateIdentityRecord({ install_attestation_fingerprint: installAttestation.fingerprint, package_attestation_fingerprint: packageAttestation.fingerprint, payload_lineage_fingerprint: payloadLineage.fingerprint, schema: "pupu.windows-evidence-envelope.v1" });
  return { payloadLineage, releaseSnapshot, buildIdentity, packageAttestation, installAttestation, evidenceEnvelope };
};

test("W0-05 accepts a non-self-referential five-layer candidate chain", () => {
  const chain = chainFor(fixture.snapshots.shadow);
  assert.match(validateCandidateIdentityChain(chain).evidenceEnvelope, /^sha256:/);
});

test("W0-05 gives each immutable snapshot a new build identity while retaining payload lineage", () => {
  const shadow = chainFor(fixture.snapshots.shadow);
  const active = chainFor(fixture.snapshots.active_descendant, { signed: true });
  validateCandidateIdentityChain(shadow);
  validateCandidateIdentityChain(active);
  assert.equal(shadow.payloadLineage.fingerprint, active.payloadLineage.fingerprint);
  assert.notEqual(shadow.buildIdentity.fingerprint, active.buildIdentity.fingerprint);
  assert.notEqual(shadow.packageAttestation.fingerprint, active.packageAttestation.fingerprint);
});

test("W0-05 rejects self-reference, future install digests, and unsigned payload deltas", () => {
  const chain = chainFor(fixture.snapshots.shadow);
  const selfReferential = { ...chain.buildIdentity, payload_lineage_fingerprint: "sha256:" + "0".repeat(64) };
  assert.throws(() => validateCandidateIdentityChain({ ...chain, buildIdentity: selfReferential }), /build identity parent mismatch/);
  const futureDigest = { ...chain.buildIdentity, installer_sha256: hash("7") };
  assert.throws(() => validateCandidateIdentityChain({ ...chain, buildIdentity: futureDigest }), /exact keys/);
  const payloadDelta = sealCandidateIdentityRecord({ ...chain.packageAttestation, app_sha256: hash("8") });
  assert.throws(() => validateCandidateIdentityChain({ ...chain, packageAttestation: payloadDelta }), /payload delta invalid/);
});

test("W0-05 candidate report exposes only a complete verified chain with nonzero evidence", () => {
  const chain = chainFor(fixture.snapshots.shadow);
  const report = buildWindowsCandidateIdentityReport({ ...chain, executedTests: 3 });

  assert.deepEqual(Object.keys(report).sort(), [
    "build_identity_fingerprint",
    "evidence_envelope_fingerprint",
    "executed_tests",
    "install_attestation_fingerprint",
    "kind",
    "package_attestation_fingerprint",
    "payload_lineage_fingerprint",
    "release_snapshot_fingerprint",
    "schema",
  ]);
  assert.equal(report.executed_tests, 3);
  assert.equal(report.payload_lineage_fingerprint, chain.payloadLineage.fingerprint);
  assert.throws(
    () => buildWindowsCandidateIdentityReport({ ...chain, executedTests: 0 }),
    /nonzero executed tests/,
  );
});
