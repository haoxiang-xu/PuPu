import fs from "node:fs";
import path from "node:path";

export const REPORT_SCHEMA_VERSION = 1;

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

export function buildJobReport({
  mode = "lite",
  platform = {},
  version = "",
  expectedVersion = "",
  git = {},
  checks = [],
  artifacts = [],
} = {}) {
  const normalizedChecks = checks.map(normalizeCheck);
  const cleanVersion = cleanString(version);
  const cleanExpected = cleanString(expectedVersion);

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
    },
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
  const mode = normalizedReports.some((report) => report.mode === "release")
    ? "release"
    : cleanString(firstReport.mode) || "lite";

  return removeUndefined({
    schema_version: REPORT_SCHEMA_VERSION,
    kind: "merged_report",
    mode,
    version: cleanString(firstReport.version),
    git: firstReport.git || {},
    platforms,
    checks,
    artifacts,
    deterministic_result: buildDeterministicResult(checks),
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
