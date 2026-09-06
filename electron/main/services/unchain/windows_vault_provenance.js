const crypto = require("crypto");

// This exact schema is consumed by windows_vault_capability.  Keep the
// producer's exported name for callers, but do not maintain a second string
// that can silently drift from the sealed receipt boundary.
const WINDOWS_VAULT_PROVENANCE_SCHEMA = "pupu.windows-vault-provenance.v1";
const WINDOWS_VAULT_RUNTIME_PROVENANCE_SCHEMA = WINDOWS_VAULT_PROVENANCE_SCHEMA;
const WINDOWS_UNCHAIN_ARTIFACT_IDENTITY_SCHEMA =
  "pupu.windows-unchain-artifact-identity.v1";
const SHA256 = /^sha256:[0-9a-f]{64}$/;

const hasExactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

const hashFile = (fs, filePath) => {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
      let bytesRead = 0;
      do {
        bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
      } while (bytesRead > 0);
    } finally {
      buffer.fill(0);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest("hex")}`;
};

const parseRuntimeProvenance = (contents) => {
  let value;
  try {
    value = JSON.parse(contents);
  } catch (_error) {
    throw new Error("windows vault runtime provenance is invalid");
  }
  if (
    !hasExactKeys(value, [
      "arch",
      "runtime_manifest_digest",
      "schema",
      "sidecar_sha256",
      "unchain_wheel_sha256",
    ]) ||
    value.arch !== "x64" ||
    value.schema !== WINDOWS_VAULT_RUNTIME_PROVENANCE_SCHEMA ||
    !SHA256.test(value.runtime_manifest_digest) ||
    !SHA256.test(value.sidecar_sha256) ||
    !SHA256.test(value.unchain_wheel_sha256)
  ) {
    throw new Error("windows vault runtime provenance is invalid");
  }
  return Object.freeze({ ...value });
};

// This record lives in the signed application payload (app.asar), while the
// sidecar record lives beside the executable in extraResources.  Comparing the
// two prevents the sidecar from authorizing itself by replacing its companion
// JSON together with the executable.
const parseWindowsUnchainArtifactIdentity = (contents) => {
  let value;
  try {
    value = JSON.parse(contents);
  } catch (_error) {
    throw new Error("windows unchain artifact identity is invalid");
  }
  if (
    !hasExactKeys(value, [
      "runtime_manifest_digest",
      "schema",
      "sidecar_sha256",
      "unchain_wheel_sha256",
    ]) ||
    value.schema !== WINDOWS_UNCHAIN_ARTIFACT_IDENTITY_SCHEMA ||
    !SHA256.test(value.runtime_manifest_digest) ||
    !SHA256.test(value.sidecar_sha256) ||
    !SHA256.test(value.unchain_wheel_sha256)
  ) {
    throw new Error("windows unchain artifact identity is invalid");
  }
  return Object.freeze({ ...value });
};

const resolveWindowsVaultRuntimeProvenance = ({
  app,
  entrypoint,
  fs,
  path,
  arch = process.arch,
  platform = process.platform,
} = {}) => {
  if (platform !== "win32" || app?.isPackaged !== true) {
    throw new Error("windows vault runtime provenance is unavailable");
  }
  if (
    !entrypoint ||
    typeof entrypoint.command !== "string" ||
    typeof fs?.readFileSync !== "function" ||
    typeof fs?.openSync !== "function" ||
    typeof fs?.readSync !== "function" ||
    typeof fs?.closeSync !== "function" ||
    typeof app?.getAppPath !== "function" ||
    typeof path?.dirname !== "function" ||
    typeof path?.join !== "function"
  ) {
    throw new Error("windows vault runtime provenance is unavailable");
  }
  const provenancePath = path.join(
    path.dirname(entrypoint.command),
    "windows-vault-runtime-provenance.v1.json",
  );
  const provenance = parseRuntimeProvenance(fs.readFileSync(provenancePath, "utf8"));
  if (hashFile(fs, entrypoint.command) !== provenance.sidecar_sha256) {
    throw new Error("windows vault runtime provenance is invalid");
  }
  const artifactIdentityPath = path.join(
    app.getAppPath(),
    "build",
    "unchain-artifact-identity.v1.json",
  );
  const artifactIdentity = parseWindowsUnchainArtifactIdentity(
    fs.readFileSync(artifactIdentityPath, "utf8"),
  );
  if (
    arch !== "x64" ||
    artifactIdentity.runtime_manifest_digest !== provenance.runtime_manifest_digest ||
    artifactIdentity.sidecar_sha256 !== provenance.sidecar_sha256 ||
    artifactIdentity.unchain_wheel_sha256 !== provenance.unchain_wheel_sha256
  ) {
    throw new Error("windows vault runtime provenance is invalid");
  }
  return provenance;
};

module.exports = {
  WINDOWS_UNCHAIN_ARTIFACT_IDENTITY_SCHEMA,
  WINDOWS_VAULT_PROVENANCE_SCHEMA,
  WINDOWS_VAULT_RUNTIME_PROVENANCE_SCHEMA,
  hashFile,
  parseWindowsUnchainArtifactIdentity,
  parseRuntimeProvenance,
  resolveWindowsVaultRuntimeProvenance,
};
