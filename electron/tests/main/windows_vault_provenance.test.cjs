const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  WINDOWS_UNCHAIN_ARTIFACT_IDENTITY_SCHEMA,
  WINDOWS_VAULT_PROVENANCE_SCHEMA,
  WINDOWS_VAULT_RUNTIME_PROVENANCE_SCHEMA,
  resolveWindowsVaultRuntimeProvenance,
} = require("../../main/services/unchain/windows_vault_provenance");

const digest = (value) =>
  `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;

describe("Windows Vault runtime provenance", () => {
  let directory;
  let sidecarPath;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-vault-provenance-"));
    sidecarPath = path.join(directory, "unchain-server.exe");
    fs.writeFileSync(sidecarPath, "immutable-sidecar", "utf8");
    fs.mkdirSync(path.join(directory, "build"));
  });

  afterEach(() => {
    fs.rmSync(directory, { force: true, recursive: true });
  });

  const writeProvenance = (overrides = {}) => {
    const runtimeManifestDigest = digest("manifest");
    const wheelDigest = digest("wheel");
    fs.writeFileSync(
      path.join(directory, "windows-vault-runtime-provenance.v1.json"),
      JSON.stringify({
        arch: "x64",
        runtime_manifest_digest: runtimeManifestDigest,
        schema: WINDOWS_VAULT_RUNTIME_PROVENANCE_SCHEMA,
        sidecar_sha256: digest("immutable-sidecar"),
        unchain_wheel_sha256: wheelDigest,
        ...overrides,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "build", "unchain-artifact-identity.v1.json"),
      JSON.stringify({
        runtime_manifest_digest: overrides.runtime_manifest_digest || runtimeManifestDigest,
        schema: WINDOWS_UNCHAIN_ARTIFACT_IDENTITY_SCHEMA,
        sidecar_sha256: overrides.sidecar_sha256 || digest("immutable-sidecar"),
        unchain_wheel_sha256: overrides.unchain_wheel_sha256 || wheelDigest,
      }),
      "utf8",
    );
  };

  test("accepts a packaged exact sidecar pair", () => {
    writeProvenance();
    expect(
      resolveWindowsVaultRuntimeProvenance({
        app: { isPackaged: true, getAppPath: () => directory },
        arch: "x64",
        entrypoint: { command: sidecarPath },
        fs,
        path,
        platform: "win32",
      }),
    ).toMatchObject({
      arch: "x64",
      sidecar_sha256: digest("immutable-sidecar"),
    });
  });

  test("rejects developer mode, a tampered sidecar, and malformed provenance", () => {
    writeProvenance();
    expect(() =>
      resolveWindowsVaultRuntimeProvenance({
        app: { isPackaged: false, getAppPath: () => directory }, arch: "x64", entrypoint: { command: sidecarPath }, fs, path, platform: "win32",
      }),
    ).toThrow("unavailable");
    fs.writeFileSync(sidecarPath, "tampered", "utf8");
    expect(() =>
      resolveWindowsVaultRuntimeProvenance({
        app: { isPackaged: true, getAppPath: () => directory }, arch: "x64", entrypoint: { command: sidecarPath }, fs, path, platform: "win32",
      }),
    ).toThrow("invalid");
    writeProvenance({ unchain_wheel_sha256: "not-a-digest" });
    expect(() =>
      resolveWindowsVaultRuntimeProvenance({
        app: { isPackaged: true, getAppPath: () => directory }, entrypoint: { command: sidecarPath }, fs, path, platform: "win32",
      }),
    ).toThrow("invalid");
  });

  test("requires the signed app identity to agree with the sidecar provenance", () => {
    writeProvenance();
    const identityPath = path.join(
      directory,
      "build",
      "unchain-artifact-identity.v1.json",
    );
    fs.writeFileSync(
      identityPath,
      JSON.stringify({
        runtime_manifest_digest: digest("other-manifest"),
        schema: WINDOWS_UNCHAIN_ARTIFACT_IDENTITY_SCHEMA,
        sidecar_sha256: digest("immutable-sidecar"),
        unchain_wheel_sha256: digest("wheel"),
      }),
    );

    expect(() => resolveWindowsVaultRuntimeProvenance({
      app: { isPackaged: true, getAppPath: () => directory },
      arch: "x64",
      entrypoint: { command: sidecarPath }, fs, path, platform: "win32",
    })).toThrow("invalid");
  });

  test("rejects a replacement sidecar even when its companion is replaced too", () => {
    writeProvenance();
    fs.writeFileSync(sidecarPath, "replacement-sidecar", "utf8");
    const companionPath = path.join(
      directory,
      "windows-vault-runtime-provenance.v1.json",
    );
    const companion = JSON.parse(fs.readFileSync(companionPath, "utf8"));
    companion.sidecar_sha256 = digest("replacement-sidecar");
    fs.writeFileSync(companionPath, JSON.stringify(companion), "utf8");

    expect(() => resolveWindowsVaultRuntimeProvenance({
      app: { isPackaged: true, getAppPath: () => directory },
      arch: "x64",
      entrypoint: { command: sidecarPath }, fs, path, platform: "win32",
    })).toThrow("invalid");
  });

  test("uses the same schema token as the sealed receipt consumer", () => {
    expect(WINDOWS_VAULT_RUNTIME_PROVENANCE_SCHEMA).toBe(
      WINDOWS_VAULT_PROVENANCE_SCHEMA,
    );
  });
});
