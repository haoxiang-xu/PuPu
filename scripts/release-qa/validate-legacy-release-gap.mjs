#!/usr/bin/env node

import fs from "node:fs";
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

try {
  const args = parseArgs(process.argv.slice(2));
  const apiRelease = JSON.parse(fs.readFileSync(0, "utf8"));
  const policy = readReleaseBootstrapPolicy(path.resolve(args.policy));
  const projection = projectLegacyReleaseApi(apiRelease, policy, args["legacy-tag-commit"]);
  writeJson(path.resolve(args.out), projection);
  console.log(`[release-bootstrap] verified legacy gap for ${projection.release.tag}`);
} catch (error) {
  console.error(`[release-bootstrap] ${error.message || String(error)}`);
  process.exit(1);
}
