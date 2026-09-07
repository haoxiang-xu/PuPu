#!/usr/bin/env node
// Windows installed-candidate Vault sink matrix (issue #195, phase 2 step 6).
//
// Drives the INSTALLED PuPu candidate (NSIS install, not win-unpacked) as the
// real parent process: deposits synthetic secrets through the real Vault
// bridge, makes a loopback deterministic provider call the `shell` tool with
// secret_env / secret_stdin handles and a local fake MCP tool with an
// x-pupu-secret field, answers the durable confirmation, drives the native
// "Allow secret use?" dialog with UI Automation, injects faults (nonzero exit,
// timeout, native cancel, renderer deny, worker / supervisor / parent kill),
// runs a 100-cycle mix, and records process-tree survivors, delayed sentinel
// files, handle growth and a secret-material scan.
//
// Mechanics (launch / CDP / stream / taskkill) mirror the probes Codex ran on
// the same candidate (probe-packaged-*.mjs). The cell semantics live in
// windows-installed-sink-matrix-lib.mjs; the evidence is re-checked by
// verify-windows-installed-sink-evidence.mjs before this script exits.
//
// Usage:
//   node scripts/release-qa/windows-installed-sink-matrix.mjs \
//     --candidate-dir <fixed candidate dir> \
//     --candidate-evidence <candidate-build-evidence.json> \
//     [--installed-root %LOCALAPPDATA%\Programs\PuPu] [--cycles 100] [--seed 195] \
//     [--out-root <dir>] [--python python] [--max-handle-growth 300] [--skip-protocol]

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  CELL_CATALOG,
  CYCLE_POOL,
  buildCycleSchedule,
  buildEvidence,
  buildTextSse,
  buildToolCallSse,
  emptyObserved,
  evaluateCell,
  evaluateHandleGrowth,
  scanForSecrets,
  secretVariantsFor,
} from "./windows-installed-sink-matrix-lib.mjs";
import { loadExpectedIdentity, verifyInstalledSinkEvidence } from "./verify-windows-installed-sink-evidence.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

if (process.platform !== "win32") {
  console.error("[installed-sink-matrix] this harness requires Windows x64 with the installed candidate");
  process.exit(2);
}

const { chromium } = require("playwright");
const asar = require("@electron/asar");
const { buildCustomProviderDefinition, CUSTOM_MODEL_ID } = require(
  path.join(ROOT, "scripts", "test-api", "deterministic-soak-lib.cjs"),
);
let sqlite = null;
try {
  sqlite = process.getBuiltinModule("node:sqlite");
} catch (_error) {
  sqlite = null;
}
if (!sqlite) {
  console.error("[installed-sink-matrix] node:sqlite is required (Node 22.5+)");
  process.exit(2);
}

// ---- arguments -----------------------------------------------------------------

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[value.slice(2)] = next;
      index += 1;
    } else {
      args[value.slice(2)] = true;
    }
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const candidateDir = path.resolve(String(args["candidate-dir"] || ""));
const candidateEvidencePath = path.resolve(String(args["candidate-evidence"] || ""));
const installedRoot = path.resolve(
  String(args["installed-root"] || path.join(process.env.LOCALAPPDATA || "", "Programs", "PuPu")),
);
const cycles = Number(args.cycles || 100);
const seed = Number(args.seed || 195);
const python = String(args.python || "python");
const maxHandleGrowth = Number(args["max-handle-growth"] || 300);
const skipProtocol = args["skip-protocol"] === true;
if (!args["candidate-dir"] || !args["candidate-evidence"]) {
  console.error(
    "usage: windows-installed-sink-matrix.mjs --candidate-dir <dir> --candidate-evidence <json> [options]",
  );
  process.exit(2);
}

// ---- evidence directory ---------------------------------------------------------

const outRoot = path.resolve(String(args["out-root"] || candidateDir));
const evidenceDir = fs.mkdtempSync(path.join(outRoot, "installed-sink-matrix-"));
const profileDir = path.join(evidenceDir, "安装态 sink 矩阵 profile");
const sentinelDir = path.join(evidenceDir, "sentinels with space");
const mcpReceiptFile = path.join(evidenceDir, "mcp-receipts.txt");
fs.mkdirSync(profileDir, { recursive: true });
fs.mkdirSync(sentinelDir, { recursive: true });
fs.writeFileSync(mcpReceiptFile, "", "utf8");
const harnessLogPath = path.join(evidenceDir, "harness.log");
const harnessLog = fs.openSync(harnessLogPath, "a");
const startedAt = Date.now();
const log = (...parts) => {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}`;
  console.log(line);
  fs.writeSync(harnessLog, `${line}\n`);
};
log("evidence directory:", evidenceDir);

// ---- identity ---------------------------------------------------------------------

const sha256File = (file) =>
  `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;

