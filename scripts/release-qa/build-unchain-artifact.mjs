#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  buildUnchainArtifactEvidence,
  inspectRuntimeManifestFromWheel,
} from "./unchain-artifact.mjs";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[value.slice(2)] = next;
      index += 1;
    }
  }
  return args;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 || result.error) {
    const detail = String(
      result.stderr || result.stdout || result.error || "unknown failure",
    ).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout || "").trim();
};

const args = parseArgs(process.argv.slice(2));
const sourcePath = path.resolve(
  args.source || process.env.UNCHAIN_ARTIFACT_SOURCE_PATH || "",
);
const sourceRef = String(
  args["source-ref"] || process.env.UNCHAIN_SOURCE_REF || "",
).trim();
const outputDirectory = path.resolve(
  args["out-dir"] || ".release-qa/unchain-artifact",
);
const evidencePath = path.resolve(
  args.evidence || path.join(outputDirectory, "unchain-artifact.json"),
);
const python = args.python || process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");

try {
  if (!sourceRef) {
    throw new Error("selected Unchain source ref is required for provenance");
  }
  const sourceMarker = path.join(sourcePath, "src", "unchain", "__init__.py");
  if (!fs.existsSync(sourceMarker)) {
    throw new Error(`invalid selected Unchain source: expected ${sourceMarker}`);
  }
  const sourceRevision = run("git", ["rev-parse", "HEAD"], { cwd: sourcePath });
  const sourceStatus = run(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: sourcePath },
  );
  if (sourceStatus) {
    throw new Error("selected Unchain source provenance is dirty");
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const existingWheels = fs.readdirSync(outputDirectory)
    .filter((name) => name.endsWith(".whl"));
  if (existingWheels.length > 0) {
    throw new Error("artifact output directory already contains a wheel");
  }

  run(
    python,
    [
      "-m", "pip", "wheel", "--no-deps", "--no-cache-dir",
      "--wheel-dir", outputDirectory,
      sourcePath,
    ],
    { stdio: "inherit" },
  );
  const wheels = fs.readdirSync(outputDirectory)
    .filter((name) => name.endsWith(".whl"));
  if (wheels.length !== 1) {
    throw new Error(`single build must produce exactly one wheel; observed ${wheels.length}`);
  }
  const artifactPath = path.join(outputDirectory, wheels[0]);
  const runtimeManifest = inspectRuntimeManifestFromWheel({ artifactPath, python });
  const evidence = buildUnchainArtifactEvidence({
    artifactPath,
    runtimeManifest,
    source: {
      repository: "haoxiang-xu/unchain",
      ref: sourceRef,
      revision: sourceRevision,
      dirty: false,
    },
  });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `artifact_path=${artifactPath}`,
        `evidence_path=${evidencePath}`,
        `artifact_sha256=${evidence.artifact.sha256}`,
        `runtime_manifest_digest=${evidence.runtime_manifest.manifest_digest}`,
        `source_revision=${evidence.source.revision}`,
        `source_ref=${evidence.source.ref}`,
        `source_dirty=false`,
        "executed_tests=2",
        "",
      ].join("\n"),
    );
  }
  console.log(
    `[release-qa] built one Unchain wheel ${evidence.artifact.name}; ` +
      `artifact=${evidence.artifact.sha256}; ` +
      `manifest=${evidence.runtime_manifest.manifest_digest}; ` +
      `revision=${sourceRevision}`,
  );
} catch (error) {
  console.error(`[release-qa] Unchain artifact build failed: ${error.message}`);
  process.exit(1);
}
