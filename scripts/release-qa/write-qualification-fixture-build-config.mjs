#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

export function validateRunnerLoopbackFeedUrl(value) {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new Error("qualification fixture feed URL must be a trimmed string");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("qualification fixture feed URL must be a valid URL");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
      !url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("qualification fixture feed URL must be an exact http://127.0.0.1:<port>/ endpoint");
  }
  const port = Number(url.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("qualification fixture feed URL port is invalid");
  }
  return url.toString();
}

const validateSourcePublishConfig = (publish) => {
  if (!Array.isArray(publish) || publish.length !== 1) {
    throw new Error("source build publish config must contain exactly one provider");
  }
  exactKeys(publish[0], ["owner", "provider", "releaseType", "repo"], "source build publish config");
  if (publish[0].provider !== "github" || publish[0].releaseType !== "release" ||
      typeof publish[0].owner !== "string" || !publish[0].owner ||
      typeof publish[0].repo !== "string" || !publish[0].repo) {
    throw new Error("source build publish config must be a complete GitHub release provider");
  }
};

export function createQualificationFixtureBuildConfig({ sourcePackage, feedUrl }) {
  if (!sourcePackage || typeof sourcePackage !== "object" || Array.isArray(sourcePackage)) {
    throw new Error("qualification fixture source package must be an object");
  }
  if (!sourcePackage.build || typeof sourcePackage.build !== "object" || Array.isArray(sourcePackage.build)) {
    throw new Error("qualification fixture source package must declare build config");
  }
  const normalizedFeedUrl = validateRunnerLoopbackFeedUrl(feedUrl);
  validateSourcePublishConfig(sourcePackage.build.publish);
  const config = structuredClone(sourcePackage.build);
  config.publish = {
    provider: "generic",
    url: normalizedFeedUrl,
  };
  return config;
}

export function writeQualificationFixtureBuildConfig({ packageJsonPath, feedUrl, outPath }) {
  const sourcePath = path.resolve(packageJsonPath);
  const output = path.resolve(outPath);
  if (fs.existsSync(output)) throw new Error("qualification fixture config output must not already exist");
  const sourcePackage = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const config = createQualificationFixtureBuildConfig({ sourcePackage, feedUrl });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
  for (const key of ["package-json", "feed-url", "out"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    writeQualificationFixtureBuildConfig({
      packageJsonPath: args["package-json"],
      feedUrl: args["feed-url"],
      outPath: args.out,
    });
    console.log("[qualification-fixture] wrote a config with the sole allowed app-update.yml difference");
  } catch (error) {
    console.error(`[qualification-fixture] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
