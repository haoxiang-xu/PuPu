#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyUnchainArtifactEvidence,
  validateRuntimeManifestForRelease,
} from "./unchain-artifact.mjs";

const require = createRequire(import.meta.url);
const {
  resolveMemoryV2ReleaseConfig,
} = require("../../electron/main/services/unchain/memory_v2_rollout");

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
};

const allocateLoopbackPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const exactJson = (value) => JSON.stringify(value);

export function validateCompatibleRuntimeProjection(
  projection,
  { expectedManifest } = {},
) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw new Error("runtime protocol projection must be an object");
  }
  const expectedTuple = {
    runtime_protocol_ready: true,
    runtime_protocol_reason: "unchain_runtime_protocol_compatible",
    runtime_protocol_verification: "runtime_protocol",
    runtime_protocol_immutable: true,
  };
  for (const [field, expected] of Object.entries(expectedTuple)) {
    if (projection[field] !== expected) {
      throw new Error(`${field} must equal ${JSON.stringify(expected)}`);
    }
  }
  validateRuntimeManifestForRelease(projection.runtime_protocol_manifest);
  validateRuntimeManifestForRelease(expectedManifest);
  if (exactJson(projection.runtime_protocol_manifest) !== exactJson(expectedManifest)) {
    throw new Error("runtime protocol manifest does not match the tested artifact");
  }
  if (typeof projection.unchain_revision !== "string") {
    throw new Error("unchain_revision telemetry must be present");
  }
  if (typeof projection.unchain_runtime_source !== "string" || !projection.unchain_runtime_source) {
    throw new Error("unchain_runtime_source telemetry must be present");
  }
  const runtimeSource = projection.unchain_runtime_source.replaceAll("\\", "/");
  if (/editable|checkout|\/src\/unchain\//i.test(runtimeSource)) {
    throw new Error("unchain_runtime_source must identify the packaged runtime");
  }
}

const parseBuildFeatureSnapshot = (snapshotPath) => {
  if (!snapshotPath) {
    throw new Error("build feature snapshot is required for packaged sidecar smoke");
  }
  const resolvedSnapshotPath = path.resolve(snapshotPath);
  let source;
  try {
    source = JSON.parse(fs.readFileSync(resolvedSnapshotPath, "utf8"));
  } catch (error) {
    throw new Error(
      `build feature snapshot is unreadable at ${resolvedSnapshotPath}: ${error.message}`,
    );
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("build feature snapshot must be an object");
  }

  const releaseConfig = resolveMemoryV2ReleaseConfig({
    app: {
      isPackaged: true,
      getAppPath: () => "/pupu-release-candidate",
    },
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(source),
    },
    path,
    environment: {},
  });
  if (
    !releaseConfig.buildFeatureEnabled ||
    !releaseConfig.snapshotValid ||
    !releaseConfig.snapshotFingerprint
  ) {
    throw new Error(
      `build feature snapshot is not a valid enabled release snapshot: ${
        releaseConfig.snapshotErrorCode || "memory_v2_feature_disabled"
      }`,
    );
  }
  return releaseConfig;
};

export function validateSnapshotRolloutProjection(projection, releaseConfig) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw new Error("runtime rollout projection must be an object");
  }
  const expected = {
    canary_percent: releaseConfig.canaryPercent,
    configured_mode: releaseConfig.configuredMode,
    feature_ceiling: releaseConfig.featureCeiling,
    read_only_degraded: releaseConfig.readOnlyDegraded,
    rollout_fingerprint: releaseConfig.rolloutFingerprint,
    rollout_mode: releaseConfig.effectiveMode,
    rollout_config_valid: true,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (projection[field] !== value) {
      throw new Error(
        `runtime rollout ${field} does not match the build feature snapshot`,
      );
    }
  }
}

