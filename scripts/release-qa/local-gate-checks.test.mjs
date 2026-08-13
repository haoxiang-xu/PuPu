import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildLocalGateChecks } from "./local-gate-checks.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("release QA paths both include the fixed long-run harness suite", () => {
  const checks = buildLocalGateChecks({
    root: ROOT,
    python: "python3",
    unchainRoot: "/tmp/unchain-fixture",
    version: "0.0.0-test",
  });
  const harnessChecks = checks.filter(
    (check) => check.command === "npm run test:long-run-harness",
  );
  assert.deepEqual(harnessChecks, [
    {
      name: "long-run harness tests",
      command: "npm run test:long-run-harness",
      cwd: ROOT,
    },
  ]);
  assert.equal(
    checks.find((check) => check.name === "release QA script tests")?.command,
    "npm run test:release-qa:unit",
  );
  assert.deepEqual(
    checks.find((check) => check.name === "Quorum boundary protocol"),
    {
      name: "Quorum boundary protocol",
      command: "npm run test:quorum-boundary",
      cwd: ROOT,
    },
  );
  assert.deepEqual(
    checks.find((check) => check.name === "Context V2 boundary contracts"),
    {
      name: "Context V2 boundary contracts",
      command: "npm run test:context-v2-contract",
      cwd: ROOT,
      env: {
        PYTHON: "python3",
        UNCHAIN_SOURCE_PATH: "/tmp/unchain-fixture",
      },
    },
  );
  assert.deepEqual(
    checks.find((check) => check.name === "Playwright Electron release smoke")
      ?.env,
    {
      PUPU_E2E_RELEASE: "1",
      PUPU_E2E_PORT: "2917",
      PUPU_E2E_WEB_URL: "http://127.0.0.1:2917/#",
      PUPU_DETERMINISTIC_SOAK: "0",
      PUPU_SINGLE_AGENT_LONG_RUN: "0",
      PUPU_LIVE_LONG_RUN: "0",
      PUPU_LIVE_CELL_ID: "",
    },
  );

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  assert.equal(
    packageJson.scripts["test:release-qa"],
    "npm run test:release-qa:unit && npm run test:long-run-harness",
  );
  assert.equal(
    packageJson.scripts["test:quorum-boundary"],
    "python3 -B .claude/skills/case/boundary_vendor_verify.py && python3 -B .claude/skills/case/boundary_lint_selftest.py && python3 -B .claude/skills/case/boundary_gate_selftest.py && python3 -B .claude/skills/case/boundary_gate.py --cases-root .claude/court/cases",
  );
  assert.equal(
    packageJson.scripts["test:context-v2-contract"],
    "node scripts/release-qa/run-context-v2-contract.mjs",
  );

  const harnessCommand = packageJson.scripts["test:long-run-harness"];
  const expectedFiles = [
    "scripts/test-api/deterministic-soak-lib.test.mjs",
    "scripts/test-api/deterministic-soak-runner-lib.test.mjs",
    "scripts/test-api/fake_openai_responses_server.test.mjs",
    "scripts/test-api/single-agent-long-run-lib.test.mjs",
    "scripts/test-api/run-single-agent-long-run.test.mjs",
    "scripts/test-api/live-long-run-lib.test.mjs",
    "scripts/test-api/run-live-long-runs.test.mjs",
  ];
  assert.deepEqual(harnessCommand.split(/\s+/), [
    "node",
    "--test",
    ...expectedFiles,
  ]);
  assert.doesNotMatch(harnessCommand, /e2e|pupu-deterministic-soak\.spec/);
});