const installedExe = path.join(installedRoot, "PuPu.exe");
const installedAsar = path.join(installedRoot, "resources", "app.asar");
const installedSidecar = path.join(
  installedRoot,
  "resources",
  "unchain_runtime",
  "dist",
  "windows",
  "unchain-server.exe",
);
for (const file of [installedExe, installedAsar, installedSidecar]) {
  if (!fs.existsSync(file)) {
    console.error(`[installed-sink-matrix] installed candidate file is missing: ${file}`);
    process.exit(2);
  }
}
const artifactEvidencePath = path.join(candidateDir, "unchain-artifact", "unchain-artifact.json");
const expectedIdentity = loadExpectedIdentity({ candidateEvidencePath, artifactEvidencePath });
const installerFile = fs
  .readdirSync(path.join(candidateDir, "electron"))
  .filter((name) => name.endsWith("-setup.exe"))
  .map((name) => path.join(candidateDir, "electron", name))[0];
if (!installerFile) {
  console.error("[installed-sink-matrix] candidate installer (*-setup.exe) not found");
  process.exit(2);
}
const embeddedIdentity = JSON.parse(
  asar.extractFile(installedAsar, "build/unchain-artifact-identity.v1.json").toString("utf8"),
);
const identity = {
  pupu_revision: expectedIdentity.pupu_revision,
  unchain_revision: expectedIdentity.unchain_revision,
  installer_sha256: sha256File(installerFile),
  installed_app_sha256: sha256File(installedExe),
  installed_asar_sha256: sha256File(installedAsar),
  installed_sidecar_sha256: sha256File(installedSidecar),
  wheel_sha256: embeddedIdentity.unchain_wheel_sha256,
  runtime_manifest_digest: embeddedIdentity.runtime_manifest_digest,
};
if (embeddedIdentity.sidecar_sha256 !== identity.installed_sidecar_sha256) {
  console.error("[installed-sink-matrix] installed sidecar bytes do not match the embedded identity");
  process.exit(1);
}
log("identity:", JSON.stringify(identity));

// ---- process helpers (Windows) -------------------------------------------------------

