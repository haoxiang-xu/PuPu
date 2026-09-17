#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  inspectResources,
  installMacDmg,
  installWindowsNsis,
} from "./installed-package-qualification.mjs";
import {
  buildQualificationFeed,
} from "./build-qualification-feed.mjs";
import {
  expectedTargetAssets,
  readJson,
  readReleaseArtifactContract,
  validateReleaseAssetManifest,
  verifyReleaseAssetDirectory,
  writeJson,
} from "./release-artifact-manifest.mjs";
import { validateRestartUpdateFixtureEvidence } from "./restart-update-fixture-evidence.mjs";
import {
  RESTART_UPDATE_QUALIFICATION_SCHEMA,
  RESTART_UPDATE_TARGET_IDS,
  validateRestartUpdateQualificationReport,
} from "./restart-update-qualification.mjs";
import {
  buildQualificationFeedServerLog,
  startQualificationFeedServer,
} from "./serve-qualification-feed.mjs";
import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RELEASE_ENVIRONMENT_KEYS = Object.freeze([
  "PYTHONPATH",
  "UNCHAIN_PYTHON_BIN",
  "UNCHAIN_SOURCE_PATH",
  "PUPU_FEATURE_MEMORY_V2",
  "PUPU_MEMORY_V2_MODE",
  "PUPU_MEMORY_V2_CANARY_PERCENT",
  "PUPU_MEMORY_V2_READ_ONLY_DEGRADED",
  "PUPU_CONTEXT_V2_STORE_OWNER",
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async (predicate, timeoutMs, description) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`${description} timed out${lastError ? `: ${lastError.message}` : ""}`);
};

const runChecked = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${String(
      result.stderr || result.stdout || result.error || "unknown failure",
    ).trim()}`);
  }
  return String(result.stdout || "").trim();
};

const normalizePath = (value) => String(value || "").replaceAll("\\", "/").toLowerCase();

const hashFile = (filePath) => `sha256:${crypto.createHash("sha256")
  .update(fs.readFileSync(filePath))
  .digest("hex")}`;

const parsePosixProcessTable = (source) => String(source || "")
  .split("\n")
  .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
  .filter(Boolean)
  .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }));

const readProcessTable = () => {
  if (process.platform === "win32") {
    const command = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress";
    const source = runChecked("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], { timeout: 30_000 });
    const parsed = JSON.parse(source || "[]");
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
      pid: Number(row.ProcessId),
      ppid: Number(row.ParentProcessId),
      command: String(row.CommandLine || ""),
    }));
  }
  return parsePosixProcessTable(runChecked("/bin/ps", ["-axo", "pid=,ppid=,command="]));
};

const descendantPids = (rows, rootPid) => {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.pid !== rootPid && (row.ppid === rootPid || descendants.has(row.ppid)) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }
  return descendants;
};

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const terminateProcesses = async (pids) => {
  const targets = [...new Set(pids)].filter((pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid && pid !== process.ppid);
  if (process.platform === "win32") {
    const failures = [];
    for (const pid of targets) {
      if (!processAlive(pid)) continue;
      try {
        const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, timeout: 15_000 });
        // Another tree termination can legitimately remove the process before
        // taskkill gets to it. A still-live failed target is not a success.
        if ((result.error || result.status !== 0) && processAlive(pid)) {
          throw new Error(`taskkill pid=${pid} status=${result.status} signal=${result.signal || "none"}: ${String(
            result.stderr || result.stdout || result.error || "unknown failure",
          ).trim()}`);
        }
      } catch (error) { failures.push(error.message || String(error)); }
    }
    if (failures.length) throw new Error(failures.join("; "));
    return;
  }
  for (const pid of targets) {
    if (processAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* best-effort cleanup */ }
    }
  }
  await sleep(800);
  for (const pid of targets) {
    if (processAlive(pid)) {
      try { process.kill(pid, "SIGKILL"); } catch { /* best-effort cleanup */ }
    }
  }
};

const allocateLoopbackPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});

const targetPackage = ({ manifest, targetId }) => {
  const format = targetId.startsWith("macos-") ? "dmg" : "exe";
  const matches = manifest.assets.filter((asset) =>
    asset.target_id === targetId && asset.role === "installer" && asset.format === format);
  if (matches.length !== 1) {
    throw new Error(`candidate manifest must contain exactly one ${targetId} ${format} installer`);
  }
  return matches[0];
};

const installTargetPackage = ({ targetId, installerPath, tempRoot }) => {
  if (targetId.startsWith("macos-")) return installMacDmg({ installerPath, tempRoot });
  if (targetId === "windows-x64") return installWindowsNsis({ installerPath, tempRoot });
  throw new Error(`restart-update target is unsupported: ${targetId}`);
};

const sidecarPlatformForTarget = (targetId) => targetId.startsWith("macos-") ? "macos" : "windows";

const connectRenderer = async ({ debugPort, earlyExit, output = [], onBrowser = () => {} }) => {
  const endpoint = `http://127.0.0.1:${debugPort}`;
  const target = await waitFor(async () => {
    if (earlyExit?.()) {
      throw new Error(`installed app exited early: ${output.join("").slice(-8000)}`);
    }
    const response = await fetch(`${endpoint}/json/list`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find((candidate) => candidate?.type === "page" && String(candidate.url || "").startsWith("file:")) || null;
  }, 60_000, "installed renderer CDP readiness");
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(endpoint);
  onBrowser(browser);
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url() === target.url);
  if (!page) {
    throw new Error("CDP page disappeared before renderer probe");
  }
  await page.waitForLoadState("domcontentloaded");
  const rendererReady = await page.evaluate(() =>
    Boolean(document.getElementById("root")) && location.protocol === "file:");
  if (!rendererReady) {
    throw new Error("installed renderer did not load the packaged file UI");
  }
  return { browser, page };
};

