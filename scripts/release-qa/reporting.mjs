import fs from "node:fs";
import path from "node:path";

import { validateRuntimeManifestForRelease } from "./unchain-artifact.mjs";

export const REPORT_SCHEMA_VERSION = 2;
export const CONTEXT_V2_REQUIRED_CHECKS = Object.freeze([
  "Quorum boundary protocol",
  "Unchain artifact continuity",
  "Unchain runtime protocol manifest",
  "Context V2 boundary contracts",
]);
export const RUN_BUNDLE_REQUIRED_CHECKS = Object.freeze([
  "RunBundle v1 boundary contracts",
]);
export const DETERMINISTIC_REQUIRED_CHECKS = Object.freeze([
  ...CONTEXT_V2_REQUIRED_CHECKS,
  ...RUN_BUNDLE_REQUIRED_CHECKS,
]);
export const PACKAGE_REQUIRED_CHECKS = Object.freeze([
  "Unchain artifact continuity",
  "packaged sidecar protocol smoke",
]);

const PASS_STATUSES = new Set(["pass", "passed", "success", "successful", "ok"]);
const FAIL_STATUSES = new Set(["fail", "failed", "failure", "error", "timed_out", "timed-out"]);
const SKIP_STATUSES = new Set(["skip", "skipped", "neutral"]);
const CANCEL_STATUSES = new Set(["cancel", "cancelled", "canceled"]);

const MANUAL_RELEASE_QA = [
  "macOS Gatekeeper/notarization",
  "Windows installer launch",
  "Linux AppImage/deb install",
  "Ollama real local-model path",
  "API-key provider smoke",
  "workspace attach with real folders",
];

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const NONZERO_EVIDENCE_CHECKS = new Set([
  "Unchain artifact continuity",
  "Unchain runtime protocol manifest",
  "Context V2 boundary contracts",
  "RunBundle v1 boundary contracts",
  "packaged sidecar protocol smoke",
]);
const RELEASE_PACKAGE_PLATFORMS = Object.freeze([
  "mac-arm64",
  "mac-intel",
  "windows",
  "linux",
]);

export function normalizeStatus(value) {
  const normalized = cleanString(value).toLowerCase();
  if (PASS_STATUSES.has(normalized)) return "passed";
  if (FAIL_STATUSES.has(normalized)) return "failed";
  if (SKIP_STATUSES.has(normalized)) return "skipped";
  if (CANCEL_STATUSES.has(normalized)) return "cancelled";
  return normalized ? "failed" : "skipped";
}

function normalizeCheck(check) {
  const raw = check && typeof check === "object" ? check : {};
  const status = normalizeStatus(raw.status || raw.outcome || raw.conclusion);
  return {
    name: cleanString(raw.name) || "unnamed check",
    command: cleanString(raw.command),
    status,
    outcome: cleanString(raw.outcome || raw.conclusion || status) || status,
    details: cleanString(raw.details),
    executed_tests: Number.isSafeInteger(raw.executed_tests) &&
        raw.executed_tests >= 0
      ? raw.executed_tests
      : undefined,
  };
}

function normalizeArtifact(artifact) {
  if (typeof artifact === "string") {
    return {
      name: path.basename(artifact),
      path: artifact,
    };
  }
  const raw = artifact && typeof artifact === "object" ? artifact : {};
  const artifactPath = cleanString(raw.path);
  return {
    name: cleanString(raw.name) || path.basename(artifactPath),
    path: artifactPath,
    size_bytes: Number.isFinite(raw.size_bytes) ? raw.size_bytes : undefined,
    sha256: cleanString(raw.sha256) || undefined,
  };
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .map(([key, inner]) => [key, removeUndefined(inner)]),
  );
}

function buildDeterministicResult(checks) {
  const failedChecks = checks.filter((check) =>
    check.status === "failed" || check.status === "cancelled"
  );
  return {
    status: failedChecks.length > 0 ? "failed" : "passed",
    failed_count: failedChecks.length,
    failed_checks: failedChecks.map((check) => check.name),
  };
}

const normalizeUnchain = (unchain) => {
  const raw = unchain && typeof unchain === "object" ? unchain : {};
  return {
    artifact_name: cleanString(raw.artifact_name),
    artifact_sha256: cleanString(raw.artifact_sha256),
    artifact_size_bytes: Number.isSafeInteger(raw.artifact_size_bytes) &&
        raw.artifact_size_bytes > 0
      ? raw.artifact_size_bytes
      : undefined,
    runtime_manifest_digest: cleanString(raw.runtime_manifest_digest),
    runtime_manifest: raw.runtime_manifest &&
        typeof raw.runtime_manifest === "object" &&
        !Array.isArray(raw.runtime_manifest)
      ? raw.runtime_manifest
      : undefined,
    source_repository: cleanString(raw.source_repository),
    source_ref: cleanString(raw.source_ref),
    source_revision: cleanString(raw.source_revision),
    source_dirty: typeof raw.source_dirty === "boolean"
      ? raw.source_dirty
      : undefined,
  };
};

