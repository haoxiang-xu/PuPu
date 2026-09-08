#!/usr/bin/env node
// Strict consumer for the Windows installed-candidate Vault sink matrix
// evidence (issue #195, phase 2 step 6). It shares only the catalog constants
// with the producer library and re-derives every verdict itself: a producer
// bug that writes PASS next to failing observations is caught here.
//
// Exit codes: 0 pass, 1 failure, 2 incomplete (NOT_RUN / N/A cells present
// and nothing else failed).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CELL_CATALOG,
  CELL_STATUSES,
  CYCLE_POOL,
  EVIDENCE_ENVIRONMENT_KEYS,
  EVIDENCE_IDENTITY_KEYS,
  EVIDENCE_SCHEMA,
  MIN_PER_POOL_CELL,
  MIN_SUCCESS_CELLS,
  OBSERVED_KEYS,
  PLATFORM,
  evaluateCell,
} from "./windows-installed-sink-matrix-lib.mjs";

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const TOP_LEVEL_KEYS = [
  "cells",
  "cycles",
  "environment",
  "executed_tests",
  "generated_at",
  "handle_growth",
  "identity",
  "platform",
  "protocol",
  "schema",
  "secret_scan",
];
const CYCLE_KEYS = [
  "count",
  "failures",
  "per_cell_counts",
  "schedule_sha256",
  "seed",
  "sentinels_total",
  "survivors_total",
];
const PROTOCOL_KEYS = ["bad_frame", "evidence_path", "oversize"];
const HANDLE_KEYS = ["first", "growth", "last", "max_growth", "pass", "samples"];
const SCAN_KEYS = ["hits", "scanned"];
const CELL_KEYS = ["id", "kind", "observed", "reasons", "status"];
const REQUIRED_CYCLES = 100;
const MIN_SCANNED = CELL_CATALOG.length + REQUIRED_CYCLES;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) =>
  isObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

