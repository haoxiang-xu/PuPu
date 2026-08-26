import assert from "node:assert/strict";
import test from "node:test";

import {
  descendantPids,
  parseProcessTable,
  validateMacOsInstalledCandidateReport,
} from "./macos-installed-candidate.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

const validReport = () => ({
  schema: "pupu.macos-installed-candidate.v1",
  candidate_class: "diagnostic_local_unsigned",
  executed_tests: 33,
  identity: {
    hashes: {
      dmg: digest("1"),
      wheel: digest("2"),
      app_asar: digest("3"),
      executable: digest("4"),
      packaged_sidecar: digest("5"),
      snapshot: digest("6"),
    },
  },
  package_smoke: { executed_tests: 5 },
  installed_lifecycle: { executed_tests: 4 },
  installed_p6_matrix: { executed_tests: 24 },
});

test("process table parser and descendant closure preserve the candidate tree", () => {
  const rows = parseProcessTable([
    " 100 1 /candidate/PuPu",
    " 101 100 /candidate/PuPu Helper",
    " 102 101 /candidate/unchain-server",
    " 200 1 /other/process",
  ].join("\n"));
  assert.deepEqual([...descendantPids(rows, 100)].sort(), [101, 102]);
});

test("installed report accepts a nonzero, complete identity chain", () => {
  const report = validReport();
  assert.equal(validateMacOsInstalledCandidateReport(report), report);
});

test("installed report rejects zero-test and malformed identity evidence", () => {
  const zero = validReport();
  zero.package_smoke.executed_tests = 0;
  zero.executed_tests = 28;
  assert.throws(
    () => validateMacOsInstalledCandidateReport(zero),
    /package_smoke must contain nonzero executed tests/,
  );

  const malformed = validReport();
  malformed.identity.hashes.app_asar = "not-a-digest";
  assert.throws(
    () => validateMacOsInstalledCandidateReport(malformed),
    /identity hash app_asar/,
  );
});