const powershell = (script, { timeoutMs = 30000 } = {}) => {
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: timeoutMs },
  );
  if (result.status !== 0) {
    throw new Error(`powershell failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
};

const listProcesses = () => {
  const raw = powershell(
    "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress",
  );
  const value = raw ? JSON.parse(raw) : [];
  return (Array.isArray(value) ? value : [value]).map((entry) => ({
    pid: Number(entry.ProcessId),
    ppid: Number(entry.ParentProcessId),
    name: String(entry.Name || ""),
    commandLine: String(entry.CommandLine || ""),
  }));
};

const descendantsOf = (processes, rootPid) => {
  const byParent = new Map();
  for (const entry of processes) {
    if (!byParent.has(entry.ppid)) byParent.set(entry.ppid, []);
    byParent.get(entry.ppid).push(entry);
  }
  const out = [];
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    for (const child of byParent.get(current) || []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      out.push(child);
      stack.push(child.pid);
    }
  }
  return out;
};

const isVaultChild = (entry) =>
  /--vault-sink-(worker|supervisor)\b/.test(entry.commandLine);
const isFakeMcp = (entry) => entry.commandLine.includes("fake-secret-mcp-server.mjs");
const isMainSidecar = (entry) =>
  /unchain-server\.exe/i.test(entry.name) && !isVaultChild(entry);

// Survivors: anything the harness introduced that should be gone once a cell
// settled. Legitimate long-lived children (Electron helpers, the main sidecar,
// the fake MCP server) are excluded; every vault worker/supervisor and every
// shell descendant that mentions the harness paths counts.
const survivorsFor = (processes, appPid) => {
  const marks = [sentinelDir, "--vault-sink-worker", "--vault-sink-supervisor"];
  const descendants = appPid ? descendantsOf(processes, appPid) : [];
  const survivors = [];
  for (const entry of descendants) {
    if (/^PuPu\.exe$/i.test(entry.name)) continue;
    if (isMainSidecar(entry) || isFakeMcp(entry)) continue;
    survivors.push(entry);
  }
  for (const entry of processes) {
    if (survivors.some((known) => known.pid === entry.pid)) continue;
    if (marks.some((mark) => entry.commandLine.includes(mark))) survivors.push(entry);
  }
  return survivors.map((entry) => ({ pid: entry.pid, name: entry.name }));
};

const taskkill = (pid, tree = false) => {
  spawnSync("taskkill", ["/PID", String(pid), ...(tree ? ["/T"] : []), "/F"], { windowsHide: true });
};

const handlesOf = (pid) => {
  if (!pid) return null;
  try {
    const raw = powershell(`(Get-Process -Id ${pid} -ErrorAction Stop).Handles`);
    return Number(raw);
  } catch (_error) {
    return null;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

// ---- loopback provider ------------------------------------------------------------------

const providerState = {
  plan: null, // { name, argumentsObject, cellId }
  requests: [],
  cellRequests: 0,
  advertisedTools: new Set(),
};

const providerServer = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/v1/models") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ object: "list", data: [{ id: "pupu-fake-responses-v1", object: "model" }] }));
    return;
  }
  if (request.method !== "POST" || !/\/v1\/responses$/.test(request.url || "")) {
    response.writeHead(404);
    response.end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_error) {
    response.writeHead(400);
    response.end();
    return;
  }
  providerState.requests.push(bodyText);
  providerState.cellRequests += 1;
  for (const tool of Array.isArray(body.tools) ? body.tools : []) {
    if (tool && typeof tool.name === "string") providerState.advertisedTools.add(tool.name);
  }
  const responseId = `resp_sink_${crypto.randomBytes(6).toString("hex")}`;
  const model = String(body.model || CUSTOM_MODEL_ID);
  const hasToolOutput = (Array.isArray(body.input) ? body.input : []).some(
    (item) => item && item.type === "function_call_output",
  );
  const plan = providerState.plan;
  let sse;
  if (!plan || hasToolOutput) {
    sse = buildTextSse({ responseId, model, text: `SINK_CELL_DONE ${plan ? plan.cellId : "none"}` });
  } else {
    sse = buildToolCallSse({
      responseId,
      model,
      callId: `call_${crypto.randomBytes(6).toString("hex")}`,
      name: plan.name,
      argumentsObject: plan.argumentsObject,
    });
  }
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.end(sse);
});
await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
const providerBaseUrl = `http://127.0.0.1:${providerServer.address().port}/v1`;
const customProvider = buildCustomProviderDefinition(providerBaseUrl);
log("loopback provider:", providerBaseUrl);

// ---- app lifecycle ----------------------------------------------------------------------

let app = null; // { child, browser, page, pid, logFd }

const findMainSidecarPid = () => {
  if (!app) return null;
  const entry = descendantsOf(listProcesses(), app.pid).find(isMainSidecar);
  return entry ? entry.pid : null;
};

const launch = async (label) => {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: "production", PUPU_TEST_API_DISABLE: "1" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PUPU_MEMORY_V2") || ["PUPU_FEATURE_MEMORY_V2", "ELECTRON_RUN_AS_NODE", "UNCHAIN_DATA_DIR"].includes(key)) {
      delete env[key];
    }
  }
  const logFd = fs.openSync(path.join(evidenceDir, `app-${label}.log`), "w");
  const child = spawn(installedExe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`], {
    env,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });
  const deadline = Date.now() + 90000;
  let browser = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`app exited ${child.exitCode} during launch ${label}`);
    try {
      if (!browser) browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 });
      const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) =>
        candidate.url().startsWith("file:"),
      );
      if (page) {
        const status = await page.evaluate(async () =>
          window.unchainAPI ? await window.unchainAPI.getStatus() : null,
        );
        if (status?.status === "ready") {
          if (
            status.memoryV2?.ready !== true ||
            status.memoryV2?.windowsCapability?.status !== "ready" ||
            status.memoryV2?.platformActiveBlocked !== false
          ) {
            throw new Error(`installed candidate is not Active-ready: ${JSON.stringify(status.memoryV2)}`);
          }
          app = { child, browser, page, pid: child.pid, logFd, status };
          log(`launched ${label}: pid ${child.pid}, rollout ${status.memoryV2.rolloutMode}`);
          return page;
        }
      }
    } catch (error) {
      if (String(error.message).includes("Active-ready")) throw error;
    }
    await sleep(500);
  }
  throw new Error(`startup timeout during launch ${label}`);
};

const closeApp = async ({ graceful }) => {
  if (!app) return { graceful: false };
  const { child, browser, page, pid, logFd } = app;
  let exitedGracefully = false;
  if (graceful) {
    try {
      await page.evaluate(() => window.windowStateAPI?.close?.());
    } catch (_error) {
      // The window may already be gone.
    }
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        exitedGracefully = true;
        break;
      }
      await sleep(250);
    }
  }
  await browser?.close().catch(() => {});
  if (child.exitCode === null) taskkill(pid, true);
  await sleep(1500);
  fs.closeSync(logFd);
  app = null;
  return { graceful: exitedGracefully };
};

// ---- vault + chat primitives ---------------------------------------------------------------

const synthetic = Object.fromEntries(
  ["shell_secret_env", "shell_secret_stdin", "mcp_schema_secret"].map((kind) => [
    kind,
    `PUPU-SINK-${crypto.randomBytes(24).toString("base64url")}`,
  ]),
);
const syntheticDigest = Object.fromEntries(
  Object.entries(synthetic).map(([kind, value]) => [
    kind,
    crypto.createHash("sha256").update(value, "utf8").digest("hex"),
  ]),
);

const depositAndGrant = async (page, { chatId, kind }) => {
  const plaintext = synthetic[kind];
  const result = await page.evaluate(
    async ({ chatId: scopeId, kind: sinkKind, plaintext: secret, nonce }) => {
      const deposit = await window.memoryVaultAPI.deposit({
        operationId: `sink-deposit-${nonce}`,
        scopeKind: "chat",
        scopeId,
        label: `Sink matrix ${sinkKind}`,
        plaintext: secret,
      });
      const handle = deposit?.handle || deposit?.descriptor?.handle;
      if (!handle) throw new Error(`deposit returned no handle: ${JSON.stringify(deposit)}`);
      const grant = await window.memoryVaultAPI.grant({
        operationId: `sink-grant-${nonce}`,
        scopeKind: "chat",
        scopeId,
        handle,
        sinkKind,
      });
      return { handle, grant };
    },
    { chatId, kind, plaintext, nonce: crypto.randomBytes(8).toString("hex") },
  );
  return result.handle;
};

const mcpToolkitId = "mcp.custom.pupu_sink_matrix";
const installFakeMcp = async (page) => {
  const serverPath = path.join(HERE, "fixtures", "fake-secret-mcp-server.mjs");
  const outcome = await page.evaluate(
    async ({ command, args: serverArgs, toolkitId, workspaceRoot }) =>
      window.unchainAPI.installMcpToolkit({
        entryId: "custom",
        workspaceRoot,
        customRecipe: {
          toolkit_id: toolkitId,
          toolkit_name: "Sink Matrix",
          mcp: { transport: "stdio", command, args: serverArgs },
        },
      }),
    {
      command: process.execPath,
      args: [serverPath, "--receipt-file", mcpReceiptFile],
      toolkitId: mcpToolkitId,
      workspaceRoot: evidenceDir,
    },
  );
  log("fake MCP toolkit installed:", JSON.stringify(outcome).slice(0, 300));
};

const mcpReceiptCount = () =>
  fs.readFileSync(mcpReceiptFile, "utf8").split("\n").filter(Boolean).length;

// Start a stream and expose its lifecycle on window.__sinkMatrix so the
// harness can poll it across confirmation and fault injection.
const startStream = async (page, payload) => {
  await page.evaluate((streamPayload) => {
    const state = { events: [], done: null, error: null, failed: null };
    window.__sinkMatrix = state;
    state.handle = window.unchainAPI.startStreamV4(streamPayload, {
      onRuntimeEvent: (event) => {
        state.events.push(event);
        if (event?.type === "run.failed") state.failed = event.payload || {};
      },
      onError: (error) => {
        state.error = error || {};
      },
      onDone: (done) => {
        state.done = done || {};
      },
    });
  }, payload);
};

const streamSnapshot = (page) =>
  page.evaluate(() => {
    const state = window.__sinkMatrix || {};
    return {
      done: state.done,
      error: state.error,
      failed: state.failed,
      events: state.events || [],
    };
  });

const pendingInteraction = (page, sessionId) =>
  page.evaluate((id) => window.unchainAPI.getPendingInteraction({ session_id: id }), sessionId);

const runNativeConfirm = ({ action, timeoutMs }) =>
  new Promise((resolve) => {
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(HERE, "windows-native-confirm.ps1"),
        "-Action",
        action,
        "-TimeoutMs",
        String(timeoutMs),
        "-OwnerPid",
        String(app?.pid || 0),
      ],
      { windowsHide: true },
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split("\n").at(-1));
      } catch (_error) {
        parsed = null;
      }
      resolve({ code, found: parsed?.found === true, action, raw: parsed });
    });
  });

// Normalize the vault_sink_use tool result out of the runtime events.
const findToolResult = (events) => {
  let found = null;
  const walk = (value) => {
    if (found || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value.vault_intent_id === "string" && value.ok === true) {
      found = {
        ok: true,
        denied: false,
        receipt_id: String(value.receipt_id || ""),
        exit_category: value.result?.exit_category ?? null,
        returncode: value.result?.returncode ?? null,
        error: null,
      };
      return;
    }
    if (value.denied === true && typeof value.error === "string") {
      found = { ok: false, denied: true, receipt_id: null, exit_category: null, returncode: null, error: value.error };
      return;
    }
    if (value.ok === false && typeof value.error === "string" && value.error.startsWith("vault_")) {
      found = { ok: false, denied: false, receipt_id: null, exit_category: null, returncode: null, error: value.error };
      return;
    }
    for (const nested of Object.values(value)) walk(nested);
  };
  walk(events);
  return found;
};

// ---- vault database reads (read-only) ---------------------------------------------------------

const openVaultDb = () => new sqlite.DatabaseSync(path.join(profileDir, "settings.db"), { readOnly: true });

const readIntent = (interactionId) => {
  const db = openVaultDb();
  try {
    const intent = db
      .prepare("SELECT status, sink_kind FROM vault_use_intents WHERE interaction_id = ?")
      .get(interactionId);
    const receipt = db
      .prepare(
        "SELECT r.status AS status, r.outcome_code AS outcome_code FROM vault_use_receipts r " +
          "JOIN vault_use_intents i ON i.intent_id = r.intent_id WHERE i.interaction_id = ?",
      )
      .get(interactionId);
    return {
      intent: intent ? { status: String(intent.status), sink_kind: String(intent.sink_kind) } : null,
      receipt: receipt ? { status: String(receipt.status), outcome_code: String(receipt.outcome_code) } : null,
    };
  } finally {
    db.close();
  }
};

const countReceipts = () => {
  const db = openVaultDb();
  try {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM vault_use_receipts").get().n);
  } finally {
    db.close();
  }
};

// ---- cell execution ----------------------------------------------------------------------------

const catalogById = new Map(CELL_CATALOG.map((cell) => [cell.id, cell]));

const shellCommandFor = (cell, { sentinelPath, plaintextLength }) => {
  switch (cell.id) {
    case "env.success":
    case "env.cold_restart_then_success":
      return `powershell -NoProfile -Command "if($env:TOKEN.Length -eq ${plaintextLength}){'ok'}else{exit 9}"`;
    case "stdin.success":
      return `powershell -NoProfile -Command "$i=[Console]::In.ReadToEnd(); if($i.Length -eq ${plaintextLength}){'ok'}else{exit 9}"`;
    case "env.nonzero":
      return "cmd /c exit 7";
    case "stdin.timeout":
      return `cmd /c ping -n 6 127.0.0.1 >nul & echo late> "${sentinelPath}"`;
    case "env.native_cancel":
    case "env.renderer_deny":
      return "cmd /c echo never";
    case "stdin.kill_worker":
    case "env.kill_supervisor":
      return `cmd /c ping -n 12 127.0.0.1 >nul & echo late> "${sentinelPath}"`;
    default:
      throw new Error(`no shell command for ${cell.id}`);
  }
};

const advertisedMcpToolName = () => {
  const names = [...providerState.advertisedTools];
  return names.find((name) => name === "use_token" || name.endsWith("use_token") || name.endsWith(".use_token")) || null;
};

const runCell = async (cell, { cycle = null } = {}) => {
  const runId = `${cell.id.replace(/\./g, "-")}-${cycle === null ? "cell" : `cycle${cycle}`}-${crypto.randomBytes(3).toString("hex")}`;
  const chatId = `sink-${runId}`;
  const sentinelPath = path.join(sentinelDir, `${runId}.txt`);
  const observed = { ...emptyObserved(), survivors: 0, sentinelPresent: false, providerCalls: 0, workerSpawned: false };
  const notes = [];
  let page = app.page;
  let interactionId = null;
  let mcpBefore = null;

  const handle = await depositAndGrant(page, { chatId, kind: cell.kind });
  const plaintextLength = synthetic[cell.kind].length;

  let toolName;
  let argumentsObject;
  if (cell.kind === "mcp_schema_secret") {
    toolName = advertisedMcpToolName() || "use_token";
    argumentsObject = { token: handle, note: `cell ${cell.id} ${runId}` };
    mcpBefore = mcpReceiptCount();
  } else {
    toolName = "shell";
    argumentsObject = {
      action: "run",
      command: shellCommandFor(cell, { sentinelPath, plaintextLength }),
      timeout_ms: cell.id === "stdin.timeout" ? 1000 : 60000,
      run_in_background: false,
      ...(cell.kind === "shell_secret_env" ? { secret_env: { TOKEN: handle } } : { secret_stdin: handle }),
    };
  }
  providerState.plan = { name: toolName, argumentsObject, cellId: cell.id };
  providerState.cellRequests = 0;

  const receiptRowsBefore = cell.id === "env.cold_restart_then_success" ? countReceipts() : null;
  const payload = {
    message: `Sink matrix ${cell.id} (${runId}). Call the tool exactly as planned, then finish.`,
    threadId: chatId,
    owner_chat_id: chatId,
    memory_v2_requested: true,
    attempt_id: `sink-attempt-${runId}`,
    options: {
      modelId: CUSTOM_MODEL_ID,
      custom_provider: customProvider,
      custom_provider_api_key: "pupu-fixture-key",
      memory_enabled: true,
      memory_long_term_enabled: false,
      mode: "normal",
      toolkits: [
        { id: "core", enabled_tools: null },
        { id: mcpToolkitId, enabled_tools: null },
      ],
    },
  };
  await startStream(page, payload);

  // 1. Wait for the vault_sink_use confirmation to become pending.
  const pendingDeadline = Date.now() + 45000;
  let pending = null;
  while (Date.now() < pendingDeadline) {
    const snapshot = await streamSnapshot(page);
    if (snapshot.done || snapshot.error || snapshot.failed) break;
    pending = await pendingInteraction(page, chatId);
    if (pending?.status === "awaiting_response" && pending.interaction_id) break;
    pending = null;
    await sleep(250);
  }
  if (!pending) {
    const snapshot = await streamSnapshot(page);
    observed.streamStatus = snapshot.done ? "done" : snapshot.failed ? "failed" : "error";
    observed.toolResult = findToolResult(snapshot.events);
    observed.providerCalls = providerState.cellRequests;
    observed.intent = null;
    observed.dialog = { found: false, action: "Probe" };
    notes.push("no vault_sink_use confirmation became pending");
    const processesNow = listProcesses();
    observed.survivors = survivorsFor(processesNow, app.pid).length;
    observed.mcpReceiptCount = cell.kind === "mcp_schema_secret" ? mcpReceiptCount() - mcpBefore : null;
    return { observed, notes, runId, interactionId: null };
  }
  interactionId = pending.interaction_id;

  // 2. Answer the durable confirmation; drive the native dialog concurrently.
  const approved = cell.fault !== "renderer_deny";
  const dialogAction = cell.fault === "native_cancel" ? "Cancel" : approved ? "Allow" : "Probe";
  const confirmPromise = page
    .evaluate(
      ({ confirmationId, sessionId, approve }) =>
        window.unchainAPI.respondToolConfirmation({
          confirmation_id: confirmationId,
          approved: approve,
          session_id: sessionId,
        }),
      { confirmationId: interactionId, sessionId: chatId, approve: approved },
    )
    .then((result) => ({ ok: true, result }))
    .catch((error) => ({ ok: false, error: String(error?.message || error) }));
  const dialogPromise = runNativeConfirm({
    action: dialogAction,
    timeoutMs: dialogAction === "Probe" ? 2000 : 20000,
  });

  // 3. Fault injection while the worker runs.
  let workerSpawned = false;
  let killed = false;
  const watchDeadline = Date.now() + 30000;
  const killTarget =
    cell.fault === "kill_worker" ? "--vault-sink-worker" : cell.fault === "kill_supervisor" ? "--vault-sink-supervisor" : null;
  const [dialog, confirmation] = await Promise.all([
    dialogPromise,
    (async () => {
      if (dialogAction === "Probe") return confirmPromise;
      // Watch for worker spawn until the stream settles or the deadline passes.
      while (Date.now() < watchDeadline) {
        const processes = listProcesses();
        const vaultChildren = descendantsOf(processes, app.pid).filter(isVaultChild);
        if (vaultChildren.some((entry) => entry.commandLine.includes("--vault-sink-worker"))) workerSpawned = true;
        if (killTarget && !killed) {
          const target = vaultChildren.find((entry) => entry.commandLine.includes(killTarget));
          if (target) {
            await sleep(300);
            taskkill(target.pid, false);
            killed = true;
            log(`${cell.id}: killed ${killTarget} pid ${target.pid}`);
          }
        }
        if (cell.fault === "kill_parent" && workerSpawned && !killed) {
          await sleep(300);
          killed = true;
          log(`${cell.id}: killing parent PuPu.exe pid ${app.pid}`);
          taskkill(app.pid, true);
          return { ok: false, error: "parent_killed" };
        }
        const snapshot = await streamSnapshot(page).catch(() => null);
        if (!snapshot || snapshot.done || snapshot.error || snapshot.failed) break;
        await sleep(200);
      }
      return confirmPromise;
    })(),
  ]);
  observed.dialog = { found: dialog.found, action: dialogAction };
  observed.workerSpawned = workerSpawned;
  if (confirmation && confirmation.ok === false && confirmation.error !== "parent_killed") {
    notes.push(`respondToolConfirmation: ${confirmation.error}`);
  }

  // 4. Settle.
  if (cell.fault === "kill_parent") {
    await sleep(2000);
    await closeApp({ graceful: false }).catch(() => {});
    const processesAfterKill = listProcesses();
    const survivorsAfterKill = survivorsFor(processesAfterKill, null);
    observed.streamStatus = "interrupted";
    observed.toolResult = null;
    observed.providerCalls = providerState.cellRequests;
    page = await launch(`relaunch-${runId}`);
    await sleep(2000);
    const revived = await pendingInteraction(page, chatId).catch(() => null);
    observed.pendingRevived =
      revived?.status === "awaiting_response" && revived.interaction_id === interactionId;
    const rows = readIntent(interactionId);
    observed.intent = rows.intent;
    observed.receipt = rows.receipt;
    observed.mcpReceiptCount = mcpReceiptCount() - mcpBefore;
    const processesNow = listProcesses();
    observed.survivors = survivorsAfterKill.length + survivorsFor(processesNow, app.pid).length;
    observed.sentinelPresent = fs.existsSync(sentinelPath);
    return { observed, notes, runId, interactionId };
  }

  const settleDeadline = Date.now() + 90000;
  let snapshot = await streamSnapshot(page);
  while (Date.now() < settleDeadline && !(snapshot.done || snapshot.error || snapshot.failed)) {
    await sleep(300);
    snapshot = await streamSnapshot(page);
  }
  observed.streamStatus = snapshot.done ? "done" : snapshot.failed ? "failed" : snapshot.error ? "error" : "error";
  if (!(snapshot.done || snapshot.error || snapshot.failed)) notes.push("stream did not settle within 90s");
  observed.toolResult = findToolResult(snapshot.events);
  observed.providerCalls = providerState.cellRequests;
  const rows = readIntent(interactionId);
  observed.intent = rows.intent;
  observed.receipt = rows.receipt;
  observed.mcpReceiptCount = cell.kind === "mcp_schema_secret" ? mcpReceiptCount() - mcpBefore : null;
  if (cell.sentinel) await sleep(9000);
  else await sleep(1000);
  observed.sentinelPresent = fs.existsSync(sentinelPath);
  observed.survivors = survivorsFor(listProcesses(), app.pid).length;
  if (cell.id === "env.cold_restart_then_success") {
    observed.receiptRowsBefore = receiptRowsBefore;
    observed.receiptRowsAfter = countReceipts();
  }
  return { observed, notes, runId, interactionId };
};

// ---- main -------------------------------------------------------------------------------------------

const cellRecords = [];
const cycleFailures = [];
const handleSamples = [];
let survivorsTotal = 0;
let sentinelsTotal = 0;
let protocol = { oversize: "NOT_RUN", bad_frame: "NOT_RUN", evidence_path: "sidecar-supervisor-probe.json" };
let exitCode = 1;

const recordCell = (cell, run) => {
  const verdict = evaluateCell({ cell, observed: run.observed });
  const record = {
    id: cell.id,
    kind: cell.kind,
    status: verdict.pass ? "PASS" : "FAIL",
    reasons: [...verdict.reasons, ...run.notes],
    observed: run.observed,
  };
  cellRecords.push(record);
  log(`cell ${cell.id}: ${record.status}${record.reasons.length ? ` — ${record.reasons.join("; ")}` : ""}`);
  fs.writeFileSync(path.join(evidenceDir, `cell-${cell.id}.json`), JSON.stringify({ ...record, runId: run.runId, interactionId: run.interactionId }, null, 2));
};

try {
  let page = await launch("initial");
  await installFakeMcp(page);
  // Warm the provider once so the advertised tool names (including the MCP
  // tool's exact name) are known before the MCP cells run.
  providerState.plan = null;
  await startStream(page, {
    message: "Sink matrix warm-up.",
    threadId: "sink-warmup",
    owner_chat_id: "sink-warmup",
    memory_v2_requested: true,
    attempt_id: `sink-warmup-${crypto.randomBytes(4).toString("hex")}`,
    options: {
      modelId: CUSTOM_MODEL_ID,
      custom_provider: customProvider,
      custom_provider_api_key: "pupu-fixture-key",
      memory_enabled: true,
      memory_long_term_enabled: false,
      mode: "normal",
      toolkits: [
        { id: "core", enabled_tools: null },
        { id: mcpToolkitId, enabled_tools: null },
      ],
    },
  });
  {
    const deadline = Date.now() + 45000;
    let snapshot = await streamSnapshot(page);
    while (Date.now() < deadline && !(snapshot.done || snapshot.error || snapshot.failed)) {
      await sleep(300);
      snapshot = await streamSnapshot(page);
    }
    log("warm-up advertised tools:", JSON.stringify([...providerState.advertisedTools]));
    if (!advertisedMcpToolName()) log("WARNING: fake MCP tool was not advertised; mcp cells will fail closed");
  }

  // Catalog cells, in order. The parent-kill and cold-restart cells manage
  // their own relaunch; everything else runs on the current app.
  for (const cell of CELL_CATALOG) {
    if (cell.id === "env.cold_restart_then_success") {
      const closed = await closeApp({ graceful: true });
      log(`graceful exit before cold restart: ${closed.graceful}`);
      page = await launch("cold-restart");
    }
    const run = await runCell(cell);
    if (cell.id === "env.cold_restart_then_success" && !run.observed.receiptRowsBefore && run.observed.receiptRowsBefore !== 0) {
      run.notes.push("receipt rows before restart were not read");
    }
    recordCell(cell, run);
  }

  // 100-cycle mix on the app that survived the catalog.
  const schedule = buildCycleSchedule({ cycles, seed });
  fs.writeFileSync(path.join(evidenceDir, "cycle-schedule.json"), JSON.stringify(schedule));
  let sidecarPid = findMainSidecarPid();
  for (let index = 0; index < schedule.length; index += 1) {
    const cell = catalogById.get(schedule[index]);
    const run = await runCell(cell, { cycle: index + 1 });
    const verdict = evaluateCell({ cell, observed: run.observed });
    survivorsTotal += run.observed.survivors;
    if (run.observed.sentinelPresent) sentinelsTotal += 1;
    if (!verdict.pass) cycleFailures.push({ cycle: index + 1, id: cell.id, reasons: [...verdict.reasons, ...run.notes] });
    if (!sidecarPid) sidecarPid = findMainSidecarPid();
    handleSamples.push({ cycle: index + 1, app_handles: handlesOf(app.pid), sidecar_handles: handlesOf(sidecarPid) });
    log(`cycle ${index + 1}/${schedule.length} ${cell.id}: ${verdict.pass ? "ok" : `FAIL ${verdict.reasons.join("; ")}`}`);
    fs.writeFileSync(
      path.join(evidenceDir, "cycles.jsonl"),
      `${JSON.stringify({ cycle: index + 1, id: cell.id, pass: verdict.pass, reasons: verdict.reasons, observed: run.observed })}\n`,
      { flag: "a" },
    );
  }

  // Protocol cells against the installed sidecar (outside the app).
  if (!skipProtocol) {
    const probeOut = path.join(evidenceDir, "sidecar-supervisor-probe.json");
    const probe = spawnSync(
      python,
      [
        path.join(HERE, "windows-packaged-vault-supervisor-probe.py"),
        "--sidecar",
        installedSidecar,
        "--artifact-evidence",
        artifactEvidencePath,
        "--out",
        probeOut,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 120000 },
    );
    fs.writeFileSync(path.join(evidenceDir, "sidecar-supervisor-probe.log"), `${probe.stdout || ""}\n${probe.stderr || ""}`);
    if (probe.status === 0 && fs.existsSync(probeOut)) {
      const verify = spawnSync(
        python,
        [
          path.join(HERE, "verify-windows-packaged-vault-supervisor-evidence.py"),
          probeOut,
          "--sidecar",
          installedSidecar,
          "--artifact-evidence",
          artifactEvidencePath,
        ],
        { encoding: "utf8", windowsHide: true, timeout: 60000 },
      );
      const evidence = JSON.parse(fs.readFileSync(probeOut, "utf8"));
      protocol = {
        oversize: verify.status === 0 && evidence.oversize_request_frame_rejected === true ? "PASS" : "FAIL",
        bad_frame: verify.status === 0 && evidence.strict_worker_protocol_error === true ? "PASS" : "FAIL",
        evidence_path: path.basename(probeOut),
      };
      if (verify.status !== 0) log("packaged supervisor verifier failed:", (verify.stderr || verify.stdout || "").trim());
    } else {
      protocol = { oversize: "FAIL", bad_frame: "FAIL", evidence_path: path.basename(probeOut) };
      log("packaged supervisor probe failed:", (probe.stderr || probe.stdout || "").trim());
    }
  } else {
    protocol = { oversize: "NOT_RUN", bad_frame: "NOT_RUN", evidence_path: "sidecar-supervisor-probe.json" };
  }

  // Graceful shutdown and final survivor sweep.
  const finalClose = await closeApp({ graceful: true });
  log(`final graceful exit: ${finalClose.graceful}`);
  const finalSurvivors = survivorsFor(listProcesses(), null);
  survivorsTotal += finalSurvivors.length;
  for (const survivor of finalSurvivors) taskkill(survivor.pid, true);

  // Secret scan over everything the harness can see.
  const variants = secretVariantsFor(Object.values(synthetic));
  const texts = {};
  const addFile = (label, file, limit = 8 * 1024 * 1024) => {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > limit) return;
      texts[label] = fs.readFileSync(file, "latin1");
    } catch (_error) {
      // unreadable files are skipped; they are listed by name below
    }
  };
  const walk = (dir, label, limit) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, `${label}/${entry.name}`, limit);
      else addFile(`${label}/${entry.name}`, full, limit);
    }
  };
  walk(evidenceDir, "evidence", 8 * 1024 * 1024);
  walk(profileDir, "profile", 8 * 1024 * 1024);
  providerState.requests.forEach((body, index) => {
    texts[`provider-request-${index}`] = body;
  });
  texts["cell-records"] = JSON.stringify(cellRecords);
  const tempDir = os.tmpdir();
  try {
    for (const entry of fs.readdirSync(tempDir, { withFileTypes: true })) {
      const full = path.join(tempDir, entry.name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (_error) {
        continue;
      }
      if (stat.mtimeMs < startedAt) continue;
      texts[`temp-name/${entry.name}`] = entry.name;
      if (entry.isFile()) addFile(`temp/${entry.name}`, full, 4 * 1024 * 1024);
    }
  } catch (_error) {
    // temp dir unreadable: names cannot be scanned; recorded via scanned count
  }
  const secretScan = scanForSecrets({ texts, variants });
  log(`secret scan: ${secretScan.scanned} texts, ${secretScan.hits.length} hits`);

  const handleGrowth =
    handleSamples.filter((sample) => Number.isInteger(sample.app_handles) && Number.isInteger(sample.sidecar_handles)).length >= 2
      ? evaluateHandleGrowth({
          samples: handleSamples.filter((sample) => Number.isInteger(sample.app_handles) && Number.isInteger(sample.sidecar_handles)),
          maxGrowth: maxHandleGrowth,
        })
      : { pass: false, first: { app_handles: 0, sidecar_handles: 0 }, last: { app_handles: 0, sidecar_handles: 0 }, growth: { app_handles: 0, sidecar_handles: 0 }, samples: handleSamples.length, max_growth: maxHandleGrowth };

  const evidence = buildEvidence({
    identity,
    environment: {
      os_version: os.release(),
      node_version: process.version,
      install_root: installedRoot,
      profile_path: profileDir,
    },
    cells: cellRecords,
    cycles: {
      count: schedule.length,
      seed,
      schedule,
      failures: cycleFailures,
      survivors_total: survivorsTotal,
      sentinels_total: sentinelsTotal,
    },
    protocol,
    handleGrowth,
    secretScan,
  });
  // Synthetic secret digests let a reviewer tie the MCP receipt file back to
  // the deposited values without the harness ever writing the plaintext.
  const evidencePath = path.join(evidenceDir, "installed-sink-matrix-evidence.json");
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(
    path.join(evidenceDir, "synthetic-secret-digests.json"),
    `${JSON.stringify(syntheticDigest, null, 2)}\n`,
  );
  const verdict = verifyInstalledSinkEvidence(evidence, { expectedIdentity });
  for (const failure of verdict.failures) log(`verifier: ${failure}`);
  log(`verifier verdict: ${verdict.ok ? "PASS" : verdict.incomplete ? "INCOMPLETE" : "FAIL"}`);
  log("evidence:", evidencePath);
  exitCode = verdict.ok ? 0 : verdict.incomplete ? 2 : 1;
} catch (error) {
  log(`harness failure: ${error?.stack || error}`);
  exitCode = 1;
} finally {
  await closeApp({ graceful: false }).catch(() => {});
  providerServer.close();
  for (const survivor of survivorsFor(listProcesses(), null)) taskkill(survivor.pid, true);
  fs.closeSync(harnessLog);
  process.exit(exitCode);
}
