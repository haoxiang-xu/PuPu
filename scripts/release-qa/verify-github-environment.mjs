#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function assertProtectedReleaseEnvironment(environment, expectedName) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new Error("GitHub Environment response must be an object");
  }
  if (environment.name !== expectedName) {
    throw new Error(`expected GitHub Environment ${expectedName}`);
  }
  if (!Array.isArray(environment.protection_rules)) {
    throw new Error(`GitHub Environment ${expectedName} has no readable protection rules`);
  }
  const reviewers = environment.protection_rules.find((rule) =>
    rule && typeof rule === "object" && rule.type === "required_reviewers"
  );
  if (!reviewers || !Array.isArray(reviewers.reviewers) || reviewers.reviewers.length === 0) {
    throw new Error(`GitHub Environment ${expectedName} must require reviewers before release work runs`);
  }
  return environment;
}

function parseArgs(argv) {
  const index = argv.indexOf("--environment");
  return { environment: index >= 0 ? argv[index + 1] || "" : "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { environment } = parseArgs(process.argv.slice(2));
    if (!environment) throw new Error("--environment is required");
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));
    assertProtectedReleaseEnvironment(payload, environment);
    console.log(`[release-environment] ${environment} has required reviewers`);
  } catch (error) {
    console.error(`[release-environment] ${error.message || String(error)}`);
    process.exit(1);
  }
}
