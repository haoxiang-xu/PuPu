#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  buildSoakRecipe,
  buildSubagentTemplates,
} = require("./deterministic-soak-lib.cjs");
const {
  resolveAgentLongRunProfile,
} = require("./single-agent-long-run-lib.cjs");
const {
  requiresSleepGuard,
  sleepGuardCleanupError,
  sleepGuardRuntimeError,
  sleepGuardStartupError,
  startSleepGuard,
} = require("./deterministic-soak-runner-lib.cjs");

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

const usage =
  () => `Usage: node scripts/test-api/run-single-agent-long-run.mjs [options]

Runs three root agents in parallel. Each chat starts exactly one root attempt;
the fake LLM keeps that attempt alive across many model/tool/subagent rounds.

Options:
  --profile quick|full   quick is a scaled smoke; full keeps each root alive >=20m
  --report-dir PATH      output directory for report and JSONL audits
  --python PATH          Python interpreter containing the mcp package
  --web-port PORT        isolated React dev-server port (default 2918)
  --headed               show the Electron window while running
  --help                 show this help
`;

const parseArgs = (argv) => {
  const options = {
    profile: "quick",
    reportDir: "",
    python: "",
    webPort: "2918",
    headed: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--headed") {
      options.headed = true;
      continue;
    }
    if (!["--profile", "--report-dir", "--python", "--web-port"].includes(arg)) {
      throw new Error(`unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${arg} requires a value`);
    index += 1;
    if (arg === "--profile") options.profile = value;
    if (arg === "--report-dir") options.reportDir = value;
    if (arg === "--python") options.python = value;
    if (arg === "--web-port") options.webPort = value;
  }
  if (!/^\d+$/.test(options.webPort)) {
    throw new Error("--web-port must be an integer");
  }
  const port = Number(options.webPort);
  if (port < 1 || port > 65535) {
    throw new Error("--web-port must be between 1 and 65535");
  }
  options.webPort = String(port);
  return options;
};

const pythonCandidates = (explicit) => [
  explicit,
  process.env.PUPU_AGENT_LONG_RUN_PYTHON,
  process.env.PUPU_SOAK_PYTHON,
  path.resolve(REPO_ROOT, "../unchain/.venv/bin/python"),
  path.resolve(REPO_ROOT, "../unchain/.venv/Scripts/python.exe"),
  "python3",
  "python",
];

const resolvePython = (explicit) => {
  const failures = [];
  for (const candidate of [...new Set(pythonCandidates(explicit).filter(Boolean))]) {
    const probe = spawnSync(
      candidate,
      ["-c", "import sys,mcp; print(sys.executable)"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 15000 },
    );
    if (probe.status === 0 && probe.stdout.trim()) {
      return path.resolve(probe.stdout.trim());
    }
    failures.push(
      `${candidate}: ${(probe.stderr || probe.error?.message || "probe failed").trim()}`,
    );
  }
  throw new Error(
    `no Python interpreter with the mcp package was found\n${failures.join("\n")}`,
  );
};

const defaultReportDir = (profileName) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    REPO_ROOT,
    "test-results",
    "single-agent-long-run",
    `${stamp}-${profileName}`,
  );
};

