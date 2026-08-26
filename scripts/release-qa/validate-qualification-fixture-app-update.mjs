#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { validateRunnerLoopbackFeedUrl } from "./write-qualification-fixture-build-config.mjs";

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys must be exactly ${required.join(", ")}`);
  }
};

export function validateQualificationFixtureAppUpdate({ contents, feedUrl }) {
  if (typeof contents !== "string") throw new Error("qualification fixture app-update.yml must be text");
  const expectedUrl = validateRunnerLoopbackFeedUrl(feedUrl);
  const config = YAML.parse(contents);
  exactKeys(config, ["provider", "updaterCacheDirName", "url"], "qualification fixture app-update.yml");
  if (config.provider !== "generic" || config.url !== expectedUrl) {
    throw new Error("qualification fixture app-update.yml must use the exact runner-loopback generic provider");
  }
  if (config.updaterCacheDirName !== "pupu-updater") {
    throw new Error("qualification fixture app-update.yml must retain the PuPu updater cache identity");
  }
  return config;
}

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
  for (const key of ["app-update", "feed-url"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    validateQualificationFixtureAppUpdate({
      contents: fs.readFileSync(path.resolve(args["app-update"]), "utf8"),
      feedUrl: args["feed-url"],
    });
    console.log("[qualification-fixture] app-update.yml is bound to the exact runner-loopback feed");
  } catch (error) {
    console.error(`[qualification-fixture] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
