import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseArgs,
  readCredentialFile,
  resolveCredential,
  stripProviderSecrets,
} from "./run-live-long-runs.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getLiveCell } = require("./live-long-run-lib.cjs");

test("runner defaults to all six 20-minute cells in serial order", () => {
  const options = parseArgs([]);
  assert.equal(options.selectedCells.length, 6);
  assert.equal(options.durationMs, 20 * 60 * 1000);
  assert.equal(options.parallel, 1);
  assert.equal(options.maxIterations, 12);
});

test("runner supports explicit limited parallel subsets", () => {
  const options = parseArgs([
    "--cell",
    "coding-openai",
    "--cell",
    "web-anthropic",
    "--parallel",
    "2",
    "--max-iterations",
    "7",
  ]);
  assert.deepEqual(
    options.selectedCells.map((cell) => cell.id),
    ["coding-openai", "web-anthropic"],
  );
  assert.equal(options.parallel, 2);
  assert.equal(options.maxIterations, 7);
  assert.throws(() => parseArgs(["--parallel", "4"]), /between 1 and 3/);
});

test("short runs require an explicit smoke-only override", () => {
  assert.throws(
    () => parseArgs(["--duration-minutes", "1"]),
    /require --allow-short/,
  );
  const options = parseArgs([
    "--duration-minutes",
    "0.1",
    "--allow-short",
  ]);
  assert.equal(options.durationMs, 6000);
});

test("credentials resolve from dedicated env, standard env, or a secure file", () => {
  const cell = getLiveCell("coding-openai");
  assert.deepEqual(
    resolveCredential({
      cell,
      environment: {
        PUPU_LIVE_OPENAI_API_KEY: "dedicated",
        OPENAI_API_KEY: "standard",
      },
    }),
    { value: "dedicated", source: "dedicated_environment" },
  );
  assert.deepEqual(
    resolveCredential({ cell, environment: { OPENAI_API_KEY: "standard" } }),
    { value: "standard", source: "standard_environment" },
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-live-creds-"));
  try {
    const credentialsPath = path.join(tempDir, "credentials.json");
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({
        model_providers: {
          openai_api_key: "file-openai",
          anthropic_api_key: "file-anthropic",
        },
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    if (process.platform !== "win32") fs.chmodSync(credentialsPath, 0o600);
    const values = readCredentialFile(credentialsPath);
    assert.deepEqual(values, {
      openai_api_key: "file-openai",
      anthropic_api_key: "file-anthropic",
    });
    assert.deepEqual(
      resolveCredential({ cell, environment: {}, fileValues: values }),
      { value: "file-openai", source: "credentials_file" },
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("child environment strips every provider credential alias", () => {
  const cleaned = stripProviderSecrets({
    PATH: "/bin",
    PUPU_LIVE_OPENAI_API_KEY: "a",
    OPENAI_API_KEY: "b",
    PUPU_LIVE_ANTHROPIC_API_KEY: "c",
    ANTHROPIC_API_KEY: "d",
    PUPU_LIVE_PROVIDER_API_KEY: "e",
  });
  assert.deepEqual(cleaned, { PATH: "/bin" });
});
