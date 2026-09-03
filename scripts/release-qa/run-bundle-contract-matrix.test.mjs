import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ELECTRON_RUN_BUNDLE_TESTS,
  flattenNamedTests,
  PRICING_CATALOG_TESTS,
  PUPU_RUN_BUNDLE_TESTS,
  RENDERER_RUN_BUNDLE_TESTS,
  UNCHAIN_RUN_BUNDLE_TESTS,
} from "./run-bundle-contract-matrix.mjs";
import { requireNonzeroJestExecution } from "./jest-execution-report.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PRODUCTION_OWNERSHIP_SELECTORS = Object.freeze([
  "tests/test_production_run_ownership.py::test_factory_reuses_one_exact_owner_and_atomic_store",
  "tests/test_production_run_ownership.py::test_missing_data_directory_fails_closed_before_provider_send",
  "tests/test_production_run_ownership.py::test_memory_off_crash_cold_replay_is_zero_resend_with_canonical_receipt",
  "tests/test_production_run_ownership.py::test_diagnostics_revision_cold_reloads_from_the_authoritative_ledger",
  "tests/test_production_run_ownership_wiring.py::test_memory_off_root_receives_the_generic_production_factory",
  "tests/test_production_run_ownership_wiring.py::test_shadow_root_receives_generic_factory_but_active_omits_it",
  "tests/test_production_run_ownership_wiring.py::test_memory_off_graph_uses_one_ledger_for_cold_continuation_and_diagnostics",
  "tests/test_production_run_ownership_wiring.py::test_memory_off_graph_claims_compact_v2_predecessor_on_cold_continuation",
]);
const RUN_BUNDLE_V2_SELECTORS = Object.freeze([
  "tests/test_run_bundle_ledger_runtime.py::test_compact_v2_full_envelope_enforces_exact_canonical_byte_limit",
  "tests/test_run_bundle_ledger_runtime.py::test_sqlite_requires_one_way_revision_advance_from_v1_to_v2",
  "tests/test_run_bundle_ledger_runtime.py::test_continuation_claims_compact_v2_predecessor_idempotently",
  "tests/test_run_bundle_ledger_runtime.py::test_compact_v2_details_ref_rejects_durable_fact_tampering",
  "tests/test_run_bundle_ledger_runtime.py::test_completion_merge_hydrates_v2_root_facts_without_double_counting",
  "tests/test_run_bundle_ledger_runtime.py::test_compact_v2_child_roundtrips_through_subagent_state_and_root_union",
  "tests/test_run_bundle_adapter.py::test_graph_merge_hydrates_compact_v2_child_from_official_ledger",
  "tests/test_run_bundle_ledger.py::test_schema_transition_is_one_way_and_v2_must_advance_v1",
  "tests/test_run_bundle_ledger.py::test_reads_fail_closed_on_same_revision_dual_schema_collision",
]);

test("RunBundle release gate freezes exact cross-boundary P0 selectors", () => {
  assert.ok(UNCHAIN_RUN_BUNDLE_TESTS.length >= 20);
  assert.ok(PUPU_RUN_BUNDLE_TESTS.length >= 25);
  assert.equal(flattenNamedTests(PRICING_CATALOG_TESTS).length, 14);
  assert.ok(flattenNamedTests(ELECTRON_RUN_BUNDLE_TESTS).length >= 14);
  assert.ok(flattenNamedTests(RENDERER_RUN_BUNDLE_TESTS).length >= 20);

  for (const selector of [
    ...UNCHAIN_RUN_BUNDLE_TESTS,
    ...PUPU_RUN_BUNDLE_TESTS,
  ]) {
    assert.match(selector, /\.py::/);
  }
  for (const selector of PRODUCTION_OWNERSHIP_SELECTORS) {
    assert.ok(
      PUPU_RUN_BUNDLE_TESTS.includes(selector),
      `missing production ownership selector: ${selector}`,
    );
  }
  for (const selector of RUN_BUNDLE_V2_SELECTORS) {
    assert.ok(
      UNCHAIN_RUN_BUNDLE_TESTS.includes(selector) ||
        PUPU_RUN_BUNDLE_TESTS.includes(selector),
      `missing RunBundle v2 selector: ${selector}`,
    );
  }
  for (const { file, name } of [
    ...flattenNamedTests(PRICING_CATALOG_TESTS),
    ...flattenNamedTests(ELECTRON_RUN_BUNDLE_TESTS),
    ...flattenNamedTests(RENDERER_RUN_BUNDLE_TESTS),
  ]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.ok(
      source.includes(`\"${name}\"`) || source.includes(`'${name}'`),
      `missing exact sentinel: ${file} :: ${name}`,
    );
  }

  const runner = fs.readFileSync(
    path.join(ROOT, "scripts", "release-qa", "run-run-bundle-contract.mjs"),
    "utf8",
  );
  assert.match(runner, /verifyWheelRuntimeManifest/);
  assert.match(runner, /verifyUnchainTestSourceProvenance/);
  assert.match(runner, /UNCHAIN_ARTIFACT_PATH/);
  assert.match(runner, /UNCHAIN_ARTIFACT_EVIDENCE_PATH/);
  assert.match(runner, /UNCHAIN_TEST_SOURCE_PATH/);
  assert.match(runner, /PYTHONPATH: pythonPath/);
  assert.match(runner, /name: "Unchain canonical producer and ledger"/);
  assert.match(runner, /name: "PuPu sidecar projection and state sequences"/);
  assert.match(runner, /name: "Signed official pricing catalog and immutable estimates"/);
  assert.match(runner, /name: "Electron strict admission and idempotent storage"/);
  assert.match(runner, /name: "Renderer accounting barrier and presentation"/);
  assert.match(runner, /requireNonzeroJestExecution/);
  assert.match(runner, /--outputFile/);
  assert.doesNotMatch(runner, /--testNamePattern/);
  assert.doesNotMatch(runner, /Pinned|checkout\.valid|UNCHAIN_SOURCE_PATH/);
  assert.doesNotMatch(runner, /continue-on-error|advisory/i);
});

test("Jest execution report rejects skipped-only output and proves a file ran", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "pupu-run-bundle-jest-selftest-"),
  );
  const reportPath = path.join(directory, "jest-result.json");
  try {
    assert.throws(
      () => requireNonzeroJestExecution({
        reportPath: path.join(ROOT, "scripts", "release-qa", "fixtures", "skipped-only.json"),
        stageName: "synthetic skipped-only",
      }),
      /readable Jest report/,
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "node_modules", ".bin", "jest"),
        "--env=node",
        "--runInBand",
        "--silent",
        "--moduleFileExtensions", "js",
        "--moduleFileExtensions", "cjs",
        "--moduleFileExtensions", "json",
        "--testMatch", "**/electron/tests/**/*.test.cjs",
        "--json",
        "--outputFile", reportPath,
        "--runTestsByPath",
        "electron/tests/shared/run_bundle_v1.test.cjs",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const execution = requireNonzeroJestExecution({
      reportPath,
      stageName: "Jest self-test",
    });
    assert.ok(execution.executedTests > 0);
    assert.ok(execution.executedSuites > 0);

    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        numPassedTests: 0,
        numFailedTests: 0,
        numPassedTestSuites: 0,
        numFailedTestSuites: 0,
      }),
    );
    assert.throws(
      () => requireNonzeroJestExecution({
        reportPath,
        stageName: "synthetic skipped-only",
      }),
      /executed zero tests or suites/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
