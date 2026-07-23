#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  LIVE_DURATION_MS,
  LIVE_MATRIX,
  LIVE_MAX_ITERATIONS,
  LIVE_MIN_ITERATIONS,
  selectLiveCells,
} = require("./live-long-run-lib.cjs");

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const COST_ACKNOWLEDGEMENT = "I_UNDERSTAND_LIVE_API_COST";

const usage = () => `Usage: node scripts/test-api/run-live-long-runs.mjs [options]

Runs six independent real-model cells by default:
  coding-openai       openai:gpt-5.2-codex
  coding-anthropic    anthropic:claude-sonnet-4-6
  mcp-openai          openai:gpt-5.2-codex
  mcp-anthropic       anthropic:claude-sonnet-4-6
  web-openai          openai:gpt-5.2-codex
  web-anthropic       anthropic:claude-sonnet-4-6

Options:
  --confirm-cost              required acknowledgement for paid API calls
  --cell ID                   run one cell; repeat to select several (default all)
  --parallel N                number of isolated cells in flight, 1-3 (default 1)
  --duration-minutes N        duration per cell (default 20)
  --max-iterations N          workload iterations per cell (default 12)
  --allow-short               permit duration below 20m; report is smoke-only
  --credentials-file PATH     mode-0600 JSON containing provider API keys
  --python PATH               Python interpreter containing the mcp package
  --report-dir PATH           matrix and per-cell JSON report directory
  --base-port PORT            first isolated React dev-server port (default 2920)
  --headed                    show Electron windows
  --help                      show this help

Credentials are read without printing their values. Dedicated variables win:
  PUPU_LIVE_OPENAI_API_KEY (fallback OPENAI_API_KEY)
  PUPU_LIVE_ANTHROPIC_API_KEY (fallback ANTHROPIC_API_KEY)

Non-interactive cost acknowledgement:
  PUPU_LIVE_ACKNOWLEDGE_COST=${COST_ACKNOWLEDGEMENT}
`;

const parseInteger = (label, value, { min, max }) => {
  if (!/^\d+$/.test(String(value || ""))) {
    throw new Error(`${label} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const options = {
    help: false,
    confirmCost: false,
    cells: [],
    parallel: 1,
    durationMinutes: LIVE_DURATION_MS / 60000,
    maxIterations: LIVE_MAX_ITERATIONS,
    allowShort: false,
    credentialsFile: "",
    python: "",
    reportDir: "",
    basePort: 2920,
    headed: false,
  };
  const valued = new Set([
    "--cell",
    "--parallel",
    "--duration-minutes",
    "--max-iterations",
    "--credentials-file",
    "--python",
    "--report-dir",
    "--base-port",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-cost") {
      options.confirmCost = true;
      continue;
    }
    if (arg === "--allow-short") {
      options.allowShort = true;
      continue;
    }
    if (arg === "--headed") {
      options.headed = true;
      continue;
    }
    if (!valued.has(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${arg} requires a value`);
    index += 1;
    if (arg === "--cell") options.cells.push(value);
    if (arg === "--parallel") {
      options.parallel = parseInteger(arg, value, { min: 1, max: 3 });
    }
    if (arg === "--duration-minutes") {
      const duration = Number(value);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 360) {
        throw new Error("--duration-minutes must be greater than 0 and at most 360");
      }
      options.durationMinutes = duration;
    }
    if (arg === "--max-iterations") {
      options.maxIterations = parseInteger(arg, value, {
        min: LIVE_MIN_ITERATIONS,
        max: 100,
      });
    }
    if (arg === "--credentials-file") options.credentialsFile = value;
    if (arg === "--python") options.python = value;
    if (arg === "--report-dir") options.reportDir = value;
    if (arg === "--base-port") {
      options.basePort = parseInteger(arg, value, { min: 1024, max: 65529 });
    }
  }
  if (options.durationMinutes < 20 && !options.allowShort) {
    throw new Error(
      "durations below 20 minutes require --allow-short and are reported as smoke-only",
    );
  }
  options.selectedCells = selectLiveCells(options.cells);
  if (options.basePort + LIVE_MATRIX.length - 1 > 65535) {
    throw new Error("--base-port leaves insufficient ports for the six-cell matrix");
  }
  options.durationMs = Math.round(options.durationMinutes * 60 * 1000);
  return options;
};

