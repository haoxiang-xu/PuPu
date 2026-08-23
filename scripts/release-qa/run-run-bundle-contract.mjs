#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  verifyUnchainTestSourceProvenance,
  verifyWheelRuntimeManifest,
} from "./unchain-artifact.mjs";
import {
  ELECTRON_RUN_BUNDLE_TESTS,
  flattenNamedTests,
  PRICING_CATALOG_TESTS,
  PUPU_RUN_BUNDLE_TESTS,
  RENDERER_RUN_BUNDLE_TESTS,
  UNCHAIN_RUN_BUNDLE_TESTS,
} from "./run-bundle-contract-matrix.mjs";
import { requireNonzeroJestExecution } from "./jest-execution-report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const artifactPath = path.resolve(process.env.UNCHAIN_ARTIFACT_PATH || "");
const evidencePath = path.resolve(
  process.env.UNCHAIN_ARTIFACT_EVIDENCE_PATH || "",
);
const unchainRoot = path.resolve(process.env.UNCHAIN_TEST_SOURCE_PATH || "");

const venvPython = process.platform === "win32"
  ? path.join("Scripts", "python.exe")
  : path.join("bin", "python");
const python = process.env.PYTHON || [
  path.join(ROOT, ".venv", venvPython),
].find((candidate) => fs.existsSync(candidate)) ||
  (process.platform === "win32" ? "python" : "python3");
let artifactEvidence;
try {
  artifactEvidence = verifyWheelRuntimeManifest({
    artifactPath,
    evidencePath,
    python,
  });
  verifyUnchainTestSourceProvenance({
    sourcePath: unchainRoot,
    evidence: artifactEvidence,
  });
} catch (error) {
  console.error(`[run-bundle-contract] ${error.message}`);
  process.exit(1);
}
console.log(
  `[run-bundle-contract] artifact=${artifactEvidence.artifact.sha256}; ` +
    `manifest=${artifactEvidence.runtime_manifest.manifest_digest}; ` +
    `source_revision=${artifactEvidence.source.revision}`,
);
const pythonPath = artifactPath;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const verifyNamedSentinels = (groups) => {
  for (const { file, name } of flattenNamedTests(groups)) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!source.includes(`\"${name}\"`) && !source.includes(`'${name}'`)) {
      console.error(
        `[run-bundle-contract] exact test sentinel is missing: ${file} :: ${name}`,
      );
      process.exit(1);
    }
  }
};

verifyNamedSentinels(ELECTRON_RUN_BUNDLE_TESTS);
verifyNamedSentinels(RENDERER_RUN_BUNDLE_TESTS);
verifyNamedSentinels(PRICING_CATALOG_TESTS);

const createJestResultFile = (label) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), `pupu-run-bundle-${label}-`),
  );
  return path.join(directory, "jest-result.json");
};

const cleanupJestResultFile = (resultPath) => {
  if (resultPath) {
    fs.rmSync(path.dirname(resultPath), { recursive: true, force: true });
  }
};

const runStage = ({ name, command, args, cwd, env = {}, jestResultFile = null }) => {
  console.log(`\n[run-bundle-contract] === ${name} ===`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) {
    cleanupJestResultFile(jestResultFile);
    console.error(`[run-bundle-contract] ${name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    cleanupJestResultFile(jestResultFile);
    console.error(`[run-bundle-contract] ${name} failed`);
    process.exit(result.status || 1);
  }
  if (jestResultFile) {
    try {
      const execution = requireNonzeroJestExecution({
        reportPath: jestResultFile,
        stageName: name,
      });
      console.log(
        `[run-bundle-contract] ${name}: ${execution.executedTests} tests in ` +
          `${execution.executedSuites} suites executed`,
      );
    } catch (error) {
      console.error(`[run-bundle-contract] ${error.message}`);
      cleanupJestResultFile(jestResultFile);
      process.exit(1);
    }
    cleanupJestResultFile(jestResultFile);
  }
};

runStage({
  name: "Unchain canonical producer and ledger",
  command: python,
  args: ["-m", "pytest", ...UNCHAIN_RUN_BUNDLE_TESTS, "-q", "--tb=short"],
  cwd: unchainRoot,
  env: { PYTHONPATH: pythonPath },
});
runStage({
  name: "PuPu sidecar projection and state sequences",
  command: python,
  args: ["-m", "pytest", ...PUPU_RUN_BUNDLE_TESTS, "-q", "--tb=short"],
  cwd: path.join(ROOT, "unchain_runtime", "server"),
  env: { PYTHONPATH: pythonPath },
});

const pricingNames = flattenNamedTests(PRICING_CATALOG_TESTS)
  .map(({ name }) => escapeRegex(name));
runStage({
  name: "Signed official pricing catalog and immutable estimates",
  command: process.execPath,
  args: [
    "--test",
    "--test-name-pattern",
    `^(?:${pricingNames.join("|")})$`,
    ...PRICING_CATALOG_TESTS.map(({ file }) => file),
  ],
  cwd: ROOT,
});

const electronJestResultFile = createJestResultFile("electron");
runStage({
  name: "Electron strict admission and idempotent storage",
  command: process.execPath,
  args: [
    path.join(ROOT, "node_modules", ".bin", "jest"),
    "--env=node",
    "--runInBand",
    "--silent",
    "--moduleFileExtensions", "js",
    "--moduleFileExtensions", "cjs",
    "--moduleFileExtensions", "json",
    "--testMatch", "**/electron/tests/**/*.test.cjs",
    "--runTestsByPath",
    ...ELECTRON_RUN_BUNDLE_TESTS.map(({ file }) => file),
    "--json",
    "--outputFile", electronJestResultFile,
  ],
  cwd: ROOT,
  jestResultFile: electronJestResultFile,
});

const rendererJestResultFile = createJestResultFile("renderer");
runStage({
  name: "Renderer accounting barrier and presentation",
  command: process.execPath,
  args: [
    path.join(ROOT, "node_modules", ".bin", "react-scripts"),
    "test",
    "--watchAll=false",
    "--runInBand",
    "--json",
    "--outputFile", rendererJestResultFile,
    ...RENDERER_RUN_BUNDLE_TESTS.map(({ file }) => file),
  ],
  cwd: ROOT,
  env: { CI: "true" },
  jestResultFile: rendererJestResultFile,
});

console.log("\n[run-bundle-contract] all blocking stages passed");
if (process.env.GITHUB_OUTPUT) {
  const namedNodeTests = [
    ...flattenNamedTests(ELECTRON_RUN_BUNDLE_TESTS),
    ...flattenNamedTests(RENDERER_RUN_BUNDLE_TESTS),
    ...flattenNamedTests(PRICING_CATALOG_TESTS),
  ].length;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `executed_tests=${UNCHAIN_RUN_BUNDLE_TESTS.length + PUPU_RUN_BUNDLE_TESTS.length + namedNodeTests}\n`,
  );
}
