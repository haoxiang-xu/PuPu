#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXPECTED_PUBLISHER = Object.freeze({
  provider: "github",
  owner: "haoxiang-xu",
  repo: "PuPu",
  releaseType: "release",
});
const PUBLISHER_KEYS = Object.freeze(Object.keys(EXPECTED_PUBLISHER));
const APP_UPDATE_KEYS = Object.freeze([
  "owner",
  "provider",
  "releaseType",
  "repo",
  "updaterCacheDirName",
]);

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

const readPackageJson = (packageJsonPath) => {
  const resolved = path.resolve(packageJsonPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`could not read production package metadata at ${resolved}: ${error.message || String(error)}`);
  }
  return parsed;
};

export function buildProductionAppUpdateConfig(packageJson) {
  const publishers = packageJson?.build?.publish;
  if (packageJson?.name !== "PuPu" || !Array.isArray(publishers) || publishers.length !== 1) {
    throw new Error("production publish config must contain the single public PuPu GitHub publisher");
  }
  const publisher = publishers[0];
  exactKeys(publisher, PUBLISHER_KEYS, "production publish config");
  for (const [key, expected] of Object.entries(EXPECTED_PUBLISHER)) {
    if (publisher?.[key] !== expected) {
      throw new Error(`production publish config ${key} must be ${expected}`);
    }
  }
  return {
    owner: publisher.owner,
    repo: publisher.repo,
    provider: publisher.provider,
    releaseType: publisher.releaseType,
    updaterCacheDirName: `${packageJson.name.toLowerCase()}-updater`,
  };
}

export function validateProductionAppUpdate({ contents, packageJson }) {
  if (typeof contents !== "string") {
    throw new Error("production updater config must be UTF-8 text");
  }
  let config;
  try {
    config = YAML.parse(contents);
  } catch (error) {
    throw new Error(`production updater config is not valid YAML: ${error.message || String(error)}`);
  }
  exactKeys(config, APP_UPDATE_KEYS, "production updater config");
  const expected = buildProductionAppUpdateConfig(packageJson);
  for (const key of APP_UPDATE_KEYS) {
    if (config[key] !== expected[key]) {
      throw new Error(`production updater config ${key} must be ${expected[key]}`);
    }
  }
  return {
    config,
    sha256: `sha256:${crypto.createHash("sha256").update(contents).digest("hex")}`,
  };
}

export function validateProductionAppUpdateFile({
  appUpdatePath,
  packageJsonPath = path.join(ROOT, "package.json"),
}) {
  const output = path.resolve(appUpdatePath);
  let contents;
  try {
    contents = fs.readFileSync(output, "utf8");
  } catch (error) {
    throw new Error(`could not read production updater config at ${output}: ${error.message || String(error)}`);
  }
  return {
    appUpdatePath: output,
    ...validateProductionAppUpdate({
      contents,
      packageJson: readPackageJson(packageJsonPath),
    }),
  };
}

export function prepareProductionAppUpdate({
  appUpdatePath,
  packageJsonPath = path.join(ROOT, "package.json"),
}) {
  const output = path.resolve(appUpdatePath);
  const packageJson = readPackageJson(packageJsonPath);
  const contents = YAML.stringify(buildProductionAppUpdateConfig(packageJson));
  validateProductionAppUpdate({ contents, packageJson });
  try {
    fs.writeFileSync(output, contents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return validateProductionAppUpdateFile({ appUpdatePath: output, packageJsonPath });
}

const parseArgs = (argv) => {
  const [mode, ...tokens] = argv;
  if (!["prepare", "validate"].includes(mode)) {
    throw new Error("expected prepare or validate mode");
  }
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    values[key.slice(2)] = value;
  }
  if (!values["app-update"] || Object.keys(values).some((key) => !["app-update", "package-json"].includes(key))) {
    throw new Error("expected --app-update <path> [--package-json <path>]");
  }
  return {
    mode,
    appUpdatePath: values["app-update"],
    packageJsonPath: values["package-json"] || path.join(ROOT, "package.json"),
  };
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const { mode, appUpdatePath, packageJsonPath } = parseArgs(process.argv.slice(2));
    const result = mode === "prepare"
      ? prepareProductionAppUpdate({ appUpdatePath, packageJsonPath })
      : validateProductionAppUpdateFile({ appUpdatePath, packageJsonPath });
    console.log(`[production-app-update] ${mode}d ${result.appUpdatePath} (${result.sha256})`);
  } catch (error) {
    console.error(`[production-app-update] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