const requestJson = async (url, token = "") => {
  const response = await fetch(url, {
    headers: token ? { "x-unchain-auth": token } : {},
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
};

const terminateChild = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2_000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
};

export async function runPackagedSidecarSmoke({
  binaryPath,
  binaryArgs = [],
  evidencePath,
  artifactPath = "",
  snapshotPath = "",
  timeoutMs = 30_000,
} = {}) {
  const releaseConfig = parseBuildFeatureSnapshot(snapshotPath);
  let evidence;
  if (artifactPath) {
    evidence = readAndVerifyUnchainArtifactEvidence({ artifactPath, evidencePath });
  } else {
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    validateRuntimeManifestForRelease(evidence.runtime_manifest);
  }
  const expectedManifest = evidence.runtime_manifest;
  const port = await allocateLoopbackPort();
  const token = `pupu-release-smoke-${process.pid}-${Date.now()}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-sidecar-smoke-data-"));
  const child = spawn(path.resolve(binaryPath), binaryArgs, {
    cwd: dataDir,
    env: {
      ...process.env,
      PYTHONPATH: "",
      UNCHAIN_SOURCE_PATH: "",
      UNCHAIN_HOST: "127.0.0.1",
      UNCHAIN_PORT: String(port),
      UNCHAIN_AUTH_TOKEN: token,
      UNCHAIN_DATA_DIR: dataDir,
      ...releaseConfig.sidecarEnvironment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-16_384);
  });
  child.stderr?.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-16_384);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;

  try {
    let unauthenticatedHealth;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `packaged sidecar exited before health check (code=${child.exitCode}): ${output}`,
        );
      }
      try {
        unauthenticatedHealth = await requestJson(`${baseUrl}/health`);
        break;
      } catch {
        await sleep(100);
      }
    }
    if (!unauthenticatedHealth) {
      throw new Error(`packaged sidecar did not start within ${timeoutMs}ms: ${output}`);
    }
    if (unauthenticatedHealth.status !== 401) {
      throw new Error("unauthenticated /health must return 401");
    }
    const unauthenticatedStatus = await requestJson(`${baseUrl}/context/v2/status`);
    if (unauthenticatedStatus.status !== 401) {
      throw new Error("unauthenticated /context/v2/status must return 401");
    }
    const health = await requestJson(`${baseUrl}/health`, token);
    if (health.status !== 200 || health.payload?.status !== "ok") {
      throw new Error(`authenticated /health failed with HTTP ${health.status}`);
    }
    validateCompatibleRuntimeProjection(health.payload.context_memory_v2, {
      expectedManifest,
    });
    const status = await requestJson(`${baseUrl}/context/v2/status`, token);
    if (status.status !== 200) {
      throw new Error(
        `authenticated /context/v2/status failed with HTTP ${status.status}`,
      );
    }
    validateCompatibleRuntimeProjection(status.payload, { expectedManifest });
    validateSnapshotRolloutProjection(status.payload, releaseConfig);
    return {
      schema: "pupu.release.packaged-sidecar-smoke.v1",
      started: true,
      unauthenticated_rejected: true,
      authenticated_health: true,
      authenticated_context_status: true,
      runtime_manifest_digest: expectedManifest.manifest_digest,
      snapshot_fingerprint: releaseConfig.snapshotFingerprint,
      rollout_fingerprint: releaseConfig.rolloutFingerprint,
      executed_tests: 5,
    };
  } finally {
    await terminateChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const args = parseArgs(process.argv.slice(2));
  const binaryPath = args.binary;
  const evidencePath = args.evidence;
  const artifactPath = args.artifact;
  const snapshotPath = args.snapshot;
  const outPath = args.out || "packaged-sidecar-smoke.json";
  if (!binaryPath || !evidencePath || !artifactPath || !snapshotPath) {
    console.error("--binary, --artifact, --evidence, and --snapshot are required");
    process.exit(2);
  }
  try {
    const result = await runPackagedSidecarSmoke({
      binaryPath,
      evidencePath,
      artifactPath,
      snapshotPath,
    });
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
          `executed_tests=${result.executed_tests}\n` +
          `runtime_manifest_digest=${result.runtime_manifest_digest}\n` +
          `snapshot_fingerprint=${result.snapshot_fingerprint}\n`,
      );
    }
    console.log(`[release-qa] packaged sidecar smoke passed (${result.executed_tests} checks)`);
  } catch (error) {
    console.error(`[release-qa] packaged sidecar smoke failed: ${error.message}`);
    process.exit(1);
  }
}
