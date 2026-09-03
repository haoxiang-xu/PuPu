import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildUnchainArtifactEvidence,
  computeRuntimeManifestDigest,
  readAndVerifyUnchainArtifactEvidence,
  REQUIRED_RUNTIME_PROTOCOLS,
  validateInstalledUnchainProbe,
  validateRuntimeManifestForRelease,
  verifyUnchainTestSourceProvenance,
} from "./unchain-artifact.mjs";

const runtimeManifest = ({
  protocolFeatures = REQUIRED_RUNTIME_PROTOCOLS,
} = {}) => {
  const manifest = {
    schema: "unchain.runtime_protocol_manifest.v1",
    runtime: "unchain",
    protocols: Object.entries(protocolFeatures).map(([id, features]) => ({
      id,
      major: 1,
      minor: 0,
      features: [...features],
    })),
  };
  return {
    ...manifest,
    manifest_digest: computeRuntimeManifestDigest(manifest),
  };
};

test("one immutable wheel records artifact, protocol, and source provenance", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-unchain-artifact-"));
  const artifactPath = path.join(root, "unchain-1.2.3-py3-none-any.whl");
  const evidencePath = path.join(root, "unchain-artifact.json");
  fs.writeFileSync(artifactPath, "one immutable wheel\n");

  try {
    const evidence = buildUnchainArtifactEvidence({
      artifactPath,
      runtimeManifest: runtimeManifest(),
      source: {
        repository: "haoxiang-xu/unchain",
        ref: "dev",
        revision: "b".repeat(40),
        dirty: false,
      },
    });
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));

    const verified = readAndVerifyUnchainArtifactEvidence({
      artifactPath,
      evidencePath,
    });
    assert.equal(verified.schema, "pupu.release.unchain-artifact.v1");
    assert.match(verified.artifact.sha256, /^sha256:[0-9a-f]{64}$/);
    assert.equal(verified.artifact.size_bytes, 20);
    assert.equal(verified.build.wheel_count, 1);
    assert.equal(verified.build.built_once, true);
    assert.equal(
      verified.runtime_manifest.manifest_digest,
      computeRuntimeManifestDigest(verified.runtime_manifest),
    );
    assert.equal(verified.source.revision, "b".repeat(40));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("download verification proves bytes in a bare environment without importing Unchain", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-unchain-bytes-only-"));
  const artifactPath = path.join(root, "unchain-1.2.3-py3-none-any.whl");
  const evidencePath = path.join(root, "unchain-artifact.json");
  const outputPath = path.join(root, "github-output.txt");
  fs.writeFileSync(artifactPath, "not importable, but immutable wheel bytes\n");
  const evidence = buildUnchainArtifactEvidence({
    artifactPath,
    runtimeManifest: runtimeManifest(),
    source: {
      repository: "haoxiang-xu/unchain",
      ref: "dev",
      revision: "a".repeat(40),
      dirty: false,
    },
  });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "verify-unchain-artifact.mjs"),
        "--artifact", artifactPath,
        "--evidence", evidencePath,
        "--python", path.join(root, "python-does-not-exist"),
        "--bytes-only", "true",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(fs.readFileSync(outputPath, "utf8"), /executed_tests=1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installed distribution must be the wheel bytes, never an existing editable", () => {
  const evidence = {
    artifact: {
      name: "unchain-1.2.3-py3-none-any.whl",
      sha256: `sha256:${"9".repeat(64)}`,
    },
    runtime_manifest: runtimeManifest(),
  };
  assert.doesNotThrow(() => validateInstalledUnchainProbe({
    distribution_name: "unchain",
    module_origin: "/venv/site-packages/unchain/__init__.py",
    manifest: runtimeManifest(),
    direct_url: {
      url: "file:///artifacts/unchain-1.2.3-py3-none-any.whl",
      archive_info: { hashes: { sha256: "9".repeat(64) } },
    },
  }, evidence));
  assert.throws(() => validateInstalledUnchainProbe({
    distribution_name: "unchain",
    module_origin: "/checkout/unchain/src/unchain/__init__.py",
    manifest: runtimeManifest(),
    direct_url: {
      url: "file:///checkout/unchain",
      dir_info: { editable: true },
    },
  }, evidence), /installed from the immutable wheel|editable/);
});

