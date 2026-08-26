#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { readJson } from "./release-artifact-manifest.mjs";
import { validateUpdateFixtureSource } from "./restart-update-qualification.mjs";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  for (const key of ["candidate-dir", "from-tag", "from-version", "from-commit"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = validateUpdateFixtureSource({
      manifest: readJson(path.join(path.resolve(args["candidate-dir"]), "release-assets.v1.json")),
      fromTag: args["from-tag"],
      fromVersion: args["from-version"],
      fromCommit: args["from-commit"],
    });
    console.log(`[update-fixture] source ${result.from_tag}@${result.from_commit} is eligible`);
  } catch (error) {
    console.error(`[update-fixture] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