const readCredentialFile = (filePath) => {
  if (!filePath) return {};
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`credentials path is not a file: ${resolved}`);
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error(
      `credentials file must not be group/world accessible; run chmod 600 ${resolved}`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("credentials file must contain a JSON object");
  }
  const providers =
    parsed.model_providers && typeof parsed.model_providers === "object"
      ? parsed.model_providers
      : {};
  return {
    openai_api_key: String(
      parsed.openai_api_key || providers.openai_api_key || "",
    ).trim(),
    anthropic_api_key: String(
      parsed.anthropic_api_key || providers.anthropic_api_key || "",
    ).trim(),
  };
};

const resolveCredential = ({ cell, environment = process.env, fileValues = {} }) => {
  for (const name of cell.credentialNames) {
    const value = String(environment[name] || "").trim();
    if (value) {
      return {
        value,
        source: name.startsWith("PUPU_LIVE_")
          ? "dedicated_environment"
          : "standard_environment",
      };
    }
  }
  const fileValue = String(fileValues[cell.settingsKey] || "").trim();
  if (fileValue) return { value: fileValue, source: "credentials_file" };
  return { value: "", source: "missing" };
};

const pythonCandidates = (explicit) => [
  explicit,
  process.env.PUPU_LIVE_PYTHON,
  process.env.PUPU_SOAK_PYTHON,
  path.resolve(REPO_ROOT, "../unchain/.venv/bin/python"),
  path.resolve(REPO_ROOT, "../unchain/.venv/Scripts/python.exe"),
  "python3",
  "python",
];

const resolvePython = (explicit) => {
  const failures = [];
  const candidates = [...new Set(pythonCandidates(explicit).filter(Boolean))];
  for (const candidate of candidates) {
    const probe = spawnSync(
      candidate,
      ["-c", "import pathlib,sys,mcp; print(pathlib.Path(sys.executable).resolve())"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 15000 },
    );
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
    failures.push(
      `${candidate}: ${(probe.stderr || probe.error?.message || "probe failed").trim()}`,
    );
  }
  throw new Error(
    `no Python interpreter with the mcp package was found\n${failures.join("\n")}`,
  );
};

const buildSubagentTemplates = () =>
  ["a", "b"].map((suffix) => ({
    filename: `live-observer-${suffix}.skeleton`,
    value: {
      name: `live-observer-${suffix}`,
      description: `Read-only observer ${suffix.toUpperCase()} for PuPu live long runs.`,
      instructions: [
        "You are a release-test leaf worker.",
        "Return the exact LIVE_CHILD_OK marker requested by the parent.",
        "Do not call tools, ask questions, or delegate.",
      ].join("\n"),
      allowed_modes: ["worker"],
      output_mode: "last_message",
      memory_policy: "ephemeral",
      parallel_safe: true,
      allowed_tools: [],
      model: null,
    },
  }));

