import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runPackagedSidecarSmoke,
  validateCompatibleRuntimeProjection,
} from "./package-sidecar-smoke.mjs";
import {
  computeRuntimeManifestDigest,
  REQUIRED_RUNTIME_PROTOCOLS,
} from "./unchain-artifact.mjs";

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
  runtime_protocol_ready: true,
  runtime_protocol_reason: "unchain_runtime_protocol_compatible",
  runtime_protocol_verification: "runtime_protocol",
  runtime_protocol_immutable: true,
  runtime_protocol_manifest: runtimeManifest,
  unchain_revision: "f".repeat(40),
  unchain_runtime_source: "wheel",
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

test("real child process smoke proves auth, health, status, and nonzero execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-sidecar-smoke-"));
  const fakeSidecar = path.join(root, "fake-sidecar.mjs");
  const evidencePath = path.join(root, "artifact.json");
  fs.writeFileSync(
    fakeSidecar,
    `import http from "node:http";\n` +
      `import fs from "node:fs";\n` +
      `const manifest = ${JSON.stringify(manifest)};\n` +
      `const projection = ${JSON.stringify(projection())};\n` +
      `if (process.env.PYTHONPATH || process.env.UNCHAIN_SOURCE_PATH || fs.realpathSync(process.cwd()) !== fs.realpathSync(process.env.UNCHAIN_DATA_DIR)) process.exit(86);\n` +
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

  try {
    const result = await runPackagedSidecarSmoke({
      binaryPath: process.execPath,
      binaryArgs: [fakeSidecar],
      evidencePath,
      timeoutMs: 10_000,
    });
    assert.equal(result.started, true);
    assert.equal(result.authenticated_health, true);
    assert.equal(result.authenticated_context_status, true);
    assert.equal(result.unauthenticated_rejected, true);
    assert.equal(result.executed_tests, 4);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
