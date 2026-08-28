import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";

import {
  runPackagedSidecarSmoke,
  terminateChild,
  validateCompatibleRuntimeProjection,
} from "./package-sidecar-smoke.mjs";
import {
  computeRuntimeManifestDigest,
  REQUIRED_RUNTIME_PROTOCOLS,
} from "./unchain-artifact.mjs";

const require = createRequire(import.meta.url);
const {
  createBuildFeatureSnapshot,
} = require("../../electron/main/services/unchain/memory_v2_rollout");

const shadowSnapshot = () => createBuildFeatureSnapshot(
  { enable_memory_v2: true },
  {
    PUPU_FEATURE_MEMORY_V2: "shadow",
    PUPU_MEMORY_V2_MODE: "shadow",
    PUPU_MEMORY_V2_CANARY_PERCENT: "5",
    PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
    PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
  },
);

const manifestBody = {
  schema: "unchain.runtime_protocol_manifest.v1",
  runtime: "unchain",
  protocols: Object.entries(REQUIRED_RUNTIME_PROTOCOLS).map(([id, features]) => ({
    id,
    major: 1,
    minor: 0,
    features: [...features],
  })),
};
const manifest = {
  ...manifestBody,
  manifest_digest: computeRuntimeManifestDigest(manifestBody),
};

const projection = (runtimeManifest = manifest) => ({
  canary_percent: 5,
  configured_mode: "shadow",
  feature_ceiling: "shadow",
  read_only_degraded: false,
  rollout_config_valid: true,
  rollout_fingerprint: shadowSnapshot()._pupu_memory_v2_release.rollout_fingerprint,
  rollout_mode: "shadow",
  runtime_protocol_ready: true,
  runtime_protocol_reason: "unchain_runtime_protocol_compatible",
  runtime_protocol_verification: "runtime_protocol",
  runtime_protocol_immutable: true,
  runtime_protocol_manifest: runtimeManifest,
  unchain_revision: "f".repeat(40),
  unchain_runtime_source: "wheel",
});

test("packaged smoke refuses a missing build feature snapshot before spawning", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-sidecar-smoke-missing-"));
  const evidencePath = path.join(root, "artifact.json");
  fs.writeFileSync(evidencePath, JSON.stringify({ runtime_manifest: manifest }));

  try {
    await assert.rejects(
      runPackagedSidecarSmoke({
        binaryPath: process.execPath,
        evidencePath,
      }),
      /build feature snapshot is required/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("package projection requires the compatible tuple and exact artifact manifest", () => {
  assert.doesNotThrow(() => validateCompatibleRuntimeProjection(
    projection(),
    { expectedManifest: manifest },
  ));
  assert.throws(
    () => validateCompatibleRuntimeProjection(
      { ...projection(), runtime_protocol_ready: false },
      { expectedManifest: manifest },
    ),
    /runtime_protocol_ready/,
  );
  assert.throws(
    () => {
      const changedBody = {
        ...manifestBody,
        protocols: manifestBody.protocols.map((protocol) =>
          protocol.id === "durable_interaction"
            ? {
                ...protocol,
                features: [...protocol.features, "future_optional"].sort(
                  (left, right) => Buffer.compare(
                    Buffer.from(left, "utf8"),
                    Buffer.from(right, "utf8"),
                  ),
                ),
              }
            : protocol
        ),
      };
      validateCompatibleRuntimeProjection(
        projection({
          ...changedBody,
          manifest_digest: computeRuntimeManifestDigest(changedBody),
        }),
        { expectedManifest: manifest },
      );
    },
    /does not match the tested artifact/,
  );
  assert.throws(
    () => validateCompatibleRuntimeProjection(
      {
        ...projection(),
        unchain_runtime_source: "/checkout/unchain/src/unchain/runtime/runtime_protocol.py",
      },
      { expectedManifest: manifest },
    ),
    /packaged runtime/,
  );
});

test("packaged smoke waits for forced sidecar termination before cleanup", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    if (signal === "SIGKILL") {
      setTimeout(() => {
        child.signalCode = "SIGKILL";
        child.emit("exit", null, "SIGKILL");
      }, 5);
    }
    return true;
  };

  await terminateChild(child, { gracefulTimeoutMs: 1, forcedTimeoutMs: 100 });
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(child.signalCode, "SIGKILL");
});

test("packaged smoke terminates the complete Windows sidecar process tree", async () => {
  const child = new EventEmitter();
  child.pid = 4242;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    throw new Error("Windows must not send a parent-only signal");
  };
  const invocations = [];

  await terminateChild(child, {
    platform: "win32",
    forcedTimeoutMs: 100,
    runProcessTreeCommand: (command, args, options) => {
      invocations.push({ command, args, options });
      child.signalCode = "SIGKILL";
      child.emit("exit", null, "SIGKILL");
      return { status: 0 };
    },
  });

  assert.deepEqual(invocations, [{
    command: "taskkill",
    args: ["/PID", "4242", "/T", "/F"],
    options: { windowsHide: true, stdio: "ignore" },
  }]);
});