export const verifyInstalledSinkEvidence = (evidence, { expectedIdentity } = {}) => {
  const failures = [];
  const fail = (message) => failures.push(message);
  let incomplete = false;

  if (!isObject(evidence)) {
    return { ok: false, incomplete: false, failures: ["evidence is not an object"], executed_tests: 0 };
  }
  if (!exactKeys(evidence, TOP_LEVEL_KEYS)) fail("top-level keys are not the exact evidence key set");
  if (evidence.schema !== EVIDENCE_SCHEMA) fail(`schema ${evidence.schema} != ${EVIDENCE_SCHEMA}`);
  if (evidence.platform !== PLATFORM) fail(`platform ${evidence.platform} != ${PLATFORM}`);
  if (typeof evidence.generated_at !== "string" || Number.isNaN(Date.parse(evidence.generated_at))) {
    fail("generated_at is not an ISO timestamp");
  }

  // ---- identity ------------------------------------------------------------
  if (!exactKeys(evidence.identity, EVIDENCE_IDENTITY_KEYS)) {
    fail("identity keys are not exact");
  } else {
    const identity = evidence.identity;
    for (const key of EVIDENCE_IDENTITY_KEYS) {
      const pattern = key.endsWith("_revision") ? GIT_SHA : SHA256;
      if (!pattern.test(String(identity[key] || ""))) fail(`identity.${key} is malformed`);
    }
    if (!isObject(expectedIdentity)) {
      fail("expected identity was not supplied");
    } else {
      const pairs = [
        ["pupu_revision", "pupu_revision"],
        ["unchain_revision", "unchain_revision"],
        ["installer_sha256", "installer_sha256"],
        ["installed_asar_sha256", "app_asar_sha256"],
        ["installed_sidecar_sha256", "sidecar_sha256"],
        ["wheel_sha256", "wheel_sha256"],
        ["runtime_manifest_digest", "runtime_manifest_digest"],
      ];
      for (const [evidenceKey, expectedKey] of pairs) {
        if (identity[evidenceKey] !== expectedIdentity[expectedKey]) {
          fail(`identity.${evidenceKey} does not match the fixed candidate`);
        }
      }
    }
  }

  if (!exactKeys(evidence.environment, EVIDENCE_ENVIRONMENT_KEYS)) fail("environment keys are not exact");
  else {
    for (const key of EVIDENCE_ENVIRONMENT_KEYS) {
      if (typeof evidence.environment[key] !== "string" || !evidence.environment[key]) {
        fail(`environment.${key} is empty`);
      }
    }
  }

  // ---- cells -----------------------------------------------------------------
  const expectedIds = CELL_CATALOG.map((cell) => cell.id);
  if (!Array.isArray(evidence.cells)) {
    fail("cells is not an array");
  } else {
    const ids = evidence.cells.map((cell) => (isObject(cell) ? cell.id : null));
    if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
      fail("cells do not cover the catalog exactly once in catalog order");
    }
    for (const record of evidence.cells) {
      if (!exactKeys(record, CELL_KEYS)) {
        fail(`cell ${record?.id} keys are not exact`);
        continue;
      }
      const catalogCell = CELL_CATALOG.find((cell) => cell.id === record.id);
      if (!catalogCell) continue;
      if (record.kind !== catalogCell.kind) fail(`cell ${record.id} kind drifted`);
      if (!CELL_STATUSES.includes(record.status)) fail(`cell ${record.id} status ${record.status}`);
      if (!Array.isArray(record.reasons)) fail(`cell ${record.id} reasons is not an array`);
      if (!exactKeys(record.observed, OBSERVED_KEYS)) {
        fail(`cell ${record.id} observed keys are not exact`);
        continue;
      }
      if (record.status === "PASS") {
        let verdict;
        try {
          verdict = evaluateCell({ cell: catalogCell, observed: record.observed });
        } catch (error) {
          fail(`cell ${record.id} observed could not be evaluated: ${error.message}`);
          continue;
        }
        if (!verdict.pass) fail(`cell ${record.id} is marked PASS but observations fail: ${verdict.reasons.join("; ")}`);
      } else if (record.status === "FAIL") {
        fail(`cell ${record.id} FAIL: ${record.reasons.join("; ") || "(no reason recorded)"}`);
        if (!record.reasons.length) fail(`cell ${record.id} FAIL without reasons`);
      } else {
        if (!record.reasons.length) fail(`cell ${record.id} ${record.status} without a reason`);
        incomplete = true;
        fail(`cell ${record.id} is ${record.status}`);
      }
    }
  }

  // ---- cycles ----------------------------------------------------------------
  if (!exactKeys(evidence.cycles, CYCLE_KEYS)) {
    fail("cycles keys are not exact");
  } else {
    const cycles = evidence.cycles;
    if (cycles.count !== REQUIRED_CYCLES) fail(`cycles.count ${cycles.count} != ${REQUIRED_CYCLES}`);
    if (!Number.isInteger(cycles.seed)) fail("cycles.seed is not an integer");
    if (!HEX64.test(String(cycles.schedule_sha256 || ""))) fail("cycles.schedule_sha256 is malformed");
    if (!exactKeys(cycles.per_cell_counts, CYCLE_POOL)) {
      fail("cycles.per_cell_counts keys are not the cycle pool");
    } else {
      let total = 0;
      let successes = 0;
      for (const id of CYCLE_POOL) {
        const value = cycles.per_cell_counts[id];
        if (!Number.isInteger(value) || value < MIN_PER_POOL_CELL) {
          fail(`cycle cell ${id} ran ${value} times (< ${MIN_PER_POOL_CELL})`);
        }
        total += Number(value) || 0;
        if (CELL_CATALOG.find((cell) => cell.id === id)?.fault === "none") successes += Number(value) || 0;
      }
      if (total !== cycles.count) fail(`per_cell_counts sum ${total} != cycles.count`);
      if (successes < MIN_SUCCESS_CELLS) fail(`only ${successes} success cycles (< ${MIN_SUCCESS_CELLS})`);
    }
    if (!Array.isArray(cycles.failures)) fail("cycles.failures is not an array");
    else if (cycles.failures.length > 0) fail(`${cycles.failures.length} cycle failures recorded`);
    if (cycles.survivors_total !== 0) fail(`cycles.survivors_total ${cycles.survivors_total}`);
    if (cycles.sentinels_total !== 0) fail(`cycles.sentinels_total ${cycles.sentinels_total}`);
  }

  // ---- protocol cells ----------------------------------------------------------
  if (!exactKeys(evidence.protocol, PROTOCOL_KEYS)) {
    fail("protocol keys are not exact");
  } else {
    for (const key of ["oversize", "bad_frame"]) {
      const status = evidence.protocol[key];
      if (status === "PASS") continue;
      if (status === "NOT_RUN" || status === "N/A") {
        incomplete = true;
        fail(`protocol.${key} is ${status}`);
      } else {
        fail(`protocol.${key} is ${status}`);
      }
    }
    if (typeof evidence.protocol.evidence_path !== "string" || !evidence.protocol.evidence_path) {
      fail("protocol.evidence_path is empty");
    }
  }

  // ---- handle growth -------------------------------------------------------------
  if (!exactKeys(evidence.handle_growth, HANDLE_KEYS)) {
    fail("handle_growth keys are not exact");
  } else {
    const growth = evidence.handle_growth;
    if (growth.pass !== true) fail("handle_growth.pass is not true");
    for (const key of ["app_handles", "sidecar_handles"]) {
      const first = growth.first?.[key];
      const last = growth.last?.[key];
      const delta = growth.growth?.[key];
      if (![first, last, delta].every(Number.isInteger)) {
        fail(`handle_growth.${key} is not integral`);
        continue;
      }
      if (last - first !== delta) fail(`handle_growth.${key} arithmetic does not hold`);
      if (delta > growth.max_growth) fail(`handle_growth.${key} ${delta} exceeds ${growth.max_growth}`);
    }
    if (!Number.isInteger(growth.samples) || growth.samples < 2) fail("handle_growth.samples < 2");
  }

  // ---- secret scan --------------------------------------------------------------
  if (!exactKeys(evidence.secret_scan, SCAN_KEYS)) {
    fail("secret_scan keys are not exact");
  } else {
    const scan = evidence.secret_scan;
    if (!Number.isInteger(scan.scanned) || scan.scanned < MIN_SCANNED) {
      fail(`secret_scan.scanned ${scan.scanned} < ${MIN_SCANNED}`);
    }
    if (!Array.isArray(scan.hits)) fail("secret_scan.hits is not an array");
    else {
      for (const hit of scan.hits) {
        if (!isObject(hit) || !HEX16.test(String(hit.variant_sha256_prefix || ""))) {
          fail("secret_scan hit is malformed");
        }
      }
      if (scan.hits.length > 0) fail(`${scan.hits.length} secret material hits`);
    }
  }

  // ---- executed tests -------------------------------------------------------------
  const expectedExecuted = CELL_CATALOG.length + REQUIRED_CYCLES + 2;
  if (evidence.executed_tests !== expectedExecuted) {
    fail(`executed_tests ${evidence.executed_tests} != ${expectedExecuted}`);
  }

  const blocking = failures.filter((message) => !/is (NOT_RUN|N\/A)$/.test(message));
  return {
    ok: failures.length === 0,
    incomplete: incomplete && blocking.length === 0,
    failures,
    executed_tests: expectedExecuted,
  };
};