test("contract tests must come from the clean revision that built the wheel", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-unchain-tests-source-"));
  const runGit = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  try {
    fs.mkdirSync(path.join(root, "tests"));
    fs.writeFileSync(path.join(root, "tests", "test_contract.py"), "def test_contract(): pass\n");
    runGit("init", "--quiet");
    runGit("config", "user.email", "release-qa@example.invalid");
    runGit("config", "user.name", "Release QA");
    runGit("add", "tests/test_contract.py");
    runGit("commit", "--quiet", "-m", "fixture");
    const revision = runGit("rev-parse", "HEAD");
    const evidence = { source: { revision } };

    assert.deepEqual(
      verifyUnchainTestSourceProvenance({ sourcePath: root, evidence }),
      { revision, dirty: false },
    );
    assert.throws(
      () => verifyUnchainTestSourceProvenance({
        sourcePath: root,
        evidence: { source: { revision: "0".repeat(40) } },
      }),
      /revision does not match/,
    );
    fs.appendFileSync(path.join(root, "tests", "test_contract.py"), "# dirty\n");
    assert.throws(
      () => verifyUnchainTestSourceProvenance({ sourcePath: root, evidence }),
      /provenance is dirty/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("artifact bytes, protocol digest, and clean source provenance fail closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-unchain-artifact-"));
  const artifactPath = path.join(root, "unchain.whl");
  const evidencePath = path.join(root, "evidence.json");
  fs.writeFileSync(artifactPath, "wheel-a");

  try {
    const evidence = buildUnchainArtifactEvidence({
      artifactPath,
      runtimeManifest: runtimeManifest(),
      source: {
        repository: "haoxiang-xu/unchain",
        ref: "release-candidate",
        revision: "c".repeat(40),
        dirty: false,
      },
    });
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));
    fs.writeFileSync(artifactPath, "wheel-b");
    assert.throws(
      () => readAndVerifyUnchainArtifactEvidence({ artifactPath, evidencePath }),
      /artifact SHA-256 mismatch/,
    );

    assert.throws(
      () => buildUnchainArtifactEvidence({
        artifactPath,
        runtimeManifest: {
          ...runtimeManifest(),
          manifest_digest: "bad",
        },
        source: {
          repository: "haoxiang-xu/unchain",
          ref: "dev",
          revision: "d".repeat(40),
          dirty: false,
        },
      }),
      /manifest_digest/,
    );
    assert.throws(
      () => buildUnchainArtifactEvidence({
        artifactPath,
        runtimeManifest: runtimeManifest(),
        source: {
          repository: "haoxiang-xu/unchain",
          ref: "dev",
          revision: "d".repeat(40),
          dirty: true,
        },
      }),
      /source provenance is dirty/,
    );
    assert.throws(
      () => buildUnchainArtifactEvidence({
        artifactPath,
        runtimeManifest: runtimeManifest(),
        source: {
          repository: "haoxiang-xu/unchain",
          ref: " dev",
          revision: "d".repeat(40),
          dirty: false,
        },
      }),
      /source\.ref must be a non-empty string/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("release evidence requires the cold-reconcile and exact-cancel protocol features", () => {
  assert.equal(
    REQUIRED_RUNTIME_PROTOCOLS.context_memory.includes(
      "chat_deletion_sqlite_scope_closure",
    ),
    true,
  );
  assert.throws(
    () => validateRuntimeManifestForRelease(runtimeManifest({
      protocolFeatures: {
        ...REQUIRED_RUNTIME_PROTOCOLS,
        context_memory: REQUIRED_RUNTIME_PROTOCOLS.context_memory.filter(
          (feature) => feature !== "chat_deletion_sqlite_scope_closure",
        ),
      },
    })),
    /context_memory\.chat_deletion_sqlite_scope_closure/,
  );
  assert.throws(
    () => validateRuntimeManifestForRelease(runtimeManifest({
      protocolFeatures: {
        ...REQUIRED_RUNTIME_PROTOCOLS,
        context_memory: REQUIRED_RUNTIME_PROTOCOLS.context_memory.filter(
          (feature) => feature !== "interaction_resolution_compat",
        ),
      },
    })),
    /context_memory\.interaction_resolution_compat/,
  );
  assert.throws(
    () => validateRuntimeManifestForRelease(runtimeManifest({
      protocolFeatures: {
        ...REQUIRED_RUNTIME_PROTOCOLS,
        durable_interaction: REQUIRED_RUNTIME_PROTOCOLS.durable_interaction.filter(
          (feature) => feature !== "expected_interaction_id_cas",
        ),
      },
    })),
    /durable_interaction\.expected_interaction_id_cas/,
  );
  const optionalBody = {
    ...runtimeManifest(),
    protocols: [
      ...runtimeManifest().protocols,
      { id: "future_optional", major: 1, minor: 7, features: ["extra"] },
    ].sort((left, right) => Buffer.compare(
      Buffer.from(left.id, "utf8"),
      Buffer.from(right.id, "utf8"),
    )),
  };
  optionalBody.manifest_digest = computeRuntimeManifestDigest(optionalBody);
  assert.doesNotThrow(() => validateRuntimeManifestForRelease(optionalBody));
  assert.throws(
    () => validateRuntimeManifestForRelease(runtimeManifest({
      protocolFeatures: {
        ...REQUIRED_RUNTIME_PROTOCOLS,
        run_bundle: REQUIRED_RUNTIME_PROTOCOLS.run_bundle.filter(
          (feature) => feature !== "run_bundle_v2",
        ),
      },
    })),
    /run_bundle\.run_bundle_v2/,
  );
});

test("release evidence rejects missing provider-turn and RunBundle features", () => {
  for (const [protocolId, feature] of [
    ["provider_turn_ownership", "atomic_receipt_cas"],
    ["run_bundle", "run_bundle_v1"],
  ]) {
    assert.throws(
      () => validateRuntimeManifestForRelease(runtimeManifest({
        protocolFeatures: {
          ...REQUIRED_RUNTIME_PROTOCOLS,
          [protocolId]: REQUIRED_RUNTIME_PROTOCOLS[protocolId].filter(
            (candidate) => candidate !== feature,
          ),
        },
      })),
      new RegExp(`${protocolId}\\.${feature}`),
    );
  }
});

test("manifest validation matches producer NFC/nonempty rules including whitespace", () => {
  const body = runtimeManifest();
  body.protocols = [
    {
      id: " future_optional",
      major: 1,
      minor: 0,
      features: [" extra"],
    },
    ...body.protocols.map((protocol) =>
      protocol.id === "context_memory"
        ? { ...protocol, features: [" extra", ...protocol.features] }
        : protocol
    ),
  ];
  body.manifest_digest = computeRuntimeManifestDigest(body);
  assert.doesNotThrow(() => validateRuntimeManifestForRelease(body));
});

test("manifest verification rejects bad digest, empty strings, Unicode drift, and byte-order drift", () => {
  const valid = runtimeManifest();
  assert.throws(
    () => validateRuntimeManifestForRelease({
      ...valid,
      manifest_digest: `sha256:${"0".repeat(64)}`,
    }),
    /manifest_digest mismatch/,
  );
  const emptyFeature = runtimeManifest();
  emptyFeature.protocols[0].features[0] = "";
  assert.throws(
    () => validateRuntimeManifestForRelease(emptyFeature),
    /non-empty strings/,
  );
  const emptyId = runtimeManifest();
  emptyId.protocols[0].id = "";
  assert.throws(
    () => validateRuntimeManifestForRelease(emptyId),
    /non-empty NFC string/,
  );
  const unicode = runtimeManifest();
  unicode.protocols.push({
    id: "future_e\u0301",
    major: 1,
    minor: 0,
    features: ["extra"],
  });
  assert.throws(
    () => validateRuntimeManifestForRelease(unicode),
    /NFC|non-empty string/,
  );
  const unpairedSurrogate = runtimeManifest();
  unpairedSurrogate.protocols[0].features = [
    "\ud800",
    ...unpairedSurrogate.protocols[0].features,
  ];
  assert.throws(
    () => validateRuntimeManifestForRelease(unpairedSurrogate),
    /Unicode scalar/,
  );
  const order = runtimeManifest();
  order.protocols.reverse();
  assert.throws(
    () => validateRuntimeManifestForRelease(order),
    /sorted and unique by id/,
  );
});