test("packaged smoke fails closed when Windows process-tree termination fails", async () => {
  const child = new EventEmitter();
  child.pid = 4242;
  child.exitCode = null;
  child.signalCode = null;

  await assert.rejects(
    terminateChild(child, {
      platform: "win32",
      runProcessTreeCommand: () => ({ status: 1 }),
    }),
    /Windows process tree did not terminate/,
  );
});

test("real child process smoke proves auth, health, status, and nonzero execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-sidecar-smoke-"));
  const fakeSidecar = path.join(root, "fake-sidecar.mjs");
  const evidencePath = path.join(root, "artifact.json");
  const snapshotPath = path.join(root, "build_feature_flags.snapshot.json");
  const snapshot = shadowSnapshot();
  const expectedEnvironment = snapshot._pupu_memory_v2_release.sidecar_environment;
  fs.writeFileSync(
    fakeSidecar,
    `import http from "node:http";\n` +
      `import fs from "node:fs";\n` +
      `const manifest = ${JSON.stringify(manifest)};\n` +
      `const projection = ${JSON.stringify(projection())};\n` +
      `const expectedEnvironment = ${JSON.stringify(expectedEnvironment)};\n` +
      `if (process.env.PYTHONPATH || process.env.UNCHAIN_SOURCE_PATH || fs.realpathSync(process.cwd()) !== fs.realpathSync(process.env.UNCHAIN_DATA_DIR)) process.exit(86);\n` +
      `if (Object.entries(expectedEnvironment).some(([key, value]) => process.env[key] !== value)) process.exit(87);\n` +
      `const token = process.env.UNCHAIN_AUTH_TOKEN;\n` +
      `const server = http.createServer((req, res) => {\n` +
      `  if (req.headers["x-unchain-auth"] !== token) { res.writeHead(401, {"content-type":"application/json"}); res.end(JSON.stringify({error:{code:"unauthorized"}})); return; }\n` +
      `  if (req.url === "/health") { res.writeHead(200, {"content-type":"application/json"}); res.end(JSON.stringify({status:"ok", context_memory_v2: projection})); return; }\n` +
      `  if (req.url === "/context/v2/status") { res.writeHead(200, {"content-type":"application/json"}); res.end(JSON.stringify(projection)); return; }\n` +
      `  res.writeHead(404); res.end();\n` +
      `});\n` +
      `server.listen(Number(process.env.UNCHAIN_PORT), "127.0.0.1");\n` +
      `process.on("SIGTERM", () => server.close(() => process.exit(0)));\n`,
  );
  fs.writeFileSync(evidencePath, JSON.stringify({ runtime_manifest: manifest }));
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));

  try {
    const result = await runPackagedSidecarSmoke({
      binaryPath: process.execPath,
      binaryArgs: [fakeSidecar],
      evidencePath,
      snapshotPath,
      timeoutMs: 10_000,
    });
    assert.equal(result.started, true);
    assert.equal(result.authenticated_health, true);
    assert.equal(result.authenticated_context_status, true);
    assert.equal(result.unauthenticated_rejected, true);
    assert.equal(result.executed_tests, 5);
    assert.equal(
      result.snapshot_fingerprint,
      snapshot._pupu_memory_v2_release.snapshot_fingerprint,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