// Reads the expected identity from Codex's candidate-build-evidence.json
// (installer / app_asar / sidecar / wheel hashes + revisions) and the wheel
// evidence (artifact sha + runtime manifest digest).
export const loadExpectedIdentity = ({ candidateEvidencePath, artifactEvidencePath }) => {
  const candidate = JSON.parse(fs.readFileSync(candidateEvidencePath, "utf8"));
  const artifact = JSON.parse(fs.readFileSync(artifactEvidencePath, "utf8"));
  const pick = (value, label) => {
    if (typeof value !== "string" || !value) throw new Error(`candidate evidence is missing ${label}`);
    return value;
  };
  return {
    pupu_revision: pick(candidate.pupu_revision, "pupu_revision"),
    unchain_revision: pick(candidate.unchain_revision, "unchain_revision"),
    installer_sha256: pick(candidate.installer?.sha256, "installer.sha256"),
    app_asar_sha256: pick(candidate.app_asar?.sha256, "app_asar.sha256"),
    sidecar_sha256: pick(candidate.sidecar?.sha256, "sidecar.sha256"),
    wheel_sha256: pick(artifact.artifact?.sha256, "artifact.sha256"),
    runtime_manifest_digest: pick(artifact.runtime_manifest?.manifest_digest, "runtime_manifest.manifest_digest"),
  };
};

export const verifyInstalledSinkEvidenceFiles = ({
  evidencePath,
  candidateEvidencePath,
  artifactEvidencePath,
}) => {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const expectedIdentity = loadExpectedIdentity({ candidateEvidencePath, artifactEvidencePath });
  return verifyInstalledSinkEvidence(evidence, { expectedIdentity });
};

const parseArgs = (argv) => {
  const args = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) {
      args[value.slice(2)] = argv[index + 1];
      index += 1;
    } else {
      args.positional.push(value);
    }
  }
  return args;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const evidencePath = args.positional[0];
  if (!evidencePath || !args["candidate-evidence"] || !args["artifact-evidence"]) {
    console.error(
      "usage: verify-windows-installed-sink-evidence.mjs <evidence.json> " +
        "--candidate-evidence <candidate-build-evidence.json> --artifact-evidence <unchain-artifact.json>",
    );
    process.exit(2);
  }
  let verdict;
  try {
    verdict = verifyInstalledSinkEvidenceFiles({
      evidencePath: path.resolve(evidencePath),
      candidateEvidencePath: path.resolve(args["candidate-evidence"]),
      artifactEvidencePath: path.resolve(args["artifact-evidence"]),
    });
  } catch (error) {
    console.error(`[installed-sink-verifier] ${error.message}`);
    process.exit(1);
  }
  for (const failure of verdict.failures) console.error(`[installed-sink-verifier] ${failure}`);
  if (verdict.ok) {
    console.log(`[installed-sink-verifier] PASS (${verdict.executed_tests} executed checks)`);
    process.exit(0);
  }
  console.error(`[installed-sink-verifier] ${verdict.incomplete ? "INCOMPLETE" : "FAIL"}`);
  process.exit(verdict.incomplete ? 2 : 1);
}
