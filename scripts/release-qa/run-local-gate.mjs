#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildJobReport,
  mergeReports,
  renderMarkdown,
  writeJson,
  writeText,
} from "./reporting.mjs";
import { buildLocalGateChecks } from "./local-gate-checks.mjs";
import { computeWorktreeFingerprint } from "./worktree-fingerprint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_DIR = path.join(ROOT, ".release-qa", "local");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);

const siblingUnchain = path.resolve(ROOT, "..", "unchain", "src");
const pythonPath = process.env.PYTHONPATH ||
  (fs.existsSync(siblingUnchain) ? siblingUnchain : "");

const checks = buildLocalGateChecks({
  root: ROOT,
  python: PYTHON,
  pythonPath,
  version: packageJson.version,
});

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const initialHead = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout?.trim();
const initialWorktreeFingerprint = computeWorktreeFingerprint(ROOT);

const results = [];
for (const check of checks) {
  console.log(`\n[release-qa] ${check.name}`);
  console.log(`[release-qa] $ ${check.command}`);
  const startedAt = Date.now();
  const result = spawnSync(check.command, {
    cwd: check.cwd,
    env: { ...process.env, ...(check.env || {}) },
    shell: true,
    stdio: "inherit",
  });
  const durationMs = Date.now() - startedAt;
  const passed = result.status === 0 && !result.error;
  results.push({
    name: check.name,
    command: check.command,
    outcome: passed ? "success" : "failure",
    details: `${durationMs}ms${result.error ? `; ${result.error.message}` : ""}`,
  });
}

const finalHead = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout?.trim();
const finalWorktreeFingerprint = computeWorktreeFingerprint(ROOT);
const worktreeStable =
  Boolean(initialHead) &&
  initialHead === finalHead &&
  initialWorktreeFingerprint === finalWorktreeFingerprint;
results.push({
  name: "release worktree remained unchanged",
  command: "compare HEAD and full worktree fingerprint before/after deterministic QA",
  outcome: worktreeStable ? "success" : "failure",
  details: worktreeStable
    ? `fingerprint=${initialWorktreeFingerprint}`
    : "HEAD or tracked/untracked worktree content changed during deterministic QA",
});

const jobReport = buildJobReport({
  mode: "release",
  version: packageJson.version,
  platform: {
    name: `local-${process.platform}-${process.arch}`,
    os: os.platform(),
    arch: os.arch(),
    command: "npm run qa:release:deterministic",
  },
  git: {
    sha: initialHead,
    ref: "local",
    worktree_fingerprint: initialWorktreeFingerprint,
  },
  checks: results,
  artifacts: [
    { name: "Playwright HTML report", path: "playwright-report/index.html" },
    { name: "Playwright JSON report", path: "test-results/playwright/results.json" },
  ].filter((artifact) => fs.existsSync(path.join(ROOT, artifact.path))),
});
const merged = mergeReports([jobReport]);

writeJson(path.join(OUTPUT_DIR, "release-qa-job-report.json"), jobReport);
writeJson(path.join(OUTPUT_DIR, "release-qa-report.json"), merged);
writeText(path.join(OUTPUT_DIR, "release-qa-report.md"), renderMarkdown(merged));

console.log(`\n[release-qa] report: ${path.relative(ROOT, OUTPUT_DIR)}/release-qa-report.md`);
if (merged.deterministic_result.status === "failed") {
  console.error("[release-qa] deterministic release gate failed");
  process.exit(1);
}

console.log("[release-qa] deterministic release gate passed");
