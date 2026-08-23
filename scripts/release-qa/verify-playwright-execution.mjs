#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
};

const isExecutedStatus = (status) =>
  ["passed", "failed", "timedOut", "interrupted"].includes(status);

const countExecutedTests = (suites) => {
  let count = 0;
  for (const suite of Array.isArray(suites) ? suites : []) {
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
        if (Array.isArray(test.results) && test.results.some((result) =>
          isExecutedStatus(result?.status)
        )) {
          count += 1;
        }
      }
    }
    count += countExecutedTests(suite.suites);
  }
  return count;
};

export function verifyPlaywrightExecution(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Playwright JSON report must be an object");
  }
  const executedTests = countExecutedTests(payload.suites);
  if (executedTests === 0) {
    throw new Error("Playwright report has zero executed tests");
  }
  return { executedTests };
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const args = parseArgs(process.argv.slice(2));
  const resultsPath = args.results;
  if (!resultsPath) {
    console.error("--results is required");
    process.exit(2);
  }
  try {
    const result = verifyPlaywrightExecution(
      JSON.parse(fs.readFileSync(resultsPath, "utf8")),
    );
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `executed_tests=${result.executedTests}\n`,
      );
    }
    console.log(`[release-qa] Playwright executed ${result.executedTests} test(s)`);
  } catch (error) {
    console.error(`[release-qa] Playwright execution evidence failed: ${error.message}`);
    process.exit(1);
  }
}
