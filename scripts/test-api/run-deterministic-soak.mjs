#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  SOAK_AGENT_MAX_ITERATIONS,
  buildSoakRecipe,
  buildSubagentTemplates,
  resolveSoakProfile,
} = require("./deterministic-soak-lib.cjs");
const {
  requiresSleepGuard,
  sleepGuardCleanupError,
  sleepGuardRuntimeError,
  sleepGuardStartupError,
  startSleepGuard,
} = require("./deterministic-soak-runner-lib.cjs");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

const usage =
  () => `Usage: node scripts/test-api/run-deterministic-soak.mjs [options]

Options:
  --profile quick|full   quick is ~2 minutes; full is exactly 20 minutes
  --report-dir PATH      output directory for report and JSONL audits
  --python PATH          Python interpreter containing the mcp package
  --web-port PORT        isolated React dev-server port (default 2917)
  --multi-agent-only     run only the focused three-chat child-agent boundary suite
  --headed               show the Electron window while running
  --help                 show this help
`;

const parseArgs = (argv) => {
  const options = {
    profile: "quick",
    reportDir: "",
    python: "",
    webPort: "2917",
    headed: false,
    multiAgentOnly: false,
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
    if (arg === "--multi-agent-only") {
      options.multiAgentOnly = true;
      continue;
    }
    if (
      !["--profile", "--report-dir", "--python", "--web-port"].includes(arg)
    ) {
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

const pythonCandidates = (explicit) => {
  const candidates = [
    explicit,
    process.env.PUPU_SOAK_PYTHON,
    path.resolve(REPO_ROOT, "../unchain/.venv/bin/python"),
    path.resolve(REPO_ROOT, "../unchain/.venv/Scripts/python.exe"),
    "python3",
    "python",
  ];
  return [...new Set(candidates.filter(Boolean))];
};

const resolvePython = (explicit) => {
  const failures = [];
  for (const candidate of pythonCandidates(explicit)) {
    const probe = spawnSync(
      candidate,
      ["-c", "import sys,mcp; print(sys.executable)"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 15000 },
    );
    if (probe.status === 0 && probe.stdout.trim()) {
      // Keep the virtualenv entry point instead of resolving its Python
      // symlink to the base interpreter (which drops the venv site-packages).
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
    "deterministic-soak",
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
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(recipeDir, "Default.recipe"),
    `${JSON.stringify(buildSoakRecipe(), null, 2)}\n`,
    "utf8",
  );
  return subagentDir;
};

const writeRunnerReport = (reportPath, payload) => {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
  const profile = resolveSoakProfile(options.profile);
  const reportDir = path.resolve(
    options.reportDir || defaultReportDir(profile.name),
  );
  fs.mkdirSync(reportDir, { recursive: true });
  const homeDir = path.join(reportDir, "isolated-home");
  const subagentDir = prepareIsolatedHome(homeDir);
  const pythonPath = resolvePython(options.python);
  const fakeAuditPath = path.join(reportDir, "fake-llm-audit.jsonl");
  const mcpAuditPath = path.join(reportDir, "mcp-audit.jsonl");
  const soakReportPath = path.join(reportDir, "soak-report.json");
  const runnerReportPath = path.join(reportDir, "runner-report.json");
  const playwrightCli = require.resolve("@playwright/test/cli");
  const playwrightArgs = [
    playwrightCli,
    "test",
    "e2e/pupu-deterministic-soak.spec.js",
    "--workers=1",
  ];
  if (options.headed) playwrightArgs.push("--headed");

  const startedAt = Date.now();
  const runnerReport = {
    schema_version: 1,
    kind: "pupu-deterministic-soak-runner",
    profile: profile.name,
    mode: options.multiAgentOnly ? "multi-agent-only" : "full-control-paths",
    target_duration_ms: profile.targetDurationMs,
    started_at: new Date(startedAt).toISOString(),
    status: "running",
    report_dir: reportDir,
    soak_report_path: soakReportPath,
    fake_llm_audit_path: fakeAuditPath,
    mcp_audit_path: mcpAuditPath,
    isolated_home: homeDir,
    subagent_dir: subagentDir,
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
  writeRunnerReport(runnerReportPath, runnerReport);
  process.stdout.write(
    `${JSON.stringify({
      ready: true,
      profile: profile.name,
      mode: runnerReport.mode,
      target_duration_ms: profile.targetDurationMs,
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
      PUPU_DETERMINISTIC_SOAK: "1",
      PUPU_SOAK_PROFILE: profile.name,
      PUPU_SOAK_MULTI_AGENT_ONLY: options.multiAgentOnly ? "1" : "0",
      PUPU_SOAK_REPORT_DIR: reportDir,
      PUPU_SOAK_REPORT_PATH: soakReportPath,
      PUPU_FAKE_LLM_AUDIT_PATH: fakeAuditPath,
      PUPU_SOAK_AUDIT_PATH: mcpAuditPath,
      PUPU_SOAK_TIME_SCALE:
        process.env.PUPU_SOAK_TIME_SCALE || String(profile.timeScale),
      PUPU_SOAK_PYTHON: pythonPath,
      // Two turns are sufficient for every root phase. The max-iteration
      // child deliberately spends both on fixed probes, proving it cannot
      // borrow the root continuation callback.
      UNCHAIN_MAX_ITERATIONS: String(SOAK_AGENT_MAX_ITERATIONS),
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
    writeRunnerReport(runnerReportPath, runnerReport);

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
  writeRunnerReport(runnerReportPath, {
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

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
