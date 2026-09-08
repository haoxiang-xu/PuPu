import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  CELL_CATALOG,
  buildCycleSchedule,
  buildEvidence,
  emptyObserved,
  evaluateHandleGrowth,
} from "./windows-installed-sink-matrix-lib.mjs";
import {
  verifyInstalledSinkEvidence,
  verifyInstalledSinkEvidenceFiles,
} from "./verify-windows-installed-sink-evidence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = (digit) => `sha256:${digit.repeat(64)}`;

const identity = Object.freeze({
  pupu_revision: "9aeb93020e2a4f7c50736520f447241c8f997d8d",
  unchain_revision: "0680312b92d6856b2271302c23b9279a6b85c546",
  installer_sha256: hash("a"),
  installed_app_sha256: hash("b"),
  installed_asar_sha256: hash("c"),
  installed_sidecar_sha256: hash("d"),
  wheel_sha256: hash("e"),
  runtime_manifest_digest: hash("f"),
});

// The expected identity comes from the candidate build evidence Codex wrote
// (candidate-build-evidence.json shape) plus the wheel evidence.
const expectedIdentity = Object.freeze({
  pupu_revision: identity.pupu_revision,
  unchain_revision: identity.unchain_revision,
  installer_sha256: identity.installer_sha256,
  app_asar_sha256: identity.installed_asar_sha256,
  sidecar_sha256: identity.installed_sidecar_sha256,
  wheel_sha256: identity.wheel_sha256,
  runtime_manifest_digest: identity.runtime_manifest_digest,
});

const cleanSuccess = (kind) => ({
  ...emptyObserved(),
  streamStatus: "done",
  toolResult: {
    ok: true,
    denied: false,
    receipt_id: "rcpt",
    exit_category: kind === "mcp_schema_secret" ? null : "success",
    returncode: kind === "mcp_schema_secret" ? null : 0,
    error: null,
  },
  receipt: { status: "completed", outcome_code: "completed" },
  intent: { status: "completed", sink_kind: kind },
  dialog: { found: true, action: "Allow" },
  workerSpawned: true,
  survivors: 0,
  sentinelPresent: false,
  providerCalls: 2,
  mcpReceiptCount: kind === "mcp_schema_secret" ? 1 : null,
});

const denied = (kind, dialog) => ({
  ...cleanSuccess(kind),
  toolResult: { ok: false, denied: true, receipt_id: null, exit_category: null, returncode: null, error: null },
  receipt: { status: "denied", outcome_code: "vault_native_confirmation_denied" },
  intent: { status: "denied", sink_kind: kind },
  dialog,
  workerSpawned: false,
});

// A genuinely passing observation for every catalog cell, so the fixture
// exercises each cell's own semantics rather than one generic success.
const passingObservedFor = (cell) => {
  const base = cleanSuccess(cell.kind);
  switch (cell.id) {
    case "env.nonzero":
      return { ...base, toolResult: { ...base.toolResult, exit_category: "nonzero", returncode: 7 } };
    case "stdin.timeout":
      return { ...base, toolResult: { ...base.toolResult, exit_category: "timeout", returncode: null } };
    case "env.native_cancel":
      return denied(cell.kind, { found: true, action: "Cancel" });
    case "env.renderer_deny":
      return denied(cell.kind, { found: false, action: "Probe" });
    case "stdin.kill_worker":
    case "env.kill_supervisor":
      return {
        ...base,
        toolResult: { ok: false, denied: false, receipt_id: null, exit_category: null, returncode: null, error: "vault_worker_protocol_error" },
        receipt: { status: "indeterminate", outcome_code: "execution_indeterminate" },
        intent: { status: "indeterminate", sink_kind: cell.kind },
      };
    case "mcp.kill_parent":
      return {
        ...base,
        streamStatus: "interrupted",
        toolResult: null,
        receipt: { status: "indeterminate", outcome_code: "process_recovery_indeterminate" },
        intent: { status: "indeterminate", sink_kind: cell.kind },
        providerCalls: 1,
        mcpReceiptCount: 0,
        pendingRevived: false,
      };
    case "env.cold_restart_then_success":
      return { ...base, receiptRowsBefore: 3, receiptRowsAfter: 4 };
    default:
      return base;
  }
};

