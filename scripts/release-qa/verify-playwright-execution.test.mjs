import assert from "node:assert/strict";
import test from "node:test";

import { verifyPlaywrightExecution } from "./verify-playwright-execution.mjs";

const reportWith = (status) => ({
  suites: [{
    specs: [{
      tests: [{ results: [{ status }] }],
    }],
    suites: [],
  }],
});

test("Playwright execution evidence counts completed tests but not skipped-only output", () => {
  assert.deepEqual(verifyPlaywrightExecution(reportWith("passed")), {
    executedTests: 1,
  });
  assert.deepEqual(verifyPlaywrightExecution(reportWith("failed")), {
    executedTests: 1,
  });
  assert.throws(
    () => verifyPlaywrightExecution(reportWith("skipped")),
    /zero executed tests/,
  );
  assert.throws(
    () => verifyPlaywrightExecution({ suites: [] }),
    /zero executed tests/,
  );
});
