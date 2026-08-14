import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildJobReport,
  DETERMINISTIC_REQUIRED_CHECKS,
  mergeReports,
  renderMarkdown,
} from "./reporting.mjs";

test("buildJobReport records deterministic failures and version mismatch", () => {
  const report = buildJobReport({
    mode: "release",
    platform: { os: "linux", name: "linux" },
    version: "0.1.6",
    expectedVersion: "0.1.7",
    git: {
      sha: "abc123",
      ref: "refs/tags/v0.1.7",
      worktree_fingerprint: "fingerprint-123",
    },
    unchain: {
      source_path: "/checkout/unchain",
      locked_sha: "a".repeat(40),
      tested_sha: "a".repeat(40),
      dirty: false,
    },
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
  assert.equal(report.git.worktree_fingerprint, "fingerprint-123");
  assert.deepEqual(report.unchain, {
    source_path: "/checkout/unchain",
    locked_sha: "a".repeat(40),
    tested_sha: "a".repeat(40),
    dirty: false,
  });
});

test("mergeReports merges platforms and marks advisory Unchain analysis as non-blocking", () => {
  const merged = mergeReports(
    [
      buildJobReport({
        mode: "lite",
        platform: { os: "ubuntu-latest", name: "deterministic" },
        version: "0.1.6",
        git: { sha: "abc123" },
        checks: [
          { name: "frontend", outcome: "success" },
          { name: "Quorum boundary protocol", outcome: "success" },
          { name: "pinned Unchain checkout", outcome: "success" },
          { name: "Context V2 boundary contracts", outcome: "success" },
          { name: "RunBundle v1 boundary contracts", outcome: "success" },
        ],
        unchain: {
          locked_sha: "c".repeat(40),
          tested_sha: "c".repeat(40),
          dirty: false,
        },
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
  assert.deepEqual(merged.unchain, {
    source_path: "",
    locked_sha: "c".repeat(40),
    tested_sha: "c".repeat(40),
    dirty: false,
  });
  assert.equal(merged.unchain_analysis.status, "analysis_unavailable");
});

test("required boundary checks treat skipped and neutral as INCOMPLETE failures", () => {
  for (const requiredName of DETERMINISTIC_REQUIRED_CHECKS) {
    for (const outcome of ["skipped", "neutral"]) {
      const report = buildJobReport({
        platform: { name: "local-contract" },
        requiredChecks: DETERMINISTIC_REQUIRED_CHECKS,
        unchain: {
          locked_sha: "d".repeat(40),
          tested_sha: "d".repeat(40),
          dirty: false,
        },
        checks: DETERMINISTIC_REQUIRED_CHECKS.map((name) => ({
          name,
          outcome: name === requiredName ? outcome : "success",
        })),
      });

      assert.equal(report.deterministic_result.status, "failed");
      const required = report.checks.find(
        (check) => check.name === requiredName,
      );
      assert.equal(required.status, "failed");
      assert.match(required.details, /INCOMPLETE/);
    }
  }
});

test("a missing required boundary check cannot produce PASS", () => {
  const report = buildJobReport({
    platform: { name: "local-contract" },
    requiredChecks: DETERMINISTIC_REQUIRED_CHECKS,
    unchain: {
      locked_sha: "e".repeat(40),
      tested_sha: "e".repeat(40),
      dirty: false,
    },
    checks: [{ name: "pinned Unchain checkout", outcome: "success" }],
  });

  assert.equal(report.deterministic_result.status, "failed");
  assert.match(
    report.checks.find(
      (check) => check.name === "Context V2 boundary contracts",
    ).details,
    /missing \(INCOMPLETE\)/,
  );
});

test("missing, mismatched, unknown, or dirty pinned evidence cannot produce PASS", () => {
  const validSha = "f".repeat(40);
  const invalidEvidence = [
    { tested_sha: validSha, dirty: false },
    { locked_sha: validSha, dirty: false },
    { locked_sha: validSha, tested_sha: "a".repeat(40), dirty: false },
    { locked_sha: validSha, tested_sha: validSha },
    { locked_sha: validSha, tested_sha: validSha, dirty: true },
  ];

  for (const unchain of invalidEvidence) {
    const report = buildJobReport({
      platform: { name: "deterministic" },
      unchain,
      checks: [
        { name: "Quorum boundary protocol", outcome: "success" },
        { name: "pinned Unchain checkout", outcome: "success" },
        { name: "Context V2 boundary contracts", outcome: "success" },
        { name: "RunBundle v1 boundary contracts", outcome: "success" },
      ],
    });
    assert.equal(report.deterministic_result.status, "failed");
    assert.equal(
      report.checks.find(
        (check) => check.name === "pinned Unchain checkout",
      ).status,
      "failed",
    );
  }

  const valid = buildJobReport({
    platform: { name: "deterministic" },
    unchain: {
      locked_sha: validSha,
      tested_sha: validSha,
      dirty: false,
    },
    checks: [
      { name: "Quorum boundary protocol", outcome: "success" },
      { name: "pinned Unchain checkout", outcome: "success" },
      { name: "Context V2 boundary contracts", outcome: "success" },
      { name: "RunBundle v1 boundary contracts", outcome: "success" },
    ],
  });
  assert.equal(valid.deterministic_result.status, "passed");
});

test("merged deterministic reports revalidate pinned evidence", () => {
  const merged = mergeReports([
    {
      mode: "lite",
      version: "0.1.9",
      platform: { name: "deterministic", os: "linux" },
      unchain: {
        locked_sha: "1".repeat(40),
        tested_sha: "2".repeat(40),
        dirty: false,
      },
      checks: [
        { name: "pinned Unchain checkout", status: "passed" },
        { name: "Context V2 boundary contracts", status: "passed" },
        { name: "RunBundle v1 boundary contracts", status: "passed" },
      ],
      artifacts: [],
    },
  ]);

  assert.equal(merged.deterministic_result.status, "failed");
  assert.match(
    merged.checks.find(
      (check) => check.name === "pinned Unchain checkout",
    ).details,
    /SHAs differ/,
  );
});

test("a merge with only non-deterministic reports is INCOMPLETE", () => {
  for (const reports of [
    [
      buildJobReport({
        platform: { name: "playwright-linux", os: "linux" },
        checks: [{ name: "Playwright", outcome: "success" }],
      }),
    ],
    [
      buildJobReport({
        platform: { name: "playwright-linux", os: "linux" },
        checks: [{ name: "Playwright", outcome: "success" }],
      }),
      buildJobReport({
        platform: { name: "package-linux", os: "linux" },
        checks: [{ name: "package", outcome: "success" }],
      }),
    ],
  ]) {
    const merged = mergeReports(reports);
    assert.equal(merged.deterministic_result.status, "failed");
    assert.match(
      merged.checks.find(
        (check) => check.name === "deterministic QA report present",
      ).details,
      /missing \(INCOMPLETE\)/,
    );
  }
});

test("renderMarkdown includes result, checks, artifacts, and manual release QA", () => {
  const report = mergeReports([
    buildJobReport({
      mode: "release",
      platform: { os: "macos-latest", name: "mac-arm64" },
      version: "0.1.6",
      unchain: {
        locked_sha: "b".repeat(40),
        tested_sha: "b".repeat(40),
        dirty: false,
      },
      checks: [
        { name: "Quorum boundary protocol", outcome: "success" },
        { name: "pinned Unchain checkout", outcome: "success" },
        { name: "Context V2 boundary contracts", outcome: "success" },
        { name: "RunBundle v1 boundary contracts", outcome: "success" },
        { name: "package", outcome: "success" },
      ],
      artifacts: [{ name: "PuPu-0.1.6-arm64.dmg", path: "dist/PuPu-0.1.6-arm64.dmg" }],
    }),
  ]);

  const markdown = renderMarkdown(report);
  assert.match(markdown, /PuPu Release QA Report/);
  assert.match(markdown, /Deterministic result: PASS/);
  assert.match(markdown, new RegExp(`Unchain locked SHA: ${"b".repeat(40)}`));
  assert.match(markdown, /Unchain dirty: false/);
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
