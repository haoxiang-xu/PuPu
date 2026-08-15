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
  PACKAGE_REQUIRED_CHECKS,
  renderMarkdown,
} from "./reporting.mjs";
import {
  computeRuntimeManifestDigest,
  REQUIRED_RUNTIME_PROTOCOLS,
} from "./unchain-artifact.mjs";

const manifestBody = {
  schema: "unchain.runtime_protocol_manifest.v1",
  runtime: "unchain",
  protocols: Object.entries(REQUIRED_RUNTIME_PROTOCOLS).map(([id, features]) => ({
    id,
    major: 1,
    minor: 0,
    features: [...features],
  })),
};
const runtimeManifest = {
  ...manifestBody,
  manifest_digest: computeRuntimeManifestDigest(manifestBody),
};
const unchainEvidence = (overrides = {}) => ({
  artifact_name: "unchain-1.2.3-py3-none-any.whl",
  artifact_sha256: `sha256:${"a".repeat(64)}`,
  artifact_size_bytes: 12345,
  runtime_manifest_digest: runtimeManifest.manifest_digest,
  runtime_manifest: runtimeManifest,
  source_repository: "haoxiang-xu/unchain",
  source_ref: "dev",
  source_revision: "b".repeat(40),
  source_dirty: false,
  ...overrides,
});
const deterministicChecks = (overrides = {}) =>
  DETERMINISTIC_REQUIRED_CHECKS.map((name) => ({
    name,
    outcome: overrides[name] || "success",
    executed_tests: name === "Quorum boundary protocol" ? undefined : 1,
  }));
const packageReport = (platform, { unchain = unchainEvidence(), smoke = 4 } = {}) =>
  buildJobReport({
    mode: "release",
    platform: { name: platform, os: platform },
    unchain,
    requiredChecks: PACKAGE_REQUIRED_CHECKS,
    checks: [
      {
        name: "Unchain artifact continuity",
        outcome: "success",
        executed_tests: 2,
      },
      {
        name: "packaged sidecar protocol smoke",
        outcome: "success",
        executed_tests: smoke,
      },
      { name: "unsigned package build", outcome: "success" },
    ],
  });

test("buildJobReport records failures, version mismatch, and artifact evidence", () => {
  const report = buildJobReport({
    mode: "release",
    platform: { name: "linux", os: "linux" },
    version: "0.1.8",
    expectedVersion: "0.1.9",
    unchain: unchainEvidence(),
    checks: [
      { name: "frontend", outcome: "success" },
      { name: "package", outcome: "failure" },
    ],
  });
  assert.equal(report.schema_version, 2);
  assert.equal(report.deterministic_result.status, "failed");
  assert.equal(report.checks.at(-1).name, "version matches expected release");
  assert.equal(report.unchain.artifact_sha256, unchainEvidence().artifact_sha256);
  assert.equal(report.unchain.locked_sha, undefined);
  assert.equal(report.unchain.tested_sha, undefined);
});

test("artifact, manifest, provenance, and nonzero evidence are all blocking", () => {
  const cases = [
    unchainEvidence({ artifact_sha256: "" }),
    unchainEvidence({ runtime_manifest_digest: `sha256:${"0".repeat(64)}` }),
    unchainEvidence({ source_revision: "unknown" }),
    unchainEvidence({ source_dirty: true }),
  ];
  for (const unchain of cases) {
    const report = buildJobReport({
      platform: { name: "deterministic" },
      unchain,
      checks: deterministicChecks(),
    });
    assert.equal(report.deterministic_result.status, "failed");
    assert.equal(
      report.checks.find((check) => check.name === "Unchain artifact continuity")
        .status,
      "failed",
    );
  }

  const zero = buildJobReport({
    platform: { name: "deterministic" },
    unchain: unchainEvidence(),
    checks: deterministicChecks({ "Context V2 boundary contracts": "success" })
      .map((check) => check.name === "Context V2 boundary contracts"
        ? { ...check, executed_tests: 0 }
        : check),
  });
  assert.equal(zero.deterministic_result.status, "failed");
  assert.match(
    zero.checks.find((check) => check.name === "Context V2 boundary contracts")
      .details,
    /zero or missing execution evidence/,
  );
});

