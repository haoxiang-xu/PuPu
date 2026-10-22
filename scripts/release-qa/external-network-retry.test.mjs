import assert from "node:assert/strict";
import test from "node:test";

import {
  isRetryableExternalNetworkFailure,
  runExternalNetworkCommandWithRetry,
  validateCleanupPath,
} from "./external-network-retry.mjs";

test("classifies transient Apple ticket-delivery failures without retrying permanent signing failures", () => {
  assert.equal(
    isRetryableExternalNetworkFailure(
      "apple-ticket",
      "stapler: NSURLErrorDomain Code=-1005 The network connection was lost at api.apple-cloudkit.com",
    ),
    true,
  );
  assert.equal(isRetryableExternalNetworkFailure("apple-ticket", "HTTP status code: 401 invalid credentials"), false);
  assert.equal(isRetryableExternalNetworkFailure("apple-ticket", "The ticket was rejected: invalid signature"), false);
});

test("classifies transient GitHub reads without retrying permanent API responses", () => {
  assert.equal(isRetryableExternalNetworkFailure("github-read", "HTTP 502: Bad Gateway"), true);
  assert.equal(isRetryableExternalNetworkFailure("github-read", "read ECONNRESET"), true);
  assert.equal(isRetryableExternalNetworkFailure("github-read", "net/http: TLS handshake timeout"), true);
  assert.equal(isRetryableExternalNetworkFailure("github-read", "unexpected EOF while reading response body"), true);
  for (const status of [401, 403, 404, 422]) {
    assert.equal(isRetryableExternalNetworkFailure("github-read", `HTTP ${status}: request failed`), false);
  }
});

test("retries a transient read, cleans only its declared partial destination, and succeeds", async () => {
  const results = [
    { status: 1, output: "HTTP 503: Service Unavailable" },
    { status: 0, output: "complete" },
  ];
  const events = [];

  const result = await runExternalNetworkCommandWithRetry({
    profile: "github-read",
    command: "gh",
    args: ["run", "download", "123"],
    cleanupPath: "candidate",
    maxAttempts: 3,
    delayMs: 1000,
    runner: async () => {
      events.push("run");
      return results.shift();
    },
    cleanup: async (cleanupPath) => events.push(`clean:${cleanupPath}`),
    wait: async (delayMs) => events.push(`wait:${delayMs}`),
  });

  assert.equal(result.status, 0);
  assert.equal(result.attempts, 2);
  assert.deepEqual(events, ["run", "clean:candidate", "wait:1000", "run"]);
});

test("fails closed after one attempt for permanent responses", async () => {
  let attempts = 0;
  const result = await runExternalNetworkCommandWithRetry({
    profile: "github-read",
    command: "gh",
    args: ["api", "repos/example/missing"],
    runner: async () => {
      attempts += 1;
      return { status: 1, output: "HTTP 404: Not Found" };
    },
    cleanup: async () => assert.fail("permanent failures must not clean"),
    wait: async () => assert.fail("permanent failures must not wait"),
  });

  assert.equal(result.status, 1);
  assert.equal(result.attempts, 1);
  assert.equal(attempts, 1);
});

test("rejects cleanup paths outside the working directory", () => {
  for (const cleanupPath of [".", "..", "../candidate", "/tmp/candidate"]) {
    assert.throws(() => validateCleanupPath(cleanupPath, "/work/repo"), /safe relative cleanup path/);
  }
  assert.equal(validateCleanupPath("candidate/assets", "/work/repo"), "/work/repo/candidate/assets");
});