export const buildRestartRuntimeLaunch = ({
  platform = process.platform,
  tempRoot,
  debugPort,
  windowsAppData,
}) => {
  const platformPath = platform === "win32" ? path.win32 : path;
  const isolatedHome = platformPath.join(tempRoot, "home");
  if (platform === "win32") {
    // Electron resolves Windows appData via the native Known Folder API, not
    // process.env.APPDATA. NSIS also drops --user-data-dir on relaunch. Use the
    // real default profile on a fresh disposable hosted runner for both N-1/N.
    if (typeof windowsAppData !== "string" || !/^[a-z]:[\\/].+/i.test(windowsAppData) || /[\r\n\0]/.test(windowsAppData)) {
      throw new Error("Windows restart qualification requires a native absolute ApplicationData path");
    }
    return {
      userData: platformPath.join(windowsAppData, "PuPu"),
      directories: [isolatedHome],
      environment: { HOME: isolatedHome },
      args: [`--remote-debugging-port=${debugPort}`],
    };
  }

  const userData = platformPath.join(tempRoot, "user-data");
  return {
    userData,
    directories: [isolatedHome, userData],
    environment: { HOME: isolatedHome },
    args: [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userData}`,
      ...(platform === "darwin" ? ["--use-mock-keychain"] : []),
    ],
  };
};

const preflightRestartWindowsProfile = ({ tempRoot }) => {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("Windows restart qualification requires a disposable GitHub-hosted runner; refusing a local or self-hosted profile");
  }
  const windowsAppData = runChecked("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    "[Environment]::GetFolderPath('ApplicationData')",
  ], { timeout: 30_000 });
  const launch = buildRestartRuntimeLaunch({ platform: "win32", tempRoot, debugPort: 0, windowsAppData });
  if (fs.existsSync(launch.userData)) {
    throw new Error("Windows restart qualification requires a fresh PuPu profile; refusing to use or delete an existing profile");
  }
  return windowsAppData;
};

const startFixtureRuntime = async ({ installed, tempRoot, onAcquired = () => {}, onStage = () => {} }) => {
  onStage("fixture-profile");
  const windowsAppData = process.platform === "win32" ? preflightRestartWindowsProfile({ tempRoot }) : undefined;
  const debugPort = await allocateLoopbackPort();
  const launch = buildRestartRuntimeLaunch({ tempRoot, debugPort, windowsAppData });
  for (const directory of launch.directories) {
    fs.mkdirSync(directory, { recursive: true });
  }
  onStage("fixture-preference");
  // The stock N-1 updater schedules an automatic check eight seconds after
  // startup. CDP/process readiness may take longer; disabling it afterwards
  // cannot cancel a download already in flight. Seed ordinary user settings
  // before spawning, without patching the signed fixture or its updater.
  if (process.platform === "win32") fs.mkdirSync(launch.userData);
  fs.writeFileSync(path.join(launch.userData, "auto_update_pref.json"), JSON.stringify({ enabled: false }), {
    encoding: "utf8", flag: "wx",
  });
  const environment = { ...process.env, ...(installed.launchEnvironment || {}) };
  for (const key of RELEASE_ENVIRONMENT_KEYS) delete environment[key];
  Object.assign(environment, {
    NODE_ENV: "production",
    PUPU_TEST_API_DISABLE: "1",
    ...launch.environment,
  });
  const child = spawn(installed.executablePath, launch.args, {
    cwd: installed.launchCwd,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  const observedPids = new Set([child.pid]);
  const session = { child, output, debugPort, observedPids, userData: launch.userData, browser: null, spawnError: null };
  // Transfer ownership before any readiness await can reject. A partially
  // initialized runtime still owns a live process and potentially a CDP socket.
  onAcquired(session);
  child.on("error", (error) => { session.spawnError = error; });
  const capture = (chunk) => {
    output.push(chunk.toString().slice(-16_384));
    if (output.length > 8) output.shift();
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  onStage("fixture-renderer-readiness");
  const connection = await connectRenderer({
    debugPort,
    output,
    onBrowser: (browser) => { session.browser = browser; },
    earlyExit: () => {
      if (session.spawnError) throw session.spawnError;
      return child.exitCode !== null || child.signalCode !== null;
    },
  });
  Object.assign(session, connection);
  onStage("fixture-sidecar-readiness");
  const sidecarNeedle = normalizePath(installed.sidecarNeedle);
  await waitFor(() => {
    const rows = readProcessTable();
    const descendants = descendantPids(rows, child.pid);
    for (const pid of descendants) observedPids.add(pid);
    return rows.find((row) => descendants.has(row.pid) && normalizePath(row.command).includes(sidecarNeedle)) || null;
  }, 60_000, "signed N-1 Sidecar descendant");
  return session;
};

export const validateRestartUpdateStageTrace = (stages) => {
  if (!Array.isArray(stages)) throw new Error("updater state trace is missing");
  const compact = stages.filter((stage) => typeof stage === "string")
    .filter((stage, index, all) => index === 0 || stage !== all[index - 1]);
  if (compact.includes("error") || compact.includes("no_update")) {
    throw new Error(`updater reached an unexpected terminal state: ${compact.join(", ")}`);
  }
  const expected = ["checking", "downloading", "downloaded"];
  let cursor = 0;
  for (const stage of compact) {
    if (stage === expected[cursor]) cursor += 1;
  }
  if (cursor !== expected.length) {
    throw new Error(`updater did not reach the required download stages: ${compact.join(", ")}`);
  }
  return expected;
};

const expectedIdentity = ({ installed, targetId }) => ({
  ...installed.identity.hashes,
  snapshot_fingerprint: installed.identity.snapshot.fingerprint,
  sidecar_platform: sidecarPlatformForTarget(targetId),
});

const assertUpdatedIdentity = ({ installed, expected, targetId }) => {
  const actual = inspectResources({
    resourceRoot: path.dirname(installed.identity.asarPath),
    executablePath: installed.identity.executablePath,
    sidecarPlatform: sidecarPlatformForTarget(targetId),
  });
  for (const key of ["executable_sha256", "app_asar_sha256", "sidecar_sha256", "snapshot_sha256"]) {
    if (actual.hashes[key] !== expected[key]) {
      throw new Error(`restarted candidate ${key} does not match the exact N package`);
    }
  }
  if (actual.snapshot.fingerprint !== expected.snapshot_fingerprint) {
    throw new Error("restarted candidate snapshot fingerprint does not match the exact N package");
  }
  return {
    executable_sha256: actual.hashes.executable_sha256,
    app_asar_sha256: actual.hashes.app_asar_sha256,
    sidecar_sha256: actual.hashes.sidecar_sha256,
    snapshot_sha256: actual.hashes.snapshot_sha256,
    snapshot_fingerprint: actual.snapshot.fingerprint,
  };
};

const findRelaunchedRoot = ({ installed, oldPid }) => {
  const executableNeedle = normalizePath(installed.executablePath);
  const candidateNeedle = normalizePath(installed.candidateNeedle);
  return waitFor(() => {
    const rows = readProcessTable();
    const matching = rows.filter((row) => row.pid !== oldPid && (
      normalizePath(row.command).includes(executableNeedle) || normalizePath(row.command).includes(candidateNeedle)
    ));
    const root = matching.find((row) => !matching.some((candidate) => candidate.pid === row.ppid));
    return root || null;
  }, 60_000, "automatic N relaunch process");
};

const assertRelaunchedSidecar = async ({ installed, rootPid }) => {
  const sidecarNeedle = normalizePath(installed.sidecarNeedle);
  await waitFor(() => {
    const rows = readProcessTable();
    const descendants = descendantPids(rows, rootPid);
    return rows.find((row) => descendants.has(row.pid) && normalizePath(row.command).includes(sidecarNeedle)) || null;
  }, 60_000, "restarted N Sidecar descendant");
};

export const assertFeedRequests = (server, { targetId, fromVersion, contract } = {}) => {
  const successful = new Set(server.requests
    .filter((request) => request.method === "GET" && (request.status === 200 || request.status === 206))
    .map((request) => request.pathname.slice(1)));
  for (const name of [server.feed.metadata.name, server.feed.payload.name]) {
    if (!successful.has(name)) {
      throw new Error(`updater did not request the sealed qualification feed file: ${name}`);
    }
  }
  const rejected = server.requests.filter((request) => request.status >= 400);
  if (rejected.length === 0) return;
  // An N-only feed deliberately has no historical differential blockmap.
  // Admit exactly that optional GET miss, only when a subsequent full GET of
  // the sealed payload succeeded. Downloaded state and installed byte identity
  // are independently enforced by the caller; no arbitrary 404 is tolerated.
  const oldBlockmap = targetId === "windows-x64" && contract && /^\d+\.\d+\.\d+$/.test(fromVersion || "")
    ? expectedTargetAssets(contract, fromVersion).find((asset) => asset.target_id === targetId && asset.role === "updater-blockmap")?.name
    : null;
  const [miss] = rejected;
  const expectedFallback = rejected.length === 1 && oldBlockmap &&
    oldBlockmap !== server.feed.blockmap.name && miss.method === "GET" && miss.status === 404 &&
    miss.pathname === `/${oldBlockmap}` &&
    server.requests.slice(server.requests.indexOf(miss) + 1).some((request) =>
      request.method === "GET" && request.pathname === `/${server.feed.payload.name}` && request.status === 200);
  if (!expectedFallback) {
    throw new Error("updater made a rejected request against the qualification feed");
  }
};

const restartDiagnosticText = (value, limit = 16_384) => String(value || "")
  .replace(/(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
  .replace(/((?:password|secret|token|api[_-]?key)["']?\s*(?:[:=]\s*|\s+))["']?[^\s,"'}]+/gi, "$1[REDACTED]")
  .slice(-limit);

const restartErrorDetails = (error) => error ? {
  name: String(error.name || "Error"),
  message: restartDiagnosticText(error.message || error, 8_192),
  stack: restartDiagnosticText(error.stack || ""),
} : null;

const restartUpdateProbeDetails = (probe) => {
  if (!probe) return null;
  const state = (value) => value ? Object.fromEntries(
    ["stage", "currentVersion", "latestVersion", "message"].filter((key) => typeof value[key] === "string")
      .map((key) => [key, restartDiagnosticText(value[key], 1024)]),
  ) : null;
  const result = (value) => value ? { started: typeof value.started === "boolean" ? value.started : null } : null;
  return {
    before: state(probe.before), first: result(probe.first), after_first: state(probe.after_first),
    duplicate: result(probe.duplicate), after_duplicate: state(probe.after_duplicate),
    error: typeof probe.error === "string" ? restartDiagnosticText(probe.error, 2048) : null,
    stages: (probe.stages || []).slice(-64).map((value) => restartDiagnosticText(String(value), 128)),
  };
};

// Only this run's observed tree or private installation paths may be cleaned.
// Do not match a bare product name: the runner may host unrelated applications.
const selectRestartCleanupPids = ({ rows, runtime, installedFixture, expectedCandidate }) => {
  const known = new Set([runtime?.child?.pid, ...(runtime?.observedPids || [])]);
  const roots = [installedFixture?.launchCwd, expectedCandidate?.launchCwd]
    .filter((value) => typeof value === "string" && value.length > 3)
    .map((value) => `${normalizePath(value).replace(/\/+$/, "")}/`);
  for (const row of rows) {
    if (roots.some((root) => normalizePath(row.command).includes(root))) known.add(row.pid);
  }
  // Remove protected ancestors before walking children, otherwise a harness
  // command containing an installation path could pull in sibling processes.
  known.delete(process.pid);
  known.delete(process.ppid);
  for (const pid of [...known]) {
    if (Number.isSafeInteger(pid) && pid > 1) {
      for (const descendant of descendantPids(rows, pid)) known.add(descendant);
    }
  }
  return [...known].filter((pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid && pid !== process.ppid);
};

const boundedRestartCleanup = async (action, label) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} cleanup timed out`)), 30_000); }),
    ]);
  } finally { clearTimeout(timer); }
};