const prepareIsolatedHome = (homeDir) => {
  const subagentDir = path.join(homeDir, ".pupu", "subagents");
  const recipeDir = path.join(homeDir, ".pupu", "agent_recipes");
  fs.mkdirSync(subagentDir, { recursive: true });
  fs.mkdirSync(recipeDir, { recursive: true });
  for (const template of buildSubagentTemplates()) {
    fs.writeFileSync(
      path.join(subagentDir, template.filename),
      `${JSON.stringify(template.value, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  fs.writeFileSync(
    path.join(recipeDir, "Default.recipe"),
    `${JSON.stringify(buildSoakRecipe(), null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return { subagentDir, recipeDir };
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

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const profile = resolveAgentLongRunProfile(options.profile);
  const reportDir = path.resolve(
    options.reportDir || defaultReportDir(profile.name),
  );
  fs.mkdirSync(reportDir, { recursive: true });
  const homeDir = path.join(reportDir, "isolated-home");
  const isolated = prepareIsolatedHome(homeDir);
  const pythonPath = resolvePython(options.python);
  const reportPath = path.join(reportDir, "agent-long-run-report.json");
  const fakeAuditPath = path.join(reportDir, "fake-llm-audit.jsonl");
  const mcpAuditPath = path.join(reportDir, "mcp-audit.jsonl");
  const runnerReportPath = path.join(reportDir, "runner-report.json");
  const playwrightCli = require.resolve("@playwright/test/cli");
  const playwrightArgs = [
    playwrightCli,
    "test",
    "e2e/pupu-single-agent-long-run.spec.js",
    "--workers=1",
  ];
  if (options.headed) playwrightArgs.push("--headed");

  const startedAt = Date.now();
  const runnerReport = {
    schema_version: 1,
    kind: "pupu-single-root-execution-long-run-runner",
    profile: profile.name,
    qualification: profile.name === "full" ? "agent-long-run" : "smoke-only",
    status: "running",
    root_tool_calls_per_agent: profile.rootToolCalls,
    root_max_iterations: profile.rootMaxIterations,
    minimum_root_duration_ms: profile.minimumRootDurationMs,
    parallel_root_agents: 3,
    started_at: new Date(startedAt).toISOString(),
    report_dir: reportDir,
    report_path: reportPath,
    fake_llm_audit_path: fakeAuditPath,
    mcp_audit_path: mcpAuditPath,
    isolated_home: homeDir,
    subagent_dir: isolated.subagentDir,
    recipe_dir: isolated.recipeDir,
    python_path: pythonPath,
    playwright_command: [process.execPath, ...playwrightArgs],
    sleep_guard: {
      kind: process.platform === "darwin" ? "caffeinate" : "none",
      pid: null,
      active: false,
      exit: null,
      error: null,
      ...(process.platform === "darwin"
        ? {}
        : { reason: "unsupported-platform" }),
    },
  };
  writeJson(runnerReportPath, runnerReport);
  process.stdout.write(
    `${JSON.stringify({
      ready: true,
      profile: profile.name,
      qualification: runnerReport.qualification,
      parallel_root_agents: 3,
      root_tool_calls_per_agent: profile.rootToolCalls,
      minimum_root_duration_ms: profile.minimumRootDurationMs,
      report_dir: reportDir,
    })}\n`,
  );

  const child = spawn(process.execPath, playwrightArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: [
        path.join(REPO_ROOT, "node_modules", ".bin"),
        process.env.PATH || "",
      ]
        .filter(Boolean)
        .join(path.delimiter),
      HOME: homeDir,
      USERPROFILE: homeDir,
      XDG_CONFIG_HOME: path.join(homeDir, ".config"),
      PUPU_SINGLE_AGENT_LONG_RUN: "1",
      PUPU_AGENT_LONG_RUN_PROFILE: profile.name,
      PUPU_AGENT_LONG_RUN_REPORT_DIR: reportDir,
      PUPU_AGENT_LONG_RUN_REPORT_PATH: reportPath,
      PUPU_AGENT_LONG_RUN_FAKE_AUDIT_PATH: fakeAuditPath,
      PUPU_AGENT_LONG_RUN_MCP_AUDIT_PATH: mcpAuditPath,
      PUPU_AGENT_LONG_RUN_TIME_SCALE:
        process.env.PUPU_AGENT_LONG_RUN_TIME_SCALE || String(profile.timeScale),
      PUPU_AGENT_LONG_RUN_PYTHON: pythonPath,
      UNCHAIN_MAX_ITERATIONS: String(profile.rootMaxIterations),
      PUPU_E2E_RELEASE: "1",
      PUPU_E2E_PORT: options.webPort,
      PUPU_E2E_WEB_URL: `http://127.0.0.1:${options.webPort}/#`,
    },
  });

  const childOutcome = waitForChild(child);
  const guardRequired = requiresSleepGuard({
    platform: process.platform,
    profileName: profile.name,
  });
  let sleepGuard = null;
  let guardFailure = null;
  let playwrightSettled = false;
  let forwardedSignal = null;
  const forwardSignal = (signal) => {
    forwardedSignal = forwardedSignal || signal;
    if (child.exitCode == null && child.signalCode == null) child.kill(signal);
    sleepGuard?.requestStop("SIGTERM");
  };
  const forwardSigint = () => forwardSignal("SIGINT");
  const forwardSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", forwardSigint);
  process.once("SIGTERM", forwardSigterm);

  let outcome;
  try {
    sleepGuard = startSleepGuard({
      platform: process.platform,
      watchedPid: child.pid,
    });
    const guardSnapshot = await sleepGuard.ready;
    runnerReport.sleep_guard = guardSnapshot;
    writeJson(runnerReportPath, runnerReport);

    const startupError = sleepGuardStartupError(guardSnapshot);
    if (startupError && guardRequired) {
      guardFailure = startupError;
      if (child.exitCode == null && child.signalCode == null) {
        child.kill("SIGTERM");
      }
    }
    sleepGuard.settled?.then((snapshot) => {
      if (playwrightSettled || forwardedSignal) return;
      const runtimeError = sleepGuardRuntimeError(snapshot);
      if (!runtimeError) return;
      guardFailure = guardFailure || runtimeError;
      if (
        guardRequired &&
        child.exitCode == null &&
        child.signalCode == null
      ) {
        child.kill("SIGTERM");
      }
    });
    outcome = await childOutcome;
  } catch (error) {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill("SIGTERM");
    }
    await childOutcome.catch(() => {});
    outcome = {
      code: 1,
      signal: null,
      error: String(error?.message || error),
    };
  } finally {
    playwrightSettled = true;
    process.removeListener("SIGINT", forwardSigint);
    process.removeListener("SIGTERM", forwardSigterm);
    if (sleepGuard) {
      const finalGuardSnapshot = await sleepGuard.close();
      runnerReport.sleep_guard = finalGuardSnapshot;
      const cleanupError = sleepGuardCleanupError(finalGuardSnapshot);
      if (cleanupError && guardRequired) {
        guardFailure = guardFailure || cleanupError;
      }
    }
  }
  if (guardFailure && guardRequired) {
    outcome = {
      code: 1,
      signal: outcome?.signal || null,
      error: [guardFailure, outcome?.error].filter(Boolean).join("; "),
    };
  }

  const finishedAt = Date.now();
  writeJson(runnerReportPath, {
    ...runnerReport,
    status: outcome.code === 0 ? "passed" : "failed",
    exit_code: outcome.code,
    signal: outcome.signal || null,
    error: outcome.error || null,
    finished_at: new Date(finishedAt).toISOString(),
    wall_time_ms: finishedAt - startedAt,
  });
  if (outcome.code !== 0) process.exitCode = outcome.code || 1;
};

if (path.resolve(process.argv[1] || "") === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack || error)}\n`);
    process.exitCode = 1;
  });
}

export {
  parseArgs,
  prepareIsolatedHome,
  resolvePython,
  usage,
};
