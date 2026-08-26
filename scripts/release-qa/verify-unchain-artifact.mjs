#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  readAndVerifyUnchainArtifactEvidence,
  verifyInstalledUnchainDistribution,
  verifyWheelRuntimeManifest,
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

const args = parseArgs(process.argv.slice(2));
const artifactPath = path.resolve(
  args.artifact || process.env.UNCHAIN_ARTIFACT_PATH || "",
);
const evidencePath = path.resolve(
  args.evidence || process.env.UNCHAIN_ARTIFACT_EVIDENCE_PATH || "",
);
const python = args.python || process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");

try {
  const bytesOnly = args["bytes-only"] === "true";
  const evidence = bytesOnly
    ? readAndVerifyUnchainArtifactEvidence({ artifactPath, evidencePath })
    : verifyWheelRuntimeManifest({ artifactPath, evidencePath, python });
  if (bytesOnly && args.installed === "true") {
    throw new Error("--bytes-only and --installed cannot be combined");
  }
  if (args.installed === "true") {
    verifyInstalledUnchainDistribution({ python, evidence });
  }
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
        `source_dirty=${evidence.source.dirty}`,
        `executed_tests=${bytesOnly ? 1 : 2}`,
        "",
      ].join("\n"),
    );
  }
  console.log(
    `[release-qa] verified ${bytesOnly ? "bytes " : "runtime "}` +
      `${evidence.artifact.sha256} with ` +
      `${evidence.runtime_manifest.manifest_digest}`,
  );
} catch (error) {
  console.error(`[release-qa] Unchain artifact verification failed: ${error.message}`);
  process.exit(1);
}
