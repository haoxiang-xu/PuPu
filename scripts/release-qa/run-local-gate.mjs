#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildJobReport,
  CONTEXT_V2_REQUIRED_CHECKS,
  mergeReports,
  renderMarkdown,
  writeJson,
  writeText,
} from "./reporting.mjs";
import { buildLocalGateChecks } from "./local-gate-checks.mjs";
import {
  verifyWheelRuntimeManifest,
} from "./unchain-artifact.mjs";
import { computeWorktreeFingerprint } from "./worktree-fingerprint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_DIR = path.join(ROOT, ".release-qa", "local");
const venvPython = process.platform === "win32"
  ? path.join(ROOT, ".venv", "Scripts", "python.exe")
  : path.join(ROOT, ".venv", "bin", "python");
const PYTHON = process.env.PYTHON ||
  (fs.existsSync(venvPython)
    ? venvPython
    : process.platform === "win32" ? "python" : "python3");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const initialHead = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout?.trim();
const initialWorktreeFingerprint = computeWorktreeFingerprint(ROOT);
const unchainArtifactPath = path.resolve(process.env.UNCHAIN_ARTIFACT_PATH || "");
const unchainArtifactEvidencePath = path.resolve(
  process.env.UNCHAIN_ARTIFACT_EVIDENCE_PATH || "",
);
const unchainTestSourcePath = path.resolve(
  process.env.UNCHAIN_TEST_SOURCE_PATH || "",
);
let artifactEvidence = null;
let artifactFailure = "";
try {
  artifactEvidence = verifyWheelRuntimeManifest({
    artifactPath: unchainArtifactPath,
    evidencePath: unchainArtifactEvidencePath,
    python: PYTHON,
  });
  if (!fs.existsSync(path.join(unchainTestSourcePath, "tests"))) {
    throw new Error("UNCHAIN_TEST_SOURCE_PATH must contain Unchain tests");
  }
} catch (error) {
  artifactFailure = error.message;
}
const checks = artifactEvidence
  ? buildLocalGateChecks({
      root: ROOT,
      python: PYTHON,
      pythonPath: unchainArtifactPath,
      unchainArtifactPath,
      unchainArtifactEvidencePath,
      unchainTestSourcePath,
      version: packageJson.version,
    })
  : [];

const results = [
  {
    name: "Unchain artifact continuity",
    command: "verify immutable wheel bytes and runtime manifest evidence",
    outcome: artifactEvidence ? "success" : "failure",
    details: artifactFailure || artifactEvidence?.artifact.sha256 || "",
    executed_tests: artifactEvidence ? 2 : 0,
  },
  {
    name: "Unchain runtime protocol manifest",
    command: "import protocol manifest from immutable wheel",
    outcome: artifactEvidence ? "success" : "failure",
    details: artifactFailure || artifactEvidence?.runtime_manifest.manifest_digest || "",
    executed_tests: artifactEvidence ? 2 : 0,
  },
];
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
    executed_tests: passed && [
      "Context V2 boundary contracts",
      "RunBundle v1 boundary contracts",
    ].includes(check.name) ? 1 : undefined,
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
  unchain: {
    artifact_name: artifactEvidence?.artifact.name,
    artifact_sha256: artifactEvidence?.artifact.sha256,
    artifact_size_bytes: artifactEvidence?.artifact.size_bytes,
    runtime_manifest_digest: artifactEvidence?.runtime_manifest.manifest_digest,
    runtime_manifest: artifactEvidence?.runtime_manifest,
    source_repository: artifactEvidence?.source.repository,
    source_ref: artifactEvidence?.source.ref,
    source_revision: artifactEvidence?.source.revision,
    source_dirty: artifactEvidence?.source.dirty,
  },
  requiredChecks: CONTEXT_V2_REQUIRED_CHECKS,
  checks: results,
  artifacts: [
    { name: "Playwright HTML report", path: "playwright-report/index.html" },
    { name: "Playwright JSON report", path: "test-results/playwright/results.json" },
  ].filter((artifact) => fs.existsSync(path.join(ROOT, artifact.path))),
});
// This local gate validates source, runtime boundary and Electron behavior; it
// intentionally does not build the four hosted installers. Keep the report in
// release mode while opting out only of the hosted package-matrix requirement.
const merged = mergeReports([jobReport], { requirePackageReports: false });

writeJson(path.join(OUTPUT_DIR, "release-qa-job-report.json"), jobReport);
writeJson(path.join(OUTPUT_DIR, "release-qa-report.json"), merged);
writeText(path.join(OUTPUT_DIR, "release-qa-report.md"), renderMarkdown(merged));

console.log(`\n[release-qa] report: ${path.relative(ROOT, OUTPUT_DIR)}/release-qa-report.md`);
if (merged.deterministic_result.status === "failed") {
  console.error("[release-qa] deterministic release gate failed");
  process.exit(1);
}

console.log("[release-qa] deterministic release gate passed");