const prepareIsolatedHome = (homeDir) => {
  const subagentDir = path.join(homeDir, ".pupu", "subagents");
  fs.mkdirSync(subagentDir, { recursive: true });
  for (const template of buildSubagentTemplates()) {
    fs.writeFileSync(
      path.join(subagentDir, template.filename),
      `${JSON.stringify(template.value, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  return subagentDir;
};

const defaultReportDir = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(REPO_ROOT, "test-results", "live-long-runs", stamp);
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const waitForChild = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

const safeReadCellReport = (reportPath) => {
  try {
    return JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (_) {
    return null;
  }
};

const stripProviderSecrets = (environment) => {
  const cleaned = { ...environment };
  for (const cell of LIVE_MATRIX) {
    for (const name of cell.credentialNames) delete cleaned[name];
  }
  delete cleaned.PUPU_LIVE_PROVIDER_API_KEY;
  return cleaned;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const acknowledged =
    options.confirmCost ||
    process.env.PUPU_LIVE_ACKNOWLEDGE_COST === COST_ACKNOWLEDGEMENT;
  if (!acknowledged) {
    throw new Error(
      `paid live runs require --confirm-cost or PUPU_LIVE_ACKNOWLEDGE_COST=${COST_ACKNOWLEDGEMENT}`,
    );
  }

  const fileValues = readCredentialFile(options.credentialsFile);
  const credentials = new Map();
  for (const cell of options.selectedCells) {
    const credential = resolveCredential({ cell, fileValues });
    if (!credential.value) {
      throw new Error(
        `missing ${cell.provider} credential required by ${cell.id}; no live process was started`,
      );
    }
    credentials.set(cell.id, credential);
  }

  const needsMcp = options.selectedCells.some((cell) => cell.workload === "mcp");
  const pythonPath = needsMcp ? resolvePython(options.python) : "";
  const reportDir = path.resolve(options.reportDir || defaultReportDir());
  fs.mkdirSync(reportDir, { recursive: true });
  const summaryPath = path.join(reportDir, "matrix-report.json");
  const playwrightCli = require.resolve("@playwright/test/cli");
  const startedAt = Date.now();
  const summary = {
    schema_version: 1,
    kind: "pupu-live-model-long-run-matrix",
    status: "running",
    started_at: new Date(startedAt).toISOString(),
    finished_at: null,
    wall_time_ms: null,
    selected_cell_count: options.selectedCells.length,
    full_matrix_cell_count: LIVE_MATRIX.length,
    parallelism: options.parallel,
    duration_per_cell_ms: options.durationMs,
    max_iterations_per_cell: options.maxIterations,
    qualification:
      options.durationMs >= LIVE_DURATION_MS ? "long-run" : "smoke-only",
    report_dir: reportDir,
    cells: options.selectedCells.map((cell) => ({
      cell_id: cell.id,
      workload: cell.workload,
      provider: cell.provider,
      model_id: cell.modelId,
      status: "pending",
      credential_source: credentials.get(cell.id).source,
      report_path: path.join(reportDir, cell.id, "cell-report.json"),
    })),
  };
  writeJson(summaryPath, summary);

  const activeChildren = new Set();
  let abortedSignal = "";
  const forwardSignal = (signal) => {
    abortedSignal = signal;
    for (const child of activeChildren) {
      if (child.exitCode == null && child.signalCode == null) child.kill(signal);
    }
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  let cursor = 0;
  const runNext = async () => {
    while (true) {
      if (abortedSignal) return;
      const index = cursor;
      cursor += 1;
      if (index >= options.selectedCells.length) return;
      const cell = options.selectedCells[index];
      const cellDir = path.join(reportDir, cell.id);
      const homeDir = path.join(cellDir, "isolated-home");
      const workspaceRoot = path.join(cellDir, "isolated-workspace");
      const reportPath = path.join(cellDir, "cell-report.json");
      const auditPath = path.join(cellDir, "mcp-audit.jsonl");
      const playwrightOutput = path.join(cellDir, "playwright-artifacts");
      fs.mkdirSync(workspaceRoot, { recursive: true });
      prepareIsolatedHome(homeDir);
      writeJson(reportPath, {
        schema_version: 1,
        kind: "pupu-live-model-long-run-cell",
        cell_id: cell.id,
        workload: cell.workload,
        provider: cell.provider,
        model_id: cell.modelId,
        qualification:
          options.durationMs >= LIVE_DURATION_MS ? "long-run" : "smoke-only",
        target_duration_ms: options.durationMs,
        status: "launching",
        started_at: new Date().toISOString(),
        error: null,
      });

      summary.cells[index].status = "running";
      summary.cells[index].started_at = new Date().toISOString();
      writeJson(summaryPath, summary);

      const playwrightArgs = [
        playwrightCli,
        "test",
        "e2e/pupu-live-long-run.spec.js",
        "--workers=1",
        `--output=${playwrightOutput}`,
        "--reporter=line",
      ];
      if (options.headed) playwrightArgs.push("--headed");
      const port = options.basePort + LIVE_MATRIX.findIndex((item) => item.id === cell.id);
      const childEnv = stripProviderSecrets(process.env);
      Object.assign(childEnv, {
        PATH: [
          path.join(REPO_ROOT, "node_modules", ".bin"),
          process.env.PATH || "",
        ]
          .filter(Boolean)
          .join(path.delimiter),
        HOME: homeDir,
        USERPROFILE: homeDir,
        XDG_CONFIG_HOME: path.join(homeDir, ".config"),
        PUPU_LIVE_LONG_RUN: "1",
        PUPU_LIVE_CELL_ID: cell.id,
        PUPU_LIVE_PROVIDER_API_KEY: credentials.get(cell.id).value,
        PUPU_LIVE_DURATION_MS: String(options.durationMs),
        PUPU_LIVE_MAX_ITERATIONS: String(options.maxIterations),
        PUPU_LIVE_REPORT_PATH: reportPath,
        PUPU_LIVE_WORKSPACE_ROOT: workspaceRoot,
        PUPU_LIVE_MCP_AUDIT_PATH: auditPath,
        PUPU_LIVE_MCP_TIME_SCALE: process.env.PUPU_LIVE_MCP_TIME_SCALE || "0.1",
        PUPU_LIVE_PYTHON: pythonPath,
        PUPU_E2E_RELEASE: "1",
        PUPU_E2E_PORT: String(port),
        PUPU_E2E_WEB_URL: `http://127.0.0.1:${port}/#`,
      });

      const child = spawn(process.execPath, playwrightArgs, {
        cwd: REPO_ROOT,
        env: childEnv,
        stdio: "inherit",
      });
      activeChildren.add(child);
      let outcome;
      try {
        outcome = await waitForChild(child);
      } catch (error) {
        outcome = { code: 1, signal: null, error: error.message };
      } finally {
        activeChildren.delete(child);
      }
      let cellReport = safeReadCellReport(reportPath);
      if (
        !cellReport ||
        !["passed", "failed"].includes(String(cellReport.status || ""))
      ) {
        cellReport = {
          ...(cellReport || {}),
          schema_version: 1,
          kind: "pupu-live-model-long-run-cell",
          cell_id: cell.id,
          workload: cell.workload,
          provider: cell.provider,
          model_id: cell.modelId,
          status: "failed",
          finished_at: new Date().toISOString(),
          error: {
            code: "playwright_cell_incomplete",
            message:
              outcome.error ||
              `Playwright exited before producing a terminal cell report (exit=${outcome.code}, signal=${outcome.signal || "none"})`,
          },
        };
        writeJson(reportPath, cellReport);
      }
      summary.cells[index] = {
        ...summary.cells[index],
        status:
          outcome.code === 0 && cellReport?.status === "passed"
            ? "passed"
            : "failed",
        exit_code: outcome.code,
        signal: outcome.signal || null,
        error: outcome.error || cellReport?.error?.message || null,
        finished_at: new Date().toISOString(),
        attempt_count: Array.isArray(cellReport?.attempts)
          ? cellReport.attempts.length
          : 0,
        token_summary: cellReport?.token_summary || null,
        tool_summary: cellReport?.tool_summary || null,
      };
      writeJson(summaryPath, summary);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(options.parallel, options.selectedCells.length) },
      () => runNext(),
    ),
  );

  if (abortedSignal) {
    for (const cell of summary.cells) {
      if (cell.status !== "pending") continue;
      cell.status = "failed";
      cell.signal = abortedSignal;
      cell.error = "matrix interrupted before this cell started";
      cell.finished_at = new Date().toISOString();
      writeJson(cell.report_path, {
        schema_version: 1,
        kind: "pupu-live-model-long-run-cell",
        cell_id: cell.cell_id,
        workload: cell.workload,
        provider: cell.provider,
        model_id: cell.model_id,
        status: "failed",
        finished_at: cell.finished_at,
        error: {
          code: "matrix_interrupted",
          message: cell.error,
          signal: abortedSignal,
        },
      });
    }
  }

  const finishedAt = Date.now();
  summary.status = summary.cells.every((cell) => cell.status === "passed")
    ? "passed"
    : "failed";
  summary.finished_at = new Date(finishedAt).toISOString();
  summary.wall_time_ms = finishedAt - startedAt;
  writeJson(summaryPath, summary);
  process.stdout.write(
    `${JSON.stringify({
      status: summary.status,
      matrix_report: summaryPath,
      passed: summary.cells.filter((cell) => cell.status === "passed").length,
      failed: summary.cells.filter((cell) => cell.status === "failed").length,
    })}\n`,
  );
  if (summary.status !== "passed") process.exitCode = 1;
};

if (path.resolve(process.argv[1] || "") === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack || error)}\n`);
    process.exitCode = 1;
  });
}

export {
  COST_ACKNOWLEDGEMENT,
  buildSubagentTemplates,
  parseArgs,
  prepareIsolatedHome,
  readCredentialFile,
  resolveCredential,
  stripProviderSecrets,
  usage,
};
