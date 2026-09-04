#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  projectLegacyReleaseApi,
  readReleaseBootstrapPolicy,
} from "./release-bootstrap-policy.mjs";
import { writeJson } from "./release-artifact-manifest.mjs";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid argument near ${key || "(end)"}`);
    args[key.slice(2)] = value;
  }
  for (const key of ["policy", "legacy-tag-commit", "out"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const readStdin = async () => {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const apiRelease = JSON.parse(await readStdin());
  const policy = readReleaseBootstrapPolicy(path.resolve(args.policy));
  const projection = projectLegacyReleaseApi(apiRelease, policy, args["legacy-tag-commit"]);
  writeJson(path.resolve(args.out), projection);
  console.log(`[release-bootstrap] verified legacy gap for ${projection.release.tag}`);
};

main().catch((error) => {
  console.error(`[release-bootstrap] ${error.message || String(error)}`);
  process.exitCode = 1;
});