const unchainEvidenceFailures = (unchain) => {
  const failures = [];
  if (!cleanString(unchain.artifact_name).endsWith(".whl")) {
    failures.push("artifact wheel name is missing");
  }
  if (!SHA256_PATTERN.test(cleanString(unchain.artifact_sha256))) {
    failures.push("artifact SHA-256 is missing or invalid");
  }
  if (!Number.isSafeInteger(unchain.artifact_size_bytes) || unchain.artifact_size_bytes <= 0) {
    failures.push("artifact size is missing or invalid");
  }
  if (!SHA256_PATTERN.test(cleanString(unchain.runtime_manifest_digest))) {
    failures.push("runtime manifest digest is missing or invalid");
  }
  try {
    validateRuntimeManifestForRelease(unchain.runtime_manifest);
    if (
      unchain.runtime_manifest.manifest_digest !==
      unchain.runtime_manifest_digest
    ) {
      failures.push("runtime manifest digest fields differ");
    }
  } catch (error) {
    failures.push(`runtime manifest is invalid: ${error.message}`);
  }
  if (!cleanString(unchain.source_repository)) {
    failures.push("source repository telemetry is missing");
  }
  if (!cleanString(unchain.source_ref)) {
    failures.push("source ref telemetry is missing");
  }
  if (!GIT_SHA_PATTERN.test(cleanString(unchain.source_revision))) {
    failures.push("source revision telemetry is missing or invalid");
  }
  if (unchain.source_dirty !== false) {
    failures.push(
      unchain.source_dirty === true
        ? "selected source provenance is dirty"
        : "selected source provenance cleanliness is unknown",
    );
  }
  return failures;
};

function enforceRequiredChecks(checks, requiredChecks, unchain) {
  const normalizedRequired = [...new Set(
    (requiredChecks || []).map(cleanString).filter(Boolean),
  )];
  const effectiveRequired = normalizedRequired;
  const enforced = checks.map((check) => ({ ...check }));

  for (const requiredName of effectiveRequired) {
    const index = enforced.findIndex((check) => check.name === requiredName);
    if (index === -1) {
      enforced.push(normalizeCheck({
        name: requiredName,
        outcome: "failure",
        details: "required check is missing (INCOMPLETE)",
      }));
      continue;
    }
    if (enforced[index].status !== "passed") {
      const reportedStatus = enforced[index].status || "missing";
      enforced[index] = {
        ...enforced[index],
        status: "failed",
        outcome: "failure",
        details: [
          enforced[index].details,
          `required check reported ${reportedStatus} (INCOMPLETE)`,
        ].filter(Boolean).join("; "),
      };
    }
    if (
      NONZERO_EVIDENCE_CHECKS.has(requiredName) &&
      !(enforced[index].executed_tests > 0)
    ) {
      enforced[index] = {
        ...enforced[index],
        status: "failed",
        outcome: "failure",
        details: [
          enforced[index].details,
          "required check has zero or missing execution evidence (INCOMPLETE)",
        ].filter(Boolean).join("; "),
      };
    }
  }

  if (effectiveRequired.includes("Unchain artifact continuity")) {
    const evidenceFailures = unchainEvidenceFailures(unchain);
    if (evidenceFailures.length > 0) {
      const index = enforced.findIndex(
        (check) => check.name === "Unchain artifact continuity",
      );
      enforced[index] = {
        ...enforced[index],
        status: "failed",
        outcome: "failure",
        details: [
          enforced[index].details,
          `required evidence invalid: ${evidenceFailures.join(", ")}`,
        ].filter(Boolean).join("; "),
      };
    }
  }

  return enforced;
}