test("lite merge passes with one deterministic artifact and required matrices", () => {
  const merged = mergeReports([
    buildJobReport({
      mode: "lite",
      platform: { name: "deterministic", os: "linux" },
      version: "0.1.9",
      unchain: unchainEvidence(),
      checks: deterministicChecks(),
    }),
  ]);
  assert.equal(merged.deterministic_result.status, "passed");
  assert.equal(merged.unchain.artifact_sha256, unchainEvidence().artifact_sha256);
});

test("release merge requires all package platforms, identical bytes, and real smoke", () => {
  const deterministic = buildJobReport({
    mode: "release",
    platform: { name: "deterministic", os: "linux" },
    version: "0.1.9",
    unchain: unchainEvidence(),
    checks: deterministicChecks(),
  });
  const missing = mergeReports([deterministic, packageReport("linux")]);
  assert.equal(missing.deterministic_result.status, "failed");
  assert.match(
    missing.checks.find((check) => check.name === "package report mac-arm64")
      .details,
    /missing/,
  );

  const complete = mergeReports([
    deterministic,
    ...["mac-arm64", "mac-intel", "windows", "linux"].map(packageReport),
  ]);
  assert.equal(complete.deterministic_result.status, "passed");

  const mismatched = mergeReports([
    deterministic,
    packageReport("mac-arm64"),
    packageReport("mac-intel"),
    packageReport("windows", {
      unchain: unchainEvidence({ artifact_sha256: `sha256:${"c".repeat(64)}` }),
    }),
    packageReport("linux", { smoke: 0 }),
  ]);
  assert.equal(mismatched.deterministic_result.status, "failed");
  assert.equal(
    mismatched.checks.find((check) => check.name === "artifact continuity windows")
      .status,
    "failed",
  );
  assert.equal(
    mismatched.checks.find(
      (check) => check.name === "packaged sidecar protocol smoke linux",
    ).status,
    "failed",
  );
});

test("a merge with only non-deterministic reports is INCOMPLETE", () => {
  const merged = mergeReports([
    buildJobReport({
      platform: { name: "playwright-linux", os: "linux" },
      checks: [{ name: "Playwright", outcome: "success" }],
    }),
  ]);
  assert.equal(merged.deterministic_result.status, "failed");
  assert.match(
    merged.checks.find((check) => check.name === "deterministic QA report present")
      .details,
    /missing/,
  );
});

test("renderMarkdown reports artifact continuity, not a compatibility SHA lock", () => {
  const report = mergeReports([
    buildJobReport({
      mode: "lite",
      platform: { name: "deterministic", os: "linux" },
      version: "0.1.9",
      unchain: unchainEvidence(),
      checks: deterministicChecks(),
    }),
  ]);
  const markdown = renderMarkdown(report);
  assert.match(markdown, /Unchain artifact SHA-256/);
  assert.match(markdown, /Runtime manifest digest/);
  assert.match(markdown, /source revision \(telemetry\)/);
  assert.doesNotMatch(markdown, /locked SHA|tested SHA|exact_sha|dev_bypass/);
});

test("unchain analyst exits zero and writes unavailable analysis without credentials", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-release-qa-"));
  const reportPath = path.join(dir, "report.json");
  const outPath = path.join(dir, "analysis.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(mergeReports([
      buildJobReport({
        mode: "lite",
        platform: { name: "deterministic", os: "linux" },
        unchain: unchainEvidence(),
        checks: deterministicChecks(),
      }),
    ])),
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
  assert.equal(JSON.parse(fs.readFileSync(outPath, "utf8")).status, "analysis_unavailable");
  fs.rmSync(dir, { recursive: true, force: true });
});
