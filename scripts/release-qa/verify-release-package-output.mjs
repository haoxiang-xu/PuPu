#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  readReleaseArtifactContract,
  verifyRawPackageOutputDirectory,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetId = args.target || "";
  const version = args.version || "";
  const distDir = args["dist-dir"] ? path.resolve(args["dist-dir"]) : "";
  const contractPath = args.contract
    ? path.resolve(args.contract)
    : path.join(ROOT, "contracts/release/release-artifact-contract.v1.json");
  if (!targetId || !version || !distDir) {
    throw new Error("--target, --version, and --dist-dir are required");
  }
  const contract = readReleaseArtifactContract(contractPath);
  const actual = verifyRawPackageOutputDirectory({
    contract,
    targetId,
    version,
    distDir,
  });
  console.log(`[release-package-output] ${targetId} produced ${actual.length} allowlisted output file(s)`);
}

try {
  main();
} catch (error) {
  console.error(`[release-package-output] ${error.message || String(error)}`);
  process.exit(1);
}