export function buildJobReport({
  mode = "lite",
  platform = {},
  version = "",
  expectedVersion = "",
  git = {},
  unchain = {},
  requiredChecks = [],
  checks = [],
  artifacts = [],
} = {}) {
  let normalizedChecks = checks.map(normalizeCheck);
  const cleanVersion = cleanString(version);
  const cleanExpected = cleanString(expectedVersion);
  const normalizedUnchain = normalizeUnchain(unchain);

  if (cleanExpected) {
    normalizedChecks.push(
      normalizeCheck({
        name: "version matches expected release",
        command: "compare package version to release tag",
        outcome: cleanVersion === cleanExpected ? "success" : "failure",
        details:
          cleanVersion === cleanExpected
            ? `version=${cleanVersion}`
            : `version=${cleanVersion || "(missing)"}, expected=${cleanExpected}`,
      }),
    );
  }

  const platformName = cleanString(platform.name) || cleanString(platform.os);
  normalizedChecks = enforceRequiredChecks(
    normalizedChecks,
    platformName === "deterministic"
      ? [...requiredChecks, ...DETERMINISTIC_REQUIRED_CHECKS]
      : requiredChecks,
    normalizedUnchain,
  );

  const normalizedArtifacts = artifacts
    .map(normalizeArtifact)
    .filter((artifact) => artifact.path);

  return removeUndefined({
    schema_version: REPORT_SCHEMA_VERSION,
    kind: "job_report",
    mode: cleanString(mode) || "lite",
    version: cleanVersion,
    expected_version: cleanExpected || undefined,
    git: {
      sha: cleanString(git.sha),
      ref: cleanString(git.ref),
      ref_name: cleanString(git.ref_name),
      head_ref: cleanString(git.head_ref),
      base_ref: cleanString(git.base_ref),
      run_id: cleanString(git.run_id),
      worktree_fingerprint: cleanString(git.worktree_fingerprint),
    },
    unchain: normalizedUnchain,
    platform: {
      name: cleanString(platform.name) || cleanString(platform.os) || "unknown",
      os: cleanString(platform.os) || cleanString(platform.name) || "unknown",
      arch: cleanString(platform.arch),
      command: cleanString(platform.command),
    },
    checks: normalizedChecks,
    artifacts: normalizedArtifacts,
    deterministic_result: buildDeterministicResult(normalizedChecks),
  });
}

export function mergeReports(reports, { unchainAnalysis } = {}) {
  const normalizedReports = Array.isArray(reports)
    ? reports.filter((report) => report && typeof report === "object")
    : [];
  const checks = normalizedReports.flatMap((report) =>
    (report.checks || []).map((check) => ({
      ...check,
      platform: report.platform?.name || report.platform?.os || "unknown",
    }))
  );
  const artifacts = normalizedReports.flatMap((report) =>
    (report.artifacts || []).map((artifact) => ({
      ...artifact,
      platform: report.platform?.name || report.platform?.os || "unknown",
    }))
  );
  const platforms = normalizedReports.map((report) => ({
    ...report.platform,
    deterministic_result: report.deterministic_result,
  }));
  const firstReport = normalizedReports[0] || {};
  const deterministicReport = normalizedReports.find(
    (report) => report.platform?.name === "deterministic",
  );
  const unchain = normalizeUnchain(deterministicReport?.unchain || {});
  const mode = normalizedReports.some((report) => report.mode === "release")
    ? "release"
    : cleanString(firstReport.mode) || "lite";
  const deterministicReports = normalizedReports.filter((report) => {
    const checkNames = new Set(
      (report.checks || []).map((check) => cleanString(check.name)),
    );
    return report.platform?.name === "deterministic" ||
      DETERMINISTIC_REQUIRED_CHECKS.every((name) => checkNames.has(name));
  });

  const requiresDeterministicContractGate = deterministicReports.length > 0 ||
    normalizedReports.some((report) =>
    (report.checks || []).some((check) =>
      DETERMINISTIC_REQUIRED_CHECKS.includes(check.name)
    )
  );
  if (deterministicReports.length === 0) {
    checks.push(normalizeCheck({
      name: "deterministic QA report present",
      outcome: "failure",
      details: "deterministic job report is missing (INCOMPLETE)",
    }));
  }
  if (mode === "release") {
    for (const platformName of RELEASE_PACKAGE_PLATFORMS) {
      const report = normalizedReports.find(
        (candidate) => candidate.platform?.name === platformName,
      );
      if (!report) {
        checks.push(normalizeCheck({
          name: `package report ${platformName}`,
          outcome: "failure",
          details: "required package report is missing (INCOMPLETE)",
        }));
        continue;
      }
      const packageUnchain = normalizeUnchain(report.unchain);
      const continuityMatches = [
        "artifact_sha256",
        "runtime_manifest_digest",
        "source_revision",
      ].every((field) => packageUnchain[field] === unchain[field]);
      checks.push(normalizeCheck({
        name: `artifact continuity ${platformName}`,
        outcome: continuityMatches ? "success" : "failure",
        details: continuityMatches
          ? unchain.artifact_sha256
          : "package did not consume the deterministic artifact bytes",
        executed_tests: 1,
      }));
      const smoke = (report.checks || []).find(
        (check) => check.name === "packaged sidecar protocol smoke",
      );
      if (normalizeStatus(smoke?.status || smoke?.outcome) !== "passed" ||
          !(smoke?.executed_tests > 0)) {
        checks.push(normalizeCheck({
          name: `packaged sidecar protocol smoke ${platformName}`,
          outcome: "failure",
          details: "real authenticated packaged smoke is missing or executed zero checks",
        }));
      }
    }
  }
  const enforcedChecks = enforceRequiredChecks(
    checks,
    requiresDeterministicContractGate ? DETERMINISTIC_REQUIRED_CHECKS : [],
    unchain,
  );

  return removeUndefined({
    schema_version: REPORT_SCHEMA_VERSION,
    kind: "merged_report",
    mode,
    version: cleanString(firstReport.version),
    git: firstReport.git || {},
    unchain,
    platforms,
    checks: enforcedChecks,
    artifacts,
    deterministic_result: buildDeterministicResult(enforcedChecks),
    unchain_analysis: unchainAnalysis || {
      status: "not_run",
      recommendation: "NEEDS-HUMAN-TEST",
    },
    manual_release_qa: MANUAL_RELEASE_QA,
  });
}

