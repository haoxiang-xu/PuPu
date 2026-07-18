import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReviewerEnv,
  parseCompletedReview,
  resetReviewOutputs,
} from "./ai-review-helpers.mjs";

const validReview = {
  recommendation: "GO",
  summary: "All reviewed risks are covered.",
  risks: [],
  missing_tests: [],
};

test("a failed reviewer cannot reuse a stale GO file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-ai-review-"));
  const outputPath = path.join(dir, "codex-review.json");
  fs.writeFileSync(outputPath, JSON.stringify(validReview), "utf8");

  resetReviewOutputs([outputPath]);

  assert.equal(fs.existsSync(outputPath), false);
  assert.equal(parseCompletedReview({ status: 7 }, JSON.stringify(validReview)), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("nonzero reviewer output is rejected even when it contains valid JSON", () => {
  assert.equal(parseCompletedReview({ status: 7 }, JSON.stringify(validReview)), null);
});

test("schema-invalid reviewer output is rejected after a successful exit", () => {
  assert.equal(
    parseCompletedReview({ status: 0 }, JSON.stringify({ recommendation: "GO" })),
    null,
  );
});

test("successful schema-valid reviewer output is accepted", () => {
  assert.deepEqual(
    parseCompletedReview({ status: 0 }, JSON.stringify(validReview)),
    validReview,
  );
});

test("reviewer environment strips credential-like and unrelated values", () => {
  const env = buildReviewerEnv({
    PATH: "/bin",
    HOME: "/tmp/reviewer-home",
    OPENAI_API_KEY: "sentinel-openai",
    GITHUB_TOKEN: "sentinel-github",
    AWS_SECRET_ACCESS_KEY: "sentinel-aws",
    UNRELATED_VALUE: "sentinel-other",
  });

  assert.deepEqual(env, {
    PATH: "/bin",
    HOME: "/tmp/reviewer-home",
  });
});
