#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { isRetryableExternalNetworkFailure } from "./external-network-retry.mjs";

const MAX_CAPTURE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_DELAY_MS = 30_000;

const pause = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const appendTail = (current, chunk) => {
  const next = `${current}${chunk}`;
  return next.length <= MAX_CAPTURE_BYTES ? next : next.slice(-MAX_CAPTURE_BYTES);
};

export function isTransientMacNotarizationFailure(output) {
  return isRetryableExternalNetworkFailure("apple-ticket", output);
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

async function removeGeneratedDist() {
  const root = path.resolve(process.cwd());
  const dist = path.resolve(root, "dist");
  if (path.dirname(dist) !== root || path.basename(dist) !== "dist") {
    throw new Error(`refusing to clean unexpected generated path: ${dist}`);
  }
  await fs.rm(dist, { recursive: true, force: true });
}

export async function runMacReleaseBuildWithRetry({
  command,
  args = [],
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
  runner = runStreamingCommand,
  cleanGeneratedDist = removeGeneratedDist,
  wait = pause,
} = {}) {
  if (typeof command !== "string" || command.length === 0) throw new Error("command is required");
  if (!Array.isArray(args)) throw new Error("args must be an array");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("maxAttempts must be an integer between 1 and 3");
  }
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 300_000) {
    throw new Error("delayMs must be an integer between 0 and 300000");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runner({ command, args, attempt, maxAttempts });
    if (result?.status === 0) return { ...result, attempts: attempt };

    const retryable = isTransientMacNotarizationFailure(result?.output);
    if (!retryable || attempt === maxAttempts) {
      return { status: result?.status ?? 1, output: result?.output || "", attempts: attempt };
    }

    process.stderr.write(
      `::warning title=Transient Apple notarization failure::attempt ${attempt}/${maxAttempts} failed; cleaning generated dist and retrying in ${delayMs}ms\n`,
    );
    await cleanGeneratedDist();
    await wait(delayMs);
  }

  throw new Error("unreachable retry state");
}

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error("usage: macos-release-build-retry.mjs [--max-attempts N] [--delay-ms N] -- command [args...]");
  }

  let maxAttempts = DEFAULT_MAX_ATTEMPTS;
  let delayMs = DEFAULT_DELAY_MS;
  for (let index = 0; index < separator; index += 1) {
    const name = argv[index];
    const raw = argv[index + 1];
    if (name === "--max-attempts") maxAttempts = Number(raw);
    else if (name === "--delay-ms") delayMs = Number(raw);
    else throw new Error(`unknown argument: ${name}`);
    index += 1;
  }

  return {
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
    maxAttempts,
    delayMs,
  };
}

async function main() {
  const result = await runMacReleaseBuildWithRetry(parseArguments(process.argv.slice(2)));
  if (result.status !== 0) process.exitCode = result.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