const goodEvidence = (overrides = {}) =>
  buildEvidence({
    identity,
    environment: {
      os_version: "10.0.22000",
      node_version: "v22.0.0",
      install_root: "C:/Users/qa/AppData/Local/Programs/PuPu",
      profile_path: "D:/evidence/安装态 sink 矩阵 profile",
    },
    cells: CELL_CATALOG.map((cell) => ({
      id: cell.id,
      kind: cell.kind,
      status: "PASS",
      reasons: [],
      observed: passingObservedFor(cell),
    })),
    cycles: {
      count: 100,
      seed: 195,
      schedule: buildCycleSchedule({ cycles: 100, seed: 195 }),
      failures: [],
      survivors_total: 0,
      sentinels_total: 0,
    },
    protocol: { oversize: "PASS", bad_frame: "PASS", evidence_path: "sidecar-supervisor-probe.json" },
    handleGrowth: evaluateHandleGrowth({
      samples: [
        { cycle: 1, app_handles: 900, sidecar_handles: 300 },
        { cycle: 100, app_handles: 960, sidecar_handles: 310 },
      ],
      maxGrowth: 300,
    }),
    secretScan: { scanned: 260, hits: [] },
    generatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  });

test("a complete passing evidence file verifies with no failures", () => {
  const verdict = verifyInstalledSinkEvidence(goodEvidence(), { expectedIdentity });
  assert.deepEqual(verdict, { ok: true, incomplete: false, failures: [], executed_tests: CELL_CATALOG.length + 102 });
});

test("every drift is rejected at the consumer, independently of the producer", () => {
  const mutate = (patch) => {
    const evidence = JSON.parse(JSON.stringify(goodEvidence()));
    patch(evidence);
    return verifyInstalledSinkEvidence(evidence, { expectedIdentity });
  };
  const cases = [
    ["schema", (e) => { e.schema = "pupu.windows-installed-sink-matrix.v0"; }],
    ["unknown top-level key", (e) => { e.extra = true; }],
    ["missing cell", (e) => { e.cells.pop(); }],
    ["duplicate cell", (e) => { e.cells[1] = { ...e.cells[0] }; }],
    ["cell FAIL", (e) => { e.cells[0].status = "FAIL"; e.cells[0].reasons = ["survivors 1"]; }],
    ["cell FAIL without reasons", (e) => { e.cells[0].status = "FAIL"; }],
    ["cell N/A without reason", (e) => { e.cells[0].status = "N/A"; }],
    ["observed unknown key", (e) => { e.cells[0].observed.extra = 1; }],
    ["observed survivors", (e) => { e.cells[0].observed.survivors = 1; }],
    ["observed disagrees with PASS", (e) => { e.cells[0].observed.streamStatus = "failed"; }],
    ["cycles count", (e) => { e.cycles.count = 99; }],
    ["cycles per-cell floor", (e) => { e.cycles.per_cell_counts["env.success"] = 5; e.cycles.per_cell_counts["stdin.success"] += 1; }],
    ["cycles sum", (e) => { e.cycles.per_cell_counts["env.success"] += 1; }],
    ["cycles failure", (e) => { e.cycles.failures = [{ cycle: 7, id: "env.success", reasons: ["survivors 1"] }]; }],
    ["survivors_total", (e) => { e.cycles.survivors_total = 1; }],
    ["sentinels_total", (e) => { e.cycles.sentinels_total = 2; }],
    ["schedule digest shape", (e) => { e.cycles.schedule_sha256 = "abc"; }],
    ["protocol oversize", (e) => { e.protocol.oversize = "FAIL"; }],
    ["handle growth", (e) => { e.handle_growth.pass = false; }],
    ["handle growth arithmetic", (e) => { e.handle_growth.growth.app_handles = 1; }],
    ["secret hit", (e) => { e.secret_scan.hits = [{ label: "app.log", variant_sha256_prefix: "0123456789abcdef" }]; }],
    ["secret scan too small", (e) => { e.secret_scan.scanned = 5; }],
    ["identity drift", (e) => { e.identity.installed_sidecar_sha256 = hash("9"); }],
    ["identity malformed", (e) => { e.identity.wheel_sha256 = "sha256:short"; }],
    ["platform", (e) => { e.platform = "darwin-arm64"; }],
    ["executed_tests", (e) => { e.executed_tests = 1; }],
  ];
  for (const [label, patch] of cases) {
    const verdict = mutate(patch);
    assert.equal(verdict.ok, false, label);
    assert.ok(verdict.failures.length >= 1, label);
  }
});

