import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const buildWeb = path.join(repoRoot, "scripts/build-web.cjs");
const writeSnapshot = path.join(repoRoot, "scripts/write-build-feature-snapshot.cjs");
const shadowProfile = path.join(
  repoRoot,
  "contracts/memory-v2/release-profile.shadow.v1.json",
);
const allProfile = path.join(
  repoRoot,
  "contracts/memory-v2/release-profile.all.v2.json",
);

const run = (script, args, environment) => spawnSync(process.execPath, [script, ...args], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, ...environment },
});

test("W0-03 release build refuses a missing or malformed feature snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-build-snapshot-"));
  try {
    const missing = run(buildWeb, ["--print-flags"], {
      PUPU_BUILD_FEATURE_SNAPSHOT_PATH: path.join(root, "missing.json"),
      PUPU_VERSION_PREPARED: "1",
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /snapshot is required but missing/);

    const malformedPath = path.join(root, "malformed.json");
    fs.writeFileSync(malformedPath, "not-json\n");
    const malformed = run(buildWeb, ["--print-flags"], {
      PUPU_BUILD_FEATURE_SNAPSHOT_PATH: malformedPath,
      PUPU_VERSION_PREPARED: "1",
    });
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /snapshot is invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("W0-03 release build consumes the exact producer snapshot without environment override", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-build-snapshot-"));
  const snapshotPath = path.join(root, "feature-snapshot.json");
  try {
    const produced = run(writeSnapshot, [
      "--out", snapshotPath,
      "--feature-flags", '{"enable_memory_v2":true}',
    ], {
      PUPU_FEATURE_MEMORY_V2: "shadow",
      PUPU_MEMORY_V2_MODE: "shadow",
    });
    assert.equal(produced.status, 0, produced.stderr);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.equal(snapshot.enable_memory_v2, true);
    assert.equal(snapshot._pupu_memory_v2_release.sidecar_environment.PUPU_FEATURE_MEMORY_V2, "shadow");

    const built = run(buildWeb, ["--print-flags"], {
      PUPU_BUILD_FEATURE_SNAPSHOT_PATH: snapshotPath,
      PUPU_FEATURE_MEMORY_V2: "all",
      PUPU_MEMORY_V2_MODE: "all",
      PUPU_VERSION_PREPARED: "1",
    });
    assert.equal(built.status, 0, built.stderr);
    assert.deepEqual(JSON.parse(built.stdout), { enable_memory_v2: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("W0-03 controlled Shadow profile ignores producer process overrides", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-build-profile-"));
  const snapshotPath = path.join(root, "feature-snapshot.json");
  try {
    const produced = run(writeSnapshot, [
      "--out", snapshotPath,
      "--profile", shadowProfile,
    ], {
      PUPU_FEATURE_MEMORY_V2: "all",
      PUPU_MEMORY_V2_MODE: "all",
      PUPU_MEMORY_V2_CANARY_PERCENT: "100",
      PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "1",
    });
    assert.equal(produced.status, 0, produced.stderr);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.deepEqual(
      snapshot._pupu_memory_v2_release.sidecar_environment,
      {
        PUPU_FEATURE_MEMORY_V2: "shadow",
        PUPU_MEMORY_V2_MODE: "shadow",
        PUPU_MEMORY_V2_CANARY_PERCENT: "5",
        PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
        PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v0.1.10 controlled All profile enables theme customization and active Memory V2", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-build-profile-all-"));
  const snapshotPath = path.join(root, "feature-snapshot.json");
  try {
    const produced = run(writeSnapshot, [
      "--out", snapshotPath,
      "--profile", allProfile,
    ], {
      PUPU_FEATURE_MEMORY_V2: "shadow",
      PUPU_MEMORY_V2_MODE: "shadow",
      PUPU_MEMORY_V2_CANARY_PERCENT: "5",
      PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "1",
    });
    assert.equal(produced.status, 0, produced.stderr);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.equal(snapshot.enable_memory_v2, true);
    assert.equal(snapshot.enable_theme_color_customization, true);
    assert.deepEqual(
      snapshot._pupu_memory_v2_release.sidecar_environment,
      {
        PUPU_FEATURE_MEMORY_V2: "all",
        PUPU_MEMORY_V2_MODE: "all",
        PUPU_MEMORY_V2_CANARY_PERCENT: "100",
        PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
        PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2 controlled release profile rejects a missing or extra feature flag", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-build-profile-v2-negative-"));
  const profilePath = path.join(root, "profile.json");
  const snapshotPath = path.join(root, "feature-snapshot.json");
  const baseProfile = {
    schema: "pupu.memory-v2-release-profile.v2",
    feature_flags: {
      enable_memory_v2: true,
      enable_theme_color_customization: true,
    },
    sidecar_environment: {
      PUPU_FEATURE_MEMORY_V2: "all",
      PUPU_MEMORY_V2_MODE: "all",
      PUPU_MEMORY_V2_CANARY_PERCENT: "100",
      PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
      PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
    },
  };
  try {
    for (const featureFlags of [
      { enable_memory_v2: true },
      { ...baseProfile.feature_flags, enable_unknown_release_feature: true },
    ]) {
      fs.writeFileSync(profilePath, JSON.stringify({
        ...baseProfile,
        feature_flags: featureFlags,
      }));
      const produced = run(writeSnapshot, [
        "--out", snapshotPath,
        "--profile", profilePath,
      ]);
      assert.notEqual(produced.status, 0);
      assert.match(produced.stderr, /invalid schema or Memory V2 environment/);
    }

    fs.writeFileSync(profilePath, JSON.stringify({
      ...baseProfile,
      sidecar_environment: {
        ...baseProfile.sidecar_environment,
        PUPU_MEMORY_V2_MODE: "unexpected",
      },
    }));
    const nonCanonical = run(writeSnapshot, [
      "--out", snapshotPath,
      "--profile", profilePath,
    ]);
    assert.notEqual(nonCanonical.status, 0);
    assert.match(nonCanonical.stderr, /profile Memory V2 environment is not canonical/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Windows build embeds only a closed staged Unchain artifact identity", {
  skip: process.platform !== "win32",
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-build-artifact-identity-"));
  const identityPath = path.join(root, "unchain-artifact-identity.v1.json");
  const validIdentity = {
    runtime_manifest_digest: `sha256:${"a".repeat(64)}`,
    schema: "pupu.windows-unchain-artifact-identity.v1",
    sidecar_sha256: `sha256:${"c".repeat(64)}`,
    unchain_wheel_sha256: `sha256:${"b".repeat(64)}`,
  };
  try {
    fs.writeFileSync(identityPath, JSON.stringify(validIdentity));
    const accepted = run(buildWeb, ["--print-flags"], {
      PUPU_UNCHAIN_ARTIFACT_IDENTITY_PATH: identityPath,
    });
    assert.equal(accepted.status, 0, accepted.stderr);

    fs.writeFileSync(identityPath, JSON.stringify({ ...validIdentity, extra: true }));
    const rejected = run(buildWeb, ["--print-flags"], {
      PUPU_UNCHAIN_ARTIFACT_IDENTITY_PATH: identityPath,
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /artifact identity is invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("non-Windows builds ignore Windows staged artifact identity", {
  skip: process.platform === "win32",
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-nonwindows-artifact-identity-"));
  const identityPath = path.join(root, "unchain-artifact-identity.v1.json");
  try {
    fs.writeFileSync(identityPath, JSON.stringify({ malformed: true }));
    const built = run(buildWeb, ["--print-flags"], {
      PUPU_UNCHAIN_ARTIFACT_IDENTITY_PATH: identityPath,
    });
    assert.equal(built.status, 0, built.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
