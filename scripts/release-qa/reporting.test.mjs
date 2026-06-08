import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildJobReport,
  mergeReports,
  renderMarkdown,
} from "./reporting.mjs";

test("buildJobReport records deterministic failures and version mismatch", () => {
  const report = buildJobReport({
    mode: "release",
    platform: { os: "linux", name: "linux" },
    version: "0.1.6",
    expectedVersion: "0.1.7",
    git: { sha: "abc123", ref: "refs/tags/v0.1.7" },
    checks: [
      { name: "frontend", command: "npm run test:frontend", outcome: "success" },
      { name: "package", command: "npm run build:electron:linux", outcome: "failure" },
    ],
    artifacts: [{ name: "PuPu-0.1.6.AppImage", path: "dist/PuPu-0.1.6.AppImage" }],
  });

  assert.equal(report.deterministic_result.status, "failed");
  assert.equal(report.checks[0].status, "passed");
  assert.equal(report.checks[1].status, "failed");
  assert.equal(report.checks[2].name, "version matches expected release");
  assert.equal(report.checks[2].status, "failed");
});

test("mergeReports merges platforms and marks advisory Unchain analysis as non-blocking", () => {
  const merged = mergeReports(
    [
      buildJobReport({
        mode: "lite",
        platform: { os: "ubuntu-latest", name: "deterministic" },
        version: "0.1.6",
        git: { sha: "abc123" },
        checks: [{ name: "frontend", outcome: "success" }],
      }),
      buildJobReport({
        mode: "lite",
        platform: { os: "windows-latest", name: "windows" },
        version: "0.1.6",
        git: { sha: "abc123" },
        checks: [{ name: "package", outcome: "skipped" }],
      }),
    ],
    {
      unchainAnalysis: {
        status: "analysis_unavailable",
        reason: "missing_api_key",
        recommendation: "NEEDS-HUMAN-TEST",
      },
    },
  );

  assert.equal(merged.schema_version, 1);
  assert.equal(merged.deterministic_result.status, "passed");
  assert.equal(merged.platforms.length, 2);
  assert.equal(merged.unchain_analysis.status, "analysis_unavailable");
});

test("renderMarkdown includes result, checks, artifacts, and manual release QA", () => {
  const report = mergeReports([
    buildJobReport({
      mode: "release",
      platform: { os: "macos-latest", name: "mac-arm64" },
      version: "0.1.6",
      checks: [{ name: "package", outcome: "success" }],
      artifacts: [{ name: "PuPu-0.1.6-arm64.dmg", path: "dist/PuPu-0.1.6-arm64.dmg" }],
    }),
  ]);

  const markdown = renderMarkdown(report);
  assert.match(markdown, /PuPu Release QA Report/);
  assert.match(markdown, /Deterministic result: PASS/);
  assert.match(markdown, /PuPu-0\.1\.6-arm64\.dmg/);
  assert.match(markdown, /macOS Gatekeeper\/notarization/);
});

test("unchain analyst exits zero and writes unavailable analysis without credentials", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-release-qa-"));
  const reportPath = path.join(dir, "report.json");
  const outPath = path.join(dir, "analysis.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      mergeReports([
        buildJobReport({
          mode: "lite",
          platform: { os: "ubuntu-latest", name: "deterministic" },
          version: "0.1.6",
          checks: [{ name: "frontend", outcome: "success" }],
        }),
      ]),
      null,
      2,
    ),
  );

  const result = spawnSync(
    "python3",
    ["scripts/release-qa/unchain-qa-analyst.py", "--report", reportPath, "--out", outPath],
    {
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        UNCHAIN_API_KEY: "",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const analysis = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(analysis.status, "analysis_unavailable");
  assert.equal(analysis.recommendation, "NEEDS-HUMAN-TEST");
});