test("NOT_RUN cells make the verdict incomplete rather than passing", () => {
  const evidence = JSON.parse(JSON.stringify(goodEvidence()));
  evidence.cells[2].status = "NOT_RUN";
  evidence.cells[2].reasons = ["fake MCP server not started"];
  evidence.cells[2].observed = emptyObserved();
  const verdict = verifyInstalledSinkEvidence(evidence, { expectedIdentity });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.incomplete, true);
  assert.ok(verdict.failures.some((failure) => failure.includes("NOT_RUN")));
  const protocolNotRun = JSON.parse(JSON.stringify(goodEvidence()));
  protocolNotRun.protocol.bad_frame = "NOT_RUN";
  assert.equal(verifyInstalledSinkEvidence(protocolNotRun, { expectedIdentity }).incomplete, true);
});

test("an N/A cell needs a reason and is neither a pass nor a failure by itself", () => {
  const evidence = JSON.parse(JSON.stringify(goodEvidence()));
  evidence.cells[9].status = "N/A";
  evidence.cells[9].reasons = ["parent kill unreachable: installer refused to run in this account"];
  evidence.cells[9].observed = emptyObserved();
  const verdict = verifyInstalledSinkEvidence(evidence, { expectedIdentity });
  assert.equal(verdict.ok, false, "an N/A on an applicable cell still blocks a PASS verdict");
  assert.equal(verdict.incomplete, true);
});

test("CLI verifies files and returns 0 / 1 / 2 for pass, fail and incomplete", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-sink-verifier-"));
  try {
    const identityPath = path.join(dir, "candidate-build-evidence.json");
    fs.writeFileSync(
      identityPath,
      JSON.stringify({
        pupu_revision: identity.pupu_revision,
        unchain_revision: identity.unchain_revision,
        installer: { sha256: identity.installer_sha256 },
        app_asar: { sha256: identity.installed_asar_sha256 },
        sidecar: { sha256: identity.installed_sidecar_sha256 },
        wheel: { sha256: identity.wheel_sha256 },
      }),
    );
    const wheelPath = path.join(dir, "unchain-artifact.json");
    fs.writeFileSync(
      wheelPath,
      JSON.stringify({
        artifact: { sha256: identity.wheel_sha256 },
        runtime_manifest: { manifest_digest: identity.runtime_manifest_digest },
      }),
    );
    const good = path.join(dir, "good.json");
    fs.writeFileSync(good, JSON.stringify(goodEvidence()));
    const bad = path.join(dir, "bad.json");
    const badEvidence = goodEvidence();
    badEvidence.cycles.survivors_total = 3;
    fs.writeFileSync(bad, JSON.stringify(badEvidence));
    const incomplete = path.join(dir, "incomplete.json");
    const incompleteEvidence = goodEvidence();
    incompleteEvidence.protocol.oversize = "NOT_RUN";
    fs.writeFileSync(incomplete, JSON.stringify(incompleteEvidence));

    const run = (file) =>
      spawnSync(
        process.execPath,
        [
          path.join(here, "verify-windows-installed-sink-evidence.mjs"),
          file,
          "--candidate-evidence",
          identityPath,
          "--artifact-evidence",
          wheelPath,
        ],
        { encoding: "utf8" },
      );
    assert.equal(run(good).status, 0, run(good).stderr);
    assert.equal(run(bad).status, 1);
    assert.equal(run(incomplete).status, 2);

    const fileVerdict = verifyInstalledSinkEvidenceFiles({
      evidencePath: good,
      candidateEvidencePath: identityPath,
      artifactEvidencePath: wheelPath,
    });
    assert.equal(fileVerdict.ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
