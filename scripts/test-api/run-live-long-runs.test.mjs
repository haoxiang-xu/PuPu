import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

import {
  assertFreshReportDirectory,
  buildLiveRecipe,
  buildPlaywrightArgs,
  buildSubagentTemplates,
  parseArgs,
  prepareIsolatedHome,
  readCredentialFile,
  resolveCredential,
  resolvePython,
  signalChildTree,
  stripProviderSecrets,
  writeCredentialHandoff,
} from "./run-live-long-runs.mjs";

const require = createRequire(import.meta.url);
const {
  LIVE_ROOT_MAX_ITERATIONS,
  getLiveCell,
} = require("./live-long-run-lib.cjs");
const {
  MCP_TOOLKIT_ID,
} = require("./deterministic-soak-lib.cjs");

test("runner defaults to six 20-minute single-root cells in three parallels", () => {
  const options = parseArgs([]);
  assert.equal(options.selectedCells.length, 6);
  assert.equal(options.durationMs, 20 * 60 * 1000);
  assert.equal(options.parallel, 3);
  assert.equal("maxIterations" in options, false);
});

test("runner supports explicit subsets but rejects the old short-attempt option", () => {
  const options = parseArgs([
    "--cell",
    "coding-openai",
    "--cell",
    "web-anthropic",
    "--parallel",
    "2",
  ]);
  assert.deepEqual(
    options.selectedCells.map((cell) => cell.id),
    ["coding-openai", "web-anthropic"],
  );
  assert.equal(options.parallel, 2);
  assert.throws(() => parseArgs(["--parallel", "4"]), /between 1 and 3/);
  assert.throws(
    () => parseArgs(["--max-iterations", "7"]),
    /unknown argument/,
  );
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

test("paid runner refuses to reuse a nonempty report directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-live-report-"));
  try {
    assert.equal(assertFreshReportDirectory(tempDir), tempDir);
    fs.writeFileSync(path.join(tempDir, "old-audit.jsonl"), "{}\n", "utf8");
    assert.throws(
      () => assertFreshReportDirectory(tempDir),
      /must be new or empty/,
    );
    const filePath = path.join(tempDir, "not-a-directory");
    fs.writeFileSync(filePath, "x", "utf8");
    assert.throws(
      () => assertFreshReportDirectory(filePath),
      /not a directory/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("credentials resolve from dedicated env, standard env, or secure file", () => {
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

test("child environment uses a closed allowlist and strips all ambient secrets", () => {
  const cleaned = stripProviderSecrets({
    PATH: "/bin",
    TMPDIR: "/tmp/live-cell",
    PUPU_LIVE_OPENAI_API_KEY: "a",
    OPENAI_API_KEY: "b",
    PUPU_LIVE_ANTHROPIC_API_KEY: "c",
    ANTHROPIC_API_KEY: "d",
    PUPU_LIVE_PROVIDER_API_KEY: "e",
    OPENAI_BASE_URL: "https://redirect.invalid",
    HTTPS_PROXY: "https://proxy.invalid",
    NODE_EXTRA_CA_CERTS: "/tmp/ca",
    NODE_OPTIONS: "--require /tmp/inject.js",
    PYTHONPATH: "/tmp/inject",
    INTERNAL_AUTH_TOKEN: "ambient",
    DATABASE_URL: "postgres://ambient",
    SSH_AUTH_SOCK: "/tmp/ambient-agent.sock",
    AWS_PROFILE: "production",
  });
  assert.deepEqual(cleaned, {
    PATH: "/bin",
    TMPDIR: "/tmp/live-cell",
  });
});

test("Python capability probe receives only the closed child environment", () => {
  let observed = null;
  const resolved = resolvePython("/fixture/python", {
    environment: {
      PATH: "/bin",
      TMPDIR: "/tmp/live-cell",
      OPENAI_API_KEY: "provider-secret",
      DATABASE_URL: "postgres://ambient",
    },
    spawnSyncImpl: (command, args, options) => {
      observed = { command, args, options };
      return { status: 0, stdout: "/safe/python\n", stderr: "" };
    },
  });
  assert.equal(resolved, "/safe/python");
  assert.equal(observed.command, "/fixture/python");
  assert.deepEqual(observed.options.env, {
    PATH: "/bin",
    TMPDIR: "/tmp/live-cell",
  });
});

test("runner signals the isolated process group and falls back to its child", () => {
  const groupSignals = [];
  const directSignals = [];
  const child = {
    pid: 4321,
    kill: (signal) => {
      directSignals.push(signal);
      return true;
    },
  };
  assert.equal(
    signalChildTree({
      child,
      signal: "SIGTERM",
      platform: "darwin",
      killGroup: (pid, signal) => groupSignals.push({ pid, signal }),
    }),
    true,
  );
  assert.deepEqual(groupSignals, [{ pid: -4321, signal: "SIGTERM" }]);
  assert.deepEqual(directSignals, []);

  assert.equal(
    signalChildTree({
      child,
      signal: "SIGKILL",
      platform: "darwin",
      killGroup: () => {
        throw new Error("group already exited");
      },
    }),
    true,
  );
  assert.deepEqual(directSignals, ["SIGKILL"]);
});

test("templates and recipes enforce exact worker/delegate tool boundaries", () => {
  const templates = buildSubagentTemplates();
  assert.deepEqual(
    templates.map((entry) => ({
      name: entry.value.name,
      modes: entry.value.allowed_modes,
      tools: entry.value.allowed_tools,
      parallel: entry.value.parallel_safe,
    })),
    [
      {
        name: "live-observer-a",
        modes: ["worker"],
        tools: ["soak_probe"],
        parallel: true,
      },
      {
        name: "live-observer-b",
        modes: ["worker"],
        tools: ["soak_probe"],
        parallel: true,
      },
      {
        name: "live-observer-c",
        modes: ["delegate"],
        tools: ["soak_probe"],
        parallel: false,
      },
    ],
  );

  const coding = buildLiveRecipe(getLiveCell("coding-openai"));
  assert.equal(coding.merge_with_user_selected, false);
  assert.equal(coding.max_iterations, LIVE_ROOT_MAX_ITERATIONS);
  assert.deepEqual(coding.toolkits, [
    { id: "core", enabled_tools: ["read", "write"] },
    {
      id: MCP_TOOLKIT_ID,
      enabled_tools: [
        "soak_wait",
        "soak_gate",
        "soak_checkpoint",
        "soak_probe",
      ],
    },
  ]);
  assert.deepEqual(
    buildLiveRecipe(getLiveCell("mcp-openai")).toolkits.map(
      (toolkit) => toolkit.id,
    ),
    [MCP_TOOLKIT_ID],
  );
  assert.deepEqual(
    buildLiveRecipe(getLiveCell("web-openai")).toolkits[0],
    { id: "core", enabled_tools: ["web_fetch"] },
  );
});

test("isolated home writes one fixed recipe and three mode-specific templates", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-live-home-"));
  try {
    const result = prepareIsolatedHome(
      tempDir,
      getLiveCell("coding-openai"),
    );
    assert.equal(
      fs.readdirSync(result.subagentDir).filter((name) =>
        name.endsWith(".skeleton"),
      ).length,
      3,
    );
    const recipe = JSON.parse(
      fs.readFileSync(
        path.join(result.recipeDir, "Default.recipe"),
        "utf8",
      ),
    );
    assert.equal(recipe.merge_with_user_selected, false);
    assert.equal(recipe.subagent_pool.length, 3);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("credential handoff is mode 0600 and never appears in Playwright args", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-live-key-"));
  try {
    const handoffPath = path.join(tempDir, "credential.json");
    writeCredentialHandoff(handoffPath, {
      cell: getLiveCell("coding-openai"),
      credential: "one-shot-secret",
    });
    const parsed = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
    assert.equal(parsed.credential, "one-shot-secret");
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(handoffPath).mode & 0o077, 0);
    }
    const args = buildPlaywrightArgs({
      playwrightCli: "/tmp/playwright-cli.js",
      outputPath: "/tmp/output",
      headed: false,
    });
    assert.ok(args.includes("--workers=1"));
    assert.ok(args.includes("--retries=0"));
    assert.equal(args.join(" ").includes("one-shot-secret"), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
