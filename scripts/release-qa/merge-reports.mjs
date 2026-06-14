#!/usr/bin/env node

import process from "node:process";

import {
  findJobReports,
  mergeReports,
  readJson,
  renderMarkdown,
  writeJson,
  writeText,
} from "./reporting.mjs";

function parseArgs(argv) {
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
}

const args = parseArgs(process.argv.slice(2));
const inputDir = args["input-dir"] || "qa-job-reports";
const outJson = args["out-json"] || "release-qa-report.json";
const outMd = args["out-md"] || "release-qa-report.md";
const analysisPath = args["analysis-json"] || "";
const failOnDeterministicFailure = args["fail-on-deterministic-failure"] === "true";

const reportPaths = findJobReports(inputDir);
const reports = reportPaths.map(readJson);
if (reports.length === 0) {
  reports.push({
    mode: "lite",
    version: "",
    git: {},
    platform: { name: "merge", os: "merge" },
    checks: [
      {
        name: "job reports found",
        command: `find ${inputDir} -name release-qa-job-report.json`,
        status: "failed",
        outcome: "failure",
        details: "no release QA job reports were found",
      },
    ],
    artifacts: [],
  });
}

const unchainAnalysis = analysisPath ? readJson(analysisPath) : undefined;
const merged = mergeReports(reports, { unchainAnalysis });

writeJson(outJson, merged);
writeText(outMd, renderMarkdown(merged));
console.log(`[release-qa] merged ${reports.length} job report(s) into ${outJson}`);

if (failOnDeterministicFailure && merged.deterministic_result?.status === "failed") {
  console.error("[release-qa] deterministic gate failed");
  process.exit(1);
}