function statusLabel(status) {
  if (status === "passed") return "PASS";
  if (status === "failed") return "FAIL";
  if (status === "cancelled") return "CANCELLED";
  return "SKIPPED";
}

export function renderMarkdown(report) {
  const deterministicStatus = report?.deterministic_result?.status || "failed";
  const lines = [
    "# PuPu Release QA Report",
    "",
    `- Mode: ${report.mode || "lite"}`,
    `- Version: ${report.version || "(unknown)"}`,
    `- Deterministic result: ${statusLabel(deterministicStatus)}`,
    `- Unchain artifact SHA-256: ${report.unchain?.artifact_sha256 || "(unknown)"}`,
    `- Runtime manifest digest: ${report.unchain?.runtime_manifest_digest || "(unknown)"}`,
    `- Unchain source ref: ${report.unchain?.source_ref || "(unknown)"}`,
    `- Unchain source revision (telemetry): ${report.unchain?.source_revision || "(unknown)"}`,
    `- Unchain source dirty: ${String(report.unchain?.source_dirty ?? "unknown")}`,
    `- Unchain analysis: ${report.unchain_analysis?.status || "not_run"}`,
    "",
    "## Checks",
    "",
    "| Platform | Check | Status | Command | Details |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const check of report.checks || []) {
    lines.push(
      `| ${check.platform || "unknown"} | ${check.name || ""} | ${statusLabel(check.status)} | ${check.command || ""} | ${check.details || ""} |`,
    );
  }

  lines.push("", "## Artifacts", "");
  if ((report.artifacts || []).length === 0) {
    lines.push("No package artifacts were recorded.");
  } else {
    for (const artifact of report.artifacts) {
      lines.push(`- ${artifact.platform || "unknown"}: ${artifact.name || artifact.path}`);
    }
  }

  lines.push("", "## Unchain Advisory", "");
  const analysis = report.unchain_analysis || {};
  lines.push(`- Status: ${analysis.status || "not_run"}`);
  lines.push(`- Recommendation: ${analysis.recommendation || "NEEDS-HUMAN-TEST"}`);
  if (analysis.reason) lines.push(`- Reason: ${analysis.reason}`);
  if (analysis.summary) lines.push(`- Summary: ${analysis.summary}`);

  lines.push("", "## Manual Release QA Still Required", "");
  for (const item of report.manual_release_qa || MANUAL_RELEASE_QA) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

export function readPackageVersion(rootDir = process.cwd()) {
  const packageJson = readJson(path.join(rootDir, "package.json"));
  return cleanString(packageJson.version);
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const stat = fs.statSync(rootDir);
  if (stat.isFile()) return [rootDir];
  const result = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

export function collectArtifacts(patterns, rootDir = process.cwd()) {
  const result = [];
  for (const rawPattern of patterns || []) {
    const pattern = cleanString(rawPattern);
    if (!pattern) continue;
    const recursiveSuffix = pattern.endsWith("/**/*");
    const relativeBase = recursiveSuffix ? pattern.slice(0, -"**/*".length) : pattern;
    const absoluteBase = path.resolve(rootDir, relativeBase);
    const files = recursiveSuffix ? listFilesRecursive(absoluteBase) : listFilesRecursive(absoluteBase);
    for (const filePath of files) {
      const stat = fs.statSync(filePath);
      result.push({
        name: path.basename(filePath),
        path: path.relative(rootDir, filePath),
        size_bytes: stat.size,
      });
    }
  }
  return result;
}

export function findJobReports(inputDir) {
  return listFilesRecursive(inputDir).filter((filePath) =>
    path.basename(filePath) === "release-qa-job-report.json"
  );
}
