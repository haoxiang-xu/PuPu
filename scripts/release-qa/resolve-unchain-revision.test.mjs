import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readPinnedUnchainRevision } from "./resolve-unchain-revision.mjs";

const withLock = (payload, run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-unchain-lock-"));
  const lockDirectory = path.join(root, "unchain_runtime");
  fs.mkdirSync(lockDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(lockDirectory, "unchain-core.lock.json"),
    JSON.stringify(payload),
  );
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test("reads the exact pinned Unchain revision from the runtime lock", () => {
  const revision = "a4e69f413c449c5768433ba4dddc5b60b8146991";
  withLock({ repository: "unchain", revision }, (root) => {
    assert.equal(readPinnedUnchainRevision({ root }), revision);
  });
});

test("rejects a malformed or wrong-repository runtime lock", () => {
  withLock({ repository: "other", revision: "a".repeat(40) }, (root) => {
    assert.throws(
      () => readPinnedUnchainRevision({ root }),
      /must declare repository=unchain/,
    );
  });
  withLock({ repository: "unchain", revision: "dev" }, (root) => {
    assert.throws(
      () => readPinnedUnchainRevision({ root }),
      /lowercase 40-character Git SHA/,
    );
  });
});

test("release QA has no second hard-coded blocking Unchain revision", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/release-qa.yml"),
    "utf8",
  );
  assert.doesNotMatch(workflow, /^\s+ref:\s+[0-9a-f]{40}\s*$/mu);
  assert.equal(
    workflow.match(/node scripts\/release-qa\/resolve-unchain-revision\.mjs/g)
      ?.length,
    3,
  );
  assert.equal(
    workflow.match(/steps\.unchain_revision\.outputs\.revision/g)?.length,
    3,
  );
  const contractStep = workflow.match(
    /- name: Context V2 boundary contract gate[\s\S]*?(?=\n      - name:)/,
  )?.[0] || "";
  assert.match(contractStep, /run: npm run test:context-v2-contract/);
  assert.doesNotMatch(contractStep, /continue-on-error|advisory/i);
  const pinnedStep = workflow.match(
    /- name: Verify pinned Unchain checkout[\s\S]*?(?=\n      - name:)/,
  )?.[0] || "";
  assert.match(
    pinnedStep,
    /run: node scripts\/release-qa\/verify-pinned-unchain\.mjs/,
  );
  assert.doesNotMatch(pinnedStep, /continue-on-error|advisory/i);
  assert.match(
    workflow,
    /"name":"Context V2 boundary contracts"[^\n]+steps\.context_v2_contract\.outcome/,
  );
  assert.match(
    workflow,
    /"name":"pinned Unchain checkout"[^\n]+steps\.pinned_unchain\.outcome/,
  );
  assert.match(
    workflow,
    /QA_REQUIRED_CHECKS_JSON: '\["Quorum boundary protocol","pinned Unchain checkout","Context V2 boundary contracts"\]'/,
  );
  assert.match(
    workflow,
    /if \(r\.deterministic_result\.status !== 'passed'\)/,
  );
  assert.match(
    workflow,
    /DETERMINISTIC_JOB_RESULT: \$\{\{ needs\.deterministic-checks\.result \}\}/,
  );
  assert.match(workflow, /--fail-on-deterministic-failure true/);
  const finalGate = workflow.match(
    /- name: Enforce final deterministic result[\s\S]*?(?=\n      - name:|\n\S|$)/,
  )?.[0] || "";
  assert.match(finalGate, /DETERMINISTIC_JOB_RESULT.*!= "success"/s);
  assert.match(
    finalGate,
    /r\.deterministic_result\.status !== 'passed'/,
  );
});
