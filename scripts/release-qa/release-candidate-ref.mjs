#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_TAG_PATTERN = /^v(?<baseVersion>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:-rc\.(?<rcNumber>[1-9]\d*))?$/;
const POLICIES = Object.freeze(["candidate", "promotion"]);

const requiredExactString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string without surrounding whitespace`);
  }
  return value;
};

export function resolveReleaseCandidateRef({ tag, packageVersion, policy = "candidate" } = {}) {
  const expectedBaseVersion = requiredExactString(packageVersion, "package version");
  if (!STABLE_VERSION_PATTERN.test(expectedBaseVersion)) {
    throw new Error("package version must be a stable X.Y.Z version without prerelease or build metadata");
  }

  const releaseTag = requiredExactString(tag, "release tag");
  const match = RELEASE_TAG_PATTERN.exec(releaseTag);
  if (!match) {
    throw new Error("release tag must be vX.Y.Z or vX.Y.Z-rc.N, with N starting at 1 and no leading zero");
  }

  const selectedPolicy = requiredExactString(policy, "release ref policy");
  if (!POLICIES.includes(selectedPolicy)) {
    throw new Error(`release ref policy must be one of: ${POLICIES.join(", ")}`);
  }

  const baseVersion = match.groups.baseVersion;
  if (baseVersion !== expectedBaseVersion) {
    throw new Error(`release tag base version ${baseVersion} must match package version ${expectedBaseVersion}`);
  }

  const lane = match.groups.rcNumber ? "rc" : "stable";
  const effectiveVersion = releaseTag.slice(1);
  const promotable = lane === "stable";
  if (selectedPolicy === "promotion" && !promotable) {
    throw new Error(`release candidate tag ${releaseTag} is not eligible for promotion`);
  }

  return Object.freeze({
    tag: releaseTag,
    baseVersion,
    effectiveVersion,
    lane,
    promotable,
  });
}

const parseArgs = (argv) => {
  const allowed = new Set(["tag", "package-version", "policy"]);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected positional argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!allowed.has(key)) throw new Error(`unsupported argument: --${key}`);
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`argument --${key} may only be provided once`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  for (const key of allowed) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = resolveReleaseCandidateRef({
      tag: args.tag,
      packageVersion: args["package-version"],
      policy: args.policy,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`[release-candidate-ref] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