export async function runRestartUpdateQualification({
  candidateDir,
  fixturePath,
  fixtureEvidencePath,
  targetId,
  feedPort,
  serverLogPath = "",
  diagnosticsPath = "",
}) {
  validateRestartUpdateRuntimeInputs({ targetId, feedPort });
  const contract = readReleaseArtifactContract(path.join(ROOT, "docs/contracts/release/release-artifact-contract.v1.json"));
  const candidateRoot = path.resolve(candidateDir);
  const manifest = readJson(path.join(candidateRoot, "release-assets.v1.json"));
  validateReleaseAssetManifest(manifest, contract);
  verifyReleaseAssetDirectory({ manifest, contract, assetDir: path.join(candidateRoot, "assets") });
  const fixture = validateRestartUpdateFixtureEvidence(readJson(path.resolve(fixtureEvidencePath)), {
    targetId,
    fixturePath,
  });
  const feedUrl = `http://127.0.0.1:${feedPort}/`;
  const candidatePackage = targetPackage({ manifest, targetId });
  const candidateInstallerPath = path.join(candidateRoot, "assets", candidatePackage.name);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-restart-update-qualification-"));
  let expectedCandidate;
  let installedFixture;
  let runtime;
  let server;
  let stage = "install-candidate";
  let primaryError = null;
  let updateProbe = null;
  let processEvidence = [];
  const cleanupErrors = [];
  const writeDiagnostics = () => {
    if (!diagnosticsPath) return;
    writeJson(path.resolve(diagnosticsPath), {
      schema: "pupu.restart-update-diagnostics.v1",
      status: "failed",
      target_id: targetId,
      candidate: { tag: manifest.release.tag, commit: manifest.release.commit, manifest_digest: manifest.manifest_digest },
      fixture: { tag: fixture.from_tag, commit: fixture.from_commit },
      stage,
      primary_error: restartErrorDetails(primaryError),
      update_probe: restartUpdateProbeDetails(updateProbe),
      cleanup_errors: cleanupErrors,
      runtime: {
        pid: runtime?.child?.pid || null,
        user_data: runtime?.userData || null,
        observed_pids: [...(runtime?.observedPids || [])].filter(Number.isSafeInteger),
        output_tail: restartDiagnosticText((runtime?.output || []).join("")),
      },
      processes: processEvidence,
      feed_request_count: server?.requests?.length || 0,
    });
  };
  try {
    if (targetId === "windows-x64") {
      stage = "fixture-profile";
      // NSIS can stop/uninstall a registered app even with a custom /D path.
      // Refuse non-disposable or existing profiles before either installer runs.
      preflightRestartWindowsProfile({ tempRoot });
    }
    stage = "install-candidate";
    expectedCandidate = await installTargetPackage({
      targetId,
      installerPath: candidateInstallerPath,
      tempRoot: path.join(tempRoot, "expected-n"),
    });
    const expected = expectedIdentity({ installed: expectedCandidate, targetId });
    stage = "install-fixture";
    installedFixture = await installTargetPackage({
      targetId,
      installerPath: path.resolve(fixturePath),
      tempRoot: path.join(tempRoot, "installed-n-minus-one"),
    });
    stage = "fixture-updater-binding";
    const fixtureUpdateConfigPath = path.join(path.dirname(installedFixture.identity.asarPath), "app-update.yml");
    validateQualificationFixtureAppUpdate({
      contents: fs.readFileSync(fixtureUpdateConfigPath, "utf8"),
      feedUrl,
    });
    stage = "start-feed";
    const feedDir = path.join(tempRoot, "qualification-feed");
    buildQualificationFeed({ candidateDir: candidateRoot, outDir: feedDir, targetId, contract });
    server = await startQualificationFeedServer({
      feedDir,
      manifest,
      contract,
      targetId,
      port: feedPort,
    });
    if (server.url !== feedUrl.slice(0, -1)) {
      throw new Error("qualification feed server did not bind the fixture's exact loopback URL");
    }

    stage = "start-fixture";
    runtime = await startFixtureRuntime({
      installed: installedFixture,
      tempRoot: path.join(tempRoot, "installed-n-minus-one"),
      onAcquired: (session) => { runtime = session; },
      onStage: (next) => { stage = next; },
    });
    stage = "fixture-version";
    const initialVersion = await runtime.page.evaluate(() => window.appUpdateAPI.getState().then((state) => state.currentVersion));
    if (initialVersion !== fixture.from_version) {
      throw new Error(`installed fixture version does not match ${fixture.from_version}`);
    }
    stage = "settings-sentinel";
    const sentinelResult = await runtime.page.evaluate(async () => {
      window.__pupuRestartUpdateStages = [];
      window.__pupuRestartUpdateUnsubscribe = window.appUpdateAPI.onStateChange((state) => {
        window.__pupuRestartUpdateStages.push(state?.stage || "");
      });
      return window.appUpdateAPI.setAutoUpdate(false);
    });
    if (!sentinelResult?.ok) throw new Error("could not persist the qualification settings sentinel");
    const sentinelPath = path.join(runtime.userData, "auto_update_pref.json");
    await waitFor(() => fs.statSync(sentinelPath, { throwIfNoEntry: false })?.isFile(), 15_000, "settings sentinel persistence");
    const beforeSentinelSha256 = hashFile(sentinelPath);

    stage = "check-and-download";
    updateProbe = await runtime.page.evaluate(async () => {
      const probe = { before: null, first: null, after_first: null, duplicate: null, after_duplicate: null };
      try {
        probe.before = await window.appUpdateAPI.getState();
        if (probe.before?.stage === "idle") {
          probe.first = await window.appUpdateAPI.checkAndDownload();
          probe.after_first = await window.appUpdateAPI.getState();
          probe.duplicate = await window.appUpdateAPI.checkAndDownload();
          probe.after_duplicate = await window.appUpdateAPI.getState();
        }
      } catch (error) {
        probe.error = String(error?.message || error);
      }
      probe.stages = window.__pupuRestartUpdateStages.slice(-64);
      return probe;
    });
    if (updateProbe.error) throw new Error(`manual update probe IPC failed: ${updateProbe.error}`);
    if (updateProbe.before?.stage !== "idle") {
      throw new Error(`expected idle updater before manual check; got ${updateProbe.before?.stage || "missing state"}`);
    }
    const exactStartedResult = (value, expected) => value && Object.keys(value).length === 1 && value.started === expected;
    if (!exactStartedResult(updateProbe.first, true)) {
      throw new Error("first manual update check did not start; see update_probe diagnostics");
    }
    if (!exactStartedResult(updateProbe.duplicate, false)) {
      throw new Error("duplicate update check was not blocked; see update_probe diagnostics");
    }
    stage = "wait-downloaded";
    await runtime.page.waitForFunction(() => window.__pupuRestartUpdateStages.includes("downloaded"), null, { timeout: 120_000 });
    const stageTrace = await runtime.page.evaluate(() => window.__pupuRestartUpdateStages);
    validateRestartUpdateStageTrace(stageTrace);

    stage = "request-install";
    const install = await runtime.page.evaluate(async () => {
      const first = window.appUpdateAPI.installNow();
      const duplicate = window.appUpdateAPI.installNow();
      return Promise.all([first, duplicate]);
    });
    if (install?.[0]?.started !== true || install?.[1]?.started !== false) {
      throw new Error("the product updater did not block a duplicate restart-to-install request");
    }
    stage = "old-process-exit";
    await waitFor(() => !processAlive(runtime.child.pid), 60_000, "old N-1 process exit after user restart-to-install");
    await waitFor(() => [...runtime.observedPids].every((pid) => !processAlive(pid)), 60_000, "old N-1 process tree cleanup");
    await boundedRestartCleanup(() => runtime.browser.close(), "old-runtime-browser");
    runtime.browser = null;

    stage = "find-relaunched-candidate";
    const relaunchedRoot = await findRelaunchedRoot({ installed: installedFixture, oldPid: runtime.child.pid });
    runtime.observedPids.add(relaunchedRoot.pid);
    stage = "relaunched-sidecar";
    await assertRelaunchedSidecar({ installed: installedFixture, rootPid: relaunchedRoot.pid });
    stage = "relaunched-identity";
    const finalIdentity = assertUpdatedIdentity({ installed: installedFixture, expected, targetId });
    stage = "retained-settings";
    const afterSentinelSha256 = hashFile(sentinelPath);
    if (afterSentinelSha256 !== beforeSentinelSha256) {
      throw new Error("restarted N did not retain the exact settings sentinel bytes");
    }
    stage = "feed-requests";
    assertFeedRequests(server, { targetId, fromVersion: fixture.from_version, contract });

    stage = "relaunched-shutdown";
    installedFixture.close(relaunchedRoot.pid);
    await waitFor(() => !processAlive(relaunchedRoot.pid), 30_000, "restarted N controlled shutdown");
    stage = "validate-report";
    return validateRestartUpdateQualificationReport({
      schema: RESTART_UPDATE_QUALIFICATION_SCHEMA,
      status: "passed",
      target_id: targetId,
      candidate: {
        manifest_digest: manifest.manifest_digest,
        to_tag: manifest.release.tag,
        to_version: manifest.release.version,
      },
      fixture: {
        from_tag: fixture.from_tag,
        from_version: fixture.from_version,
        from_commit: fixture.from_commit,
        sha256: fixture.installer.sha256,
        signer_subject: fixture.signer.subject,
        signer_thumbprint: fixture.signer.thumbprint,
        allowed_differences: fixture.allowed_differences,
      },
      feed: {
        schema: server.feed.schema,
        transport: "runner-loopback",
        metadata: server.feed.metadata,
        payload: server.feed.payload,
        blockmap: server.feed.blockmap,
      },
      update: {
        attempts: 1,
        duplicate_install_blocked: true,
        old_process_cleanup: true,
        events: ["checking", "downloading", "downloaded", "install_requested", "old_process_exited", "relaunched"],
      },
      installed: {
        identity: finalIdentity,
        sentinel: {
          before_sha256: beforeSentinelSha256,
          after_sha256: afterSentinelSha256,
          retained: true,
        },
      },
      executed_tests: 15,
    }, { manifest, targetId });
  } catch (error) {
    primaryError = error;
    // Print before cleanup so even a diagnostic-write/cleanup failure cannot
    // erase the first cause from Actions logs.
    console.error(`[restart-update:${stage}] ${restartDiagnosticText(error.stack || error.message || error)}`);
    throw error;
  } finally {
    const attemptCleanup = async (step, action) => {
      try { await action(); }
      catch (error) {
        cleanupErrors.push({ step, error: restartErrorDetails(error) });
        console.error(`[restart-update:cleanup:${step}] ${restartDiagnosticText(error.message || error)}`);
      }
    };
    let rows = [];
    await attemptCleanup("capture-processes", () => {
      rows = readProcessTable();
      const ids = new Set(selectRestartCleanupPids({ rows, runtime, installedFixture, expectedCandidate }));
      processEvidence = rows.filter((row) => ids.has(row.pid)).slice(0, 256)
        .map((row) => ({ pid: row.pid, ppid: row.ppid, command: restartDiagnosticText(row.command, 2_048) }));
    });
    // Write outside tempRoot before teardown, and update with cleanup failures.
    if (primaryError) await attemptCleanup("write-diagnostics-before-cleanup", writeDiagnostics);
    await attemptCleanup("browser-close", () => boundedRestartCleanup(() => runtime?.browser?.close(), "browser-close"));
    await attemptCleanup("terminate-processes", () => terminateProcesses(
      selectRestartCleanupPids({ rows, runtime, installedFixture, expectedCandidate }),
    ));
    await attemptCleanup("wait-process-exit", () => waitFor(async () => {
      const current = readProcessTable();
      const remaining = selectRestartCleanupPids({ rows: current, runtime, installedFixture, expectedCandidate })
        .filter(processAlive);
      if (remaining.length === 0) return true;
      await terminateProcesses(remaining);
      return false;
    }, 20_000, "restart qualification process cleanup"));
    await attemptCleanup("feed-log", () => {
      if (server && serverLogPath) writeJson(path.resolve(serverLogPath), buildQualificationFeedServerLog(server));
    });
    await attemptCleanup("feed-close", () => boundedRestartCleanup(() => server?.close(), "feed-close"));
    await attemptCleanup("fixture-cleanup", () => installedFixture?.cleanup());
    await attemptCleanup("candidate-cleanup", () => expectedCandidate?.cleanup());
    await attemptCleanup("remove-temp-root", () => fs.rmSync(tempRoot, {
      recursive: true, force: true, maxRetries: 5, retryDelay: 500,
    }));
    if (primaryError || cleanupErrors.length) await attemptCleanup("write-diagnostics", writeDiagnostics);
    if (!primaryError && cleanupErrors.length) {
      throw new Error(`restart qualification cleanup failed: ${cleanupErrors.map((item) => `${item.step}: ${item.error.message}`).join("; ")}`);
    }
  }
}

export const validateRestartUpdateRuntimeInputs = ({ targetId, feedPort }) => {
  if (!RESTART_UPDATE_TARGET_IDS.includes(targetId)) {
    throw new Error(`restart-update target is unsupported: ${targetId}`);
  }
  if (!Number.isSafeInteger(feedPort) || feedPort < 1 || feedPort > 65535) {
    throw new Error("restart-update feed port must be an integer from 1 through 65535");
  }
  return { targetId, feedPort };
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  for (const key of ["candidate-dir", "fixture", "fixture-evidence", "target", "feed-port", "out", "server-log"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await runRestartUpdateQualification({
      candidateDir: args["candidate-dir"],
      fixturePath: args.fixture,
      fixtureEvidencePath: args["fixture-evidence"],
      targetId: args.target,
      feedPort: Number(args["feed-port"]),
      serverLogPath: args["server-log"],
      diagnosticsPath: args.diagnostics || `${args.out}.diagnostics.json`,
    });
    writeJson(path.resolve(args.out), report);
    console.log(`[restart-update] ${report.target_id} passed ${report.executed_tests} real lifecycle checks`);
  } catch (error) {
    console.error(`[restart-update] ${restartDiagnosticText(error.message || error)}`);
    process.exitCode = 1;
  }
}
