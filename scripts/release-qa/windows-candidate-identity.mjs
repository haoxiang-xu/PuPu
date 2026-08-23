import crypto from "node:crypto";

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must have exact keys`);
  }
};
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const fingerprint = (value) => {
  const { fingerprint: _fingerprint, ...body } = value;
  return `sha256:${crypto.createHash("sha256")
    .update(`${body.schema}\u0000${JSON.stringify(stable(body))}`, "utf8")
    .digest("hex")}`;
};
const hash = (value, label) => {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be sha256`);
};
const assertFingerprint = (value, label) => {
  hash(value.fingerprint, `${label}.fingerprint`);
  if (value.fingerprint !== fingerprint(value)) throw new Error(`${label} fingerprint mismatch`);
};

export const sealCandidateIdentityRecord = (record) => ({
  ...record,
  fingerprint: fingerprint(record),
});

export const validateCandidateIdentityChain = ({
  payloadLineage,
  releaseSnapshot,
  buildIdentity,
  packageAttestation,
  installAttestation,
  evidenceEnvelope,
}) => {
  exactKeys(payloadLineage, ["arch", "fingerprint", "pupu_revision", "runtime_manifest_digest", "schema", "sidecar_sha256", "unchain_wheel_sha256", "worktree_fingerprint"], "payload lineage");
  if (payloadLineage.schema !== "pupu.windows-payload-lineage.v1" || !GIT_SHA.test(payloadLineage.pupu_revision) || payloadLineage.arch !== "x64") throw new Error("payload lineage invalid");
  for (const key of ["runtime_manifest_digest", "sidecar_sha256", "unchain_wheel_sha256", "worktree_fingerprint"]) hash(payloadLineage[key], `payload lineage.${key}`);
  assertFingerprint(payloadLineage, "payload lineage");

  exactKeys(releaseSnapshot, ["configured_mode", "feature_ceiling", "fingerprint", "schema", "snapshot_sha256"], "release snapshot");
  if (releaseSnapshot.schema !== "pupu.windows-release-snapshot.v1" || !["shadow", "all"].includes(releaseSnapshot.configured_mode) || !["shadow", "all"].includes(releaseSnapshot.feature_ceiling)) throw new Error("release snapshot invalid");
  hash(releaseSnapshot.snapshot_sha256, "release snapshot.snapshot_sha256");
  assertFingerprint(releaseSnapshot, "release snapshot");

  exactKeys(buildIdentity, ["fingerprint", "payload_lineage_fingerprint", "release_snapshot_fingerprint", "schema"], "build identity");
  if (buildIdentity.schema !== "pupu.windows-build-identity.v1" || buildIdentity.payload_lineage_fingerprint !== payloadLineage.fingerprint || buildIdentity.release_snapshot_fingerprint !== releaseSnapshot.fingerprint) throw new Error("build identity parent mismatch");
  assertFingerprint(buildIdentity, "build identity");

  exactKeys(packageAttestation, ["app_sha256", "asar_sha256", "build_identity_fingerprint", "fingerprint", "installer_sha256", "schema", "signing"], "package attestation");
  if (packageAttestation.schema !== "pupu.windows-package-attestation.v1" || packageAttestation.build_identity_fingerprint !== buildIdentity.fingerprint) throw new Error("package attestation parent mismatch");
  for (const key of ["app_sha256", "asar_sha256", "installer_sha256"]) hash(packageAttestation[key], `package attestation.${key}`);
  exactKeys(packageAttestation.signing, ["allowed_deltas", "kind", "pre_sign_app_sha256", "pre_sign_asar_sha256", "pre_sign_installer_sha256"], "package signing");
  hash(packageAttestation.signing.pre_sign_app_sha256, "package signing.pre_sign_app_sha256");
  hash(packageAttestation.signing.pre_sign_asar_sha256, "package signing.pre_sign_asar_sha256");
  hash(packageAttestation.signing.pre_sign_installer_sha256, "package signing.pre_sign_installer_sha256");
  const signed = packageAttestation.signing.kind === "authenticode";
  if (!signed && packageAttestation.signing.kind !== "unsigned") throw new Error("package signing kind invalid");
  const allowedDeltas = signed ? ["installer_authenticode_envelope"] : [];
  if (JSON.stringify(packageAttestation.signing.allowed_deltas) !== JSON.stringify(allowedDeltas)) throw new Error("package signing allowed delta invalid");
  if (packageAttestation.app_sha256 !== packageAttestation.signing.pre_sign_app_sha256 || packageAttestation.asar_sha256 !== packageAttestation.signing.pre_sign_asar_sha256) throw new Error("package signing payload delta invalid");
  if (signed === (packageAttestation.installer_sha256 === packageAttestation.signing.pre_sign_installer_sha256)) throw new Error("package signing installer delta invalid");
  assertFingerprint(packageAttestation, "package attestation");

  exactKeys(installAttestation, ["fingerprint", "installed_app_sha256", "installed_asar_sha256", "installed_sidecar_sha256", "package_attestation_fingerprint", "schema"], "install attestation");
  if (installAttestation.schema !== "pupu.windows-install-attestation.v1" || installAttestation.package_attestation_fingerprint !== packageAttestation.fingerprint) throw new Error("install attestation parent mismatch");
  for (const key of ["installed_app_sha256", "installed_asar_sha256", "installed_sidecar_sha256"]) hash(installAttestation[key], `install attestation.${key}`);
  assertFingerprint(installAttestation, "install attestation");

  exactKeys(evidenceEnvelope, ["fingerprint", "install_attestation_fingerprint", "package_attestation_fingerprint", "payload_lineage_fingerprint", "schema"], "evidence envelope");
  if (evidenceEnvelope.schema !== "pupu.windows-evidence-envelope.v1" || evidenceEnvelope.payload_lineage_fingerprint !== payloadLineage.fingerprint || evidenceEnvelope.package_attestation_fingerprint !== packageAttestation.fingerprint || evidenceEnvelope.install_attestation_fingerprint !== installAttestation.fingerprint) throw new Error("evidence envelope parent mismatch");
  assertFingerprint(evidenceEnvelope, "evidence envelope");
  return Object.freeze({ buildIdentity: buildIdentity.fingerprint, evidenceEnvelope: evidenceEnvelope.fingerprint });
};

export const buildWindowsCandidateIdentityReport = ({
  executedTests,
  installAttestation,
  packageAttestation,
  payloadLineage,
  releaseSnapshot,
  buildIdentity,
  evidenceEnvelope,
} = {}) => {
  if (!Number.isSafeInteger(executedTests) || executedTests <= 0) {
    throw new Error("candidate identity report requires nonzero executed tests");
  }
  const validated = validateCandidateIdentityChain({
    payloadLineage,
    releaseSnapshot,
    buildIdentity,
    packageAttestation,
    installAttestation,
    evidenceEnvelope,
  });
  return Object.freeze({
    build_identity_fingerprint: validated.buildIdentity,
    evidence_envelope_fingerprint: validated.evidenceEnvelope,
    executed_tests: executedTests,
    install_attestation_fingerprint: installAttestation.fingerprint,
    kind: "windows_candidate_identity",
    package_attestation_fingerprint: packageAttestation.fingerprint,
    payload_lineage_fingerprint: payloadLineage.fingerprint,
    release_snapshot_fingerprint: releaseSnapshot.fingerprint,
    schema: "pupu.windows-candidate-identity-report.v1",
  });
};
