import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { mergeReports } from "./reporting.mjs";
import { expectedReportPlatformsForMode } from "./release-qa-mode-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const topology = JSON.parse(fs.readFileSync(
  path.join(ROOT, "contracts/memory-v2/release-qa-report-topology.v1.json"),
  "utf8",
));

const passedReport = (platform) => ({
  mode: "lite",
  platform: { name: platform, os: platform },
  checks: [],
  deterministic_result: { status: "passed" },
});

test("W0-06 freezes distinct expected report sets for lite, release, and Windows qualification", () => {
  assert.deepEqual(expectedReportPlatformsForMode(topology, "lite"), [
    "deterministic",
    "playwright-Linux",
  ]);
  assert.equal(
    expectedReportPlatformsForMode(topology, "release").includes("windows"),
    true,
  );
  assert.equal(
    expectedReportPlatformsForMode(topology, "windows-active-qualification")
      .includes("windows-installed-qualification"),
    true,
  );
});

test("W0-06 rejects unknown modes and tampered closed topology entries", () => {
  assert.throws(
    () => expectedReportPlatformsForMode(topology, "unexpected"),
    /unsupported/,
  );
  const duplicate = structuredClone(topology);
  duplicate.modes.lite.required_reports.push({ platform: "deterministic" });
  assert.throws(
    () => expectedReportPlatformsForMode(duplicate, "lite"),
    /repeats/,
  );
  const extra = structuredClone(topology);
  extra.modes.release.extra = true;
  assert.throws(
    () => expectedReportPlatformsForMode(extra, "release"),
    /invalid definition/,
  );
});

test("W0-06 makes missing, duplicate, and zero-evidence required reports fail closed", () => {
  const required = expectedReportPlatformsForMode(topology, "lite");
  const missing = mergeReports([passedReport("deterministic")], {
    mode: "lite",
    requiredReportPlatforms: required,
  });
  assert.equal(missing.deterministic_result.status, "failed");
  assert.match(
    missing.checks.find((check) => check.name === "required report playwright-Linux")
      .details,
    /missing/,
  );

  const duplicate = mergeReports([
    passedReport("deterministic"),
    passedReport("playwright-Linux"),
    passedReport("playwright-Linux"),
  ], {
    mode: "lite",
    requiredReportPlatforms: required,
  });
  assert.match(
    duplicate.checks.find((check) => check.name === "required report playwright-Linux")
      .details,
    /more than once/,
  );

  const zeroEvidence = passedReport("playwright-Linux");
  zeroEvidence.deterministic_result = { status: "failed" };
  const zero = mergeReports([
    passedReport("deterministic"),
    zeroEvidence,
  ], {
    mode: "lite",
    requiredReportPlatforms: required,
  });
  assert.match(
    zero.checks.find((check) => check.name === "required report playwright-Linux")
      .details,
    /zero-evidence/,
  );
});
