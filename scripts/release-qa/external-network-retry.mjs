#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const MAX_CAPTURE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 15_000;
const PROFILES = new Set(["apple-ticket", "github-read", "git-read"]);

const PERMANENT_FAILURES = [
  /\bHTTP(?: status code:)?\s*(?:400|401|403|404|409|410|422)\b/i,
  /bad credentials|invalid credentials|authentication failed|permission denied|forbidden|not found/i,
  /invalid signature|not signed|certificate.*(?:invalid|expired|revoked)|keychain/i,
  /notarization.*(?:invalid|rejected)|ticket.*(?:invalid|rejected|not found)/i,
];

const TRANSIENT_FAILURES = [
  /NSURLErrorDomain Code=-(?:1001|1003|1004|1005|1009)\b/i,
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH)\b/i,
  /network connection was lost/i,
  /connection (?:reset|timed out|was closed)/i,
  /TLS handshake timeout|unexpected EOF/i,
  /could not (?:connect to|resolve) (?:the )?(?:host|server)/i,
  /temporary failure in name resolution/i,
  /service unavailable|bad gateway|gateway timeout/i,
  /\bHTTP(?: status code:)?\s*(?:408|425|429|5\d\d)\b/i,
];

const APPLE_TICKET_CONTEXT = /stapl|notari[sz]|apple-cloudkit|ticket-delivery/i;
const pause = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const appendTail = (current, chunk) => {
  const next = `${current}${chunk}`;
  return next.length <= MAX_CAPTURE_BYTES ? next : next.slice(-MAX_CAPTURE_BYTES);
};

export function isRetryableExternalNetworkFailure(profile, output) {
  if (!PROFILES.has(profile)) throw new Error(`unsupported retry profile: ${profile}`);
  const text = String(output || "");
  if (PERMANENT_FAILURES.some((pattern) => pattern.test(text))) return false;
  if (profile === "apple-ticket" && !APPLE_TICKET_CONTEXT.test(text)) return false;
  return TRANSIENT_FAILURES.some((pattern) => pattern.test(text));
}

export function validateCleanupPath(cleanupPath, cwd = process.cwd()) {
  if (typeof cleanupPath !== "string" || cleanupPath.length === 0 || path.isAbsolute(cleanupPath)) {
    throw new Error("cleanup path must be a safe relative cleanup path below the working directory");
  }
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, cleanupPath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("cleanup path must be a safe relative cleanup path below the working directory");
  }
  return resolved;
}

async function runStreamingCommand({ command, args }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = appendTail(output, chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      output = appendTail(output, chunk);
    });
    child.on("error", (error) => {
      const message = error?.stack || error?.message || String(error);
      process.stderr.write(`${message}\n`);
      resolve({ status: 1, output: appendTail(output, message) });
    });
    child.on("close", (status) => resolve({ status: status ?? 1, output }));
  });
}

async function removePartialOutput(cleanupPath) {
  await fs.rm(validateCleanupPath(cleanupPath), { recursive: true, force: true });
}

export async function runExternalNetworkCommandWithRetry({
  profile,
  command,
  args = [],
  cleanupPath,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
  runner = runStreamingCommand,
  cleanup = removePartialOutput,
  wait = pause,
} = {}) {
  if (!PROFILES.has(profile)) throw new Error(`unsupported retry profile: ${profile}`);
  if (typeof command !== "string" || command.length === 0) throw new Error("command is required");
  if (!Array.isArray(args)) throw new Error("args must be an array");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("maxAttempts must be an integer between 1 and 3");
  }
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 300_000) {
    throw new Error("delayMs must be an integer between 0 and 300000");
  }
  if (cleanupPath !== undefined) validateCleanupPath(cleanupPath);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runner({ command, args, attempt, maxAttempts });
    if (result?.status === 0) return { ...result, attempts: attempt };

    const retryable = isRetryableExternalNetworkFailure(profile, result?.output);
    if (!retryable || attempt === maxAttempts) {
      return { status: result?.status ?? 1, output: result?.output || "", attempts: attempt };
    }

    process.stderr.write(
      `::warning title=Transient external network failure::${profile} attempt ${attempt}/${maxAttempts} failed; retrying in ${delayMs}ms\n`,
    );
    if (cleanupPath !== undefined) await cleanup(cleanupPath);
    await wait(delayMs);
  }

  throw new Error("unreachable retry state");
}

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error(
      "usage: external-network-retry.mjs --profile PROFILE [--cleanup-path PATH] [--max-attempts N] [--delay-ms N] -- command [args...]",
    );
  }

  let profile;
  let cleanupPath;
  let maxAttempts = DEFAULT_MAX_ATTEMPTS;
  let delayMs = DEFAULT_DELAY_MS;
  for (let index = 0; index < separator; index += 2) {
    const name = argv[index];
    const raw = argv[index + 1];
    if (raw === undefined) throw new Error(`missing value for argument: ${name}`);
    if (name === "--profile") profile = raw;
    else if (name === "--cleanup-path") cleanupPath = raw;
    else if (name === "--max-attempts") maxAttempts = Number(raw);
    else if (name === "--delay-ms") delayMs = Number(raw);
    else throw new Error(`unknown argument: ${name}`);
  }

  return {
    profile,
    cleanupPath,
    maxAttempts,
    delayMs,
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
  };
}

async function main() {
  const result = await runExternalNetworkCommandWithRetry(parseArguments(process.argv.slice(2)));
  if (result.status !== 0) process.exitCode = result.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

