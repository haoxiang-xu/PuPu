import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isRetryableExternalNetworkFailure,
  runExternalNetworkCommandWithRetry,
  validateCleanupPath,
} from "./external-network-retry.mjs";

const retryCli = fileURLToPath(new URL("./external-network-retry.mjs", import.meta.url));
const portableHttpClient = `
  const http = require("node:http");
  http.get(process.argv[1], (response) => {
    response.pipe(process.stdout);
    response.on("end", () => {
      if (response.statusCode >= 400) {
        console.error("HTTP " + response.statusCode);
        process.exitCode = 1;
      }
    });
  }).on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
`;

async function runCliAgainstLocalResponses(t, { statuses, useGithubCli = false }) {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    const status = statuses[Math.min(requests, statuses.length - 1)];
    requests += 1;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(status >= 400 ? { message: "Bad Gateway" } : { name: "release-signing" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));

  const url = `http://127.0.0.1:${server.address().port}/metadata`;
  const childCommand = useGithubCli ? ["gh", "api", url] : [process.execPath, "-e", portableHttpClient, url];
  const child = spawn(process.execPath, [
    retryCli, "--profile", "github-read", "--delay-ms", "0", "--", ...childCommand,
  ], {
    env: {
      ...process.env,
      GH_TOKEN: "local-test-token",
      GITHUB_TOKEN: "local-test-token",
      GH_HOST: "github.com",
      GH_HTTP_UNIX_SOCKET: "",
      NO_PROXY: "127.0.0.1",
      no_proxy: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 8000,
  });
  t.after(() => child.kill());
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { status, stdout, stderr, requests };
}

for (const useGithubCli of [false, true]) {
  const clientLabel = useGithubCli ? "real gh api" : "portable HTTP child";
  const skip = useGithubCli && spawnSync("gh", ["--version"], { stdio: "ignore" }).status !== 0;

  test(`${clientLabel}: recovered CLI retry emits only the successful JSON response`, { skip, timeout: 15000 }, async (t) => {
    const result = await runCliAgainstLocalResponses(t, { statuses: [502, 200], useGithubCli });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.requests, 2);
    assert.deepEqual(JSON.parse(result.stdout), { name: "release-signing" });
    assert.match(result.stderr, /HTTP 502/);
    assert.match(result.stderr, /attempt 1\/3 failed/);
  });

  test(`${clientLabel}: exhausted CLI retries leave metadata stdout empty`, { skip, timeout: 15000 }, async (t) => {
    const result = await runCliAgainstLocalResponses(t, { statuses: [502], useGithubCli });
    assert.notEqual(result.status, 0);
    assert.equal(result.requests, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /HTTP 502/);
  });
}

test("CLI rejects oversized stdout without emitting partial metadata", () => {
  const result = spawnSync(process.execPath, [
    retryCli, "--profile", "github-read", "--delay-ms", "0", "--",
    process.execPath, "-e", "process.stdout.write(Buffer.alloc(17 * 1024 * 1024, 120))",
  ], { encoding: "utf8", timeout: 8000 });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /exceeded the 16 MiB retry buffer limit/);
  assert.doesNotMatch(result.stderr, /retrying/);
});

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

