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
    const source = runChecked("powershell", ["-NoProfile", "-NonInteractive", "-Command", command]);
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
  const targets = [...new Set(pids)].filter((pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid);
  if (process.platform === "win32") {
    for (const pid of targets) {
      if (processAlive(pid)) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    }
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

const connectRenderer = async ({ debugPort, earlyExit, output = [] }) => {
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
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url() === target.url);
  if (!page) {
    await browser.close().catch(() => {});
    throw new Error("CDP page disappeared before renderer probe");
  }
  await page.waitForLoadState("domcontentloaded");
  const rendererReady = await page.evaluate(() =>
    Boolean(document.getElementById("root")) && location.protocol === "file:");
  if (!rendererReady) {
    await browser.close().catch(() => {});
    throw new Error("installed renderer did not load the packaged file UI");
  }
  return { browser, page };
};

export const buildRestartRuntimeLaunch = ({
  platform = process.platform,
  tempRoot,
  debugPort,
}) => {
  const platformPath = platform === "win32" ? path.win32 : path;
  const isolatedHome = platformPath.join(tempRoot, "home");
  if (platform === "win32") {
    // NSIS starts the upgraded app itself and does not preserve arbitrary
    // launch arguments such as --user-data-dir or --remote-debugging-port.
    // Electron's normal Windows userData location is APPDATA/<productName>;
    // supplying an isolated APPDATA gives N-1 and the NSIS-relaunched N the
    // same durable state without depending on either discarded argument.
    const appData = platformPath.join(tempRoot, "appdata");
    const localAppData = platformPath.join(tempRoot, "localappdata");
    return {
      userData: platformPath.join(appData, "PuPu"),
      directories: [isolatedHome, appData, localAppData],
      environment: {
        HOME: isolatedHome,
        APPDATA: appData,
        LOCALAPPDATA: localAppData,
      },
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

const startFixtureRuntime = async ({ installed, tempRoot }) => {
  const debugPort = await allocateLoopbackPort();
  const launch = buildRestartRuntimeLaunch({ tempRoot, debugPort });
  for (const directory of launch.directories) {
    fs.mkdirSync(directory, { recursive: true });
  }
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
  child.stdout?.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => output.push(chunk.toString()));
  const connection = await connectRenderer({
    debugPort,
    output,
    earlyExit: () => child.exitCode !== null || child.signalCode !== null,
  });
  const observedPids = new Set([child.pid]);
  const sidecarNeedle = normalizePath(installed.sidecarNeedle);
  await waitFor(() => {
    const rows = readProcessTable();
    const descendants = descendantPids(rows, child.pid);
    for (const pid of descendants) observedPids.add(pid);
    return rows.find((row) => descendants.has(row.pid) && normalizePath(row.command).includes(sidecarNeedle)) || null;
  }, 60_000, "signed N-1 Sidecar descendant");
  return { ...connection, child, debugPort, observedPids, userData: launch.userData };
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

const assertFeedRequests = (server) => {
  const successful = new Set(server.requests
    .filter((request) => request.status === 200 || request.status === 206)
    .map((request) => request.pathname.slice(1)));
  for (const name of [server.feed.metadata.name, server.feed.payload.name]) {
    if (!successful.has(name)) {
      throw new Error(`updater did not request the sealed qualification feed file: ${name}`);
    }
  }
  if (server.requests.some((request) => request.status >= 400)) {
    throw new Error("updater made a rejected request against the qualification feed");
  }
};

export async function runRestartUpdateQualification({
  candidateDir,
  fixturePath,
  fixtureEvidencePath,
  targetId,
  feedPort,
  serverLogPath = "",
}) {
  validateRestartUpdateRuntimeInputs({ targetId, feedPort });
  const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
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
  try {
    expectedCandidate = installTargetPackage({
      targetId,
      installerPath: candidateInstallerPath,
      tempRoot: path.join(tempRoot, "expected-n"),
    });
    const expected = expectedIdentity({ installed: expectedCandidate, targetId });
    installedFixture = installTargetPackage({
      targetId,
      installerPath: path.resolve(fixturePath),
      tempRoot: path.join(tempRoot, "installed-n-minus-one"),
    });
    const fixtureUpdateConfigPath = path.join(path.dirname(installedFixture.identity.asarPath), "app-update.yml");
    validateQualificationFixtureAppUpdate({
      contents: fs.readFileSync(fixtureUpdateConfigPath, "utf8"),
      feedUrl,
    });
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

    runtime = await startFixtureRuntime({ installed: installedFixture, tempRoot: path.join(tempRoot, "installed-n-minus-one") });
    const initialVersion = await runtime.page.evaluate(() => window.appUpdateAPI.getState().then((state) => state.currentVersion));
    if (initialVersion !== fixture.from_version) {
      throw new Error(`installed fixture version does not match ${fixture.from_version}`);
    }
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

    const download = await runtime.page.evaluate(async () => {
      const first = await window.appUpdateAPI.checkAndDownload();
      const duplicate = await window.appUpdateAPI.checkAndDownload();
      return { first, duplicate };
    });
    if (download?.first?.started !== true || download?.duplicate?.started !== false) {
      throw new Error("the product updater did not block a duplicate check while downloading");
    }
    await runtime.page.waitForFunction(() => window.__pupuRestartUpdateStages.includes("downloaded"), null, { timeout: 120_000 });
    const stageTrace = await runtime.page.evaluate(() => window.__pupuRestartUpdateStages);
    validateRestartUpdateStageTrace(stageTrace);

    const install = await runtime.page.evaluate(async () => {
      const first = window.appUpdateAPI.installNow();
      const duplicate = window.appUpdateAPI.installNow();
      return Promise.all([first, duplicate]);
    });
    if (install?.[0]?.started !== true || install?.[1]?.started !== false) {
      throw new Error("the product updater did not block a duplicate restart-to-install request");
    }
    await waitFor(() => !processAlive(runtime.child.pid), 60_000, "old N-1 process exit after user restart-to-install");
    await waitFor(() => [...runtime.observedPids].every((pid) => !processAlive(pid)), 60_000, "old N-1 process tree cleanup");
    await runtime.browser.close().catch(() => {});
    runtime.browser = null;

    const relaunchedRoot = await findRelaunchedRoot({ installed: installedFixture, oldPid: runtime.child.pid });
    await assertRelaunchedSidecar({ installed: installedFixture, rootPid: relaunchedRoot.pid });
    const finalIdentity = assertUpdatedIdentity({ installed: installedFixture, expected, targetId });
    const afterSentinelSha256 = hashFile(sentinelPath);
    if (afterSentinelSha256 !== beforeSentinelSha256) {
      throw new Error("restarted N did not retain the exact settings sentinel bytes");
    }
    assertFeedRequests(server);

    installedFixture.close(relaunchedRoot.pid);
    await waitFor(() => !processAlive(relaunchedRoot.pid), 30_000, "restarted N controlled shutdown");
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
  } finally {
    await runtime?.browser?.close().catch(() => {});
    const rows = readProcessTable();
    await terminateProcesses([
      runtime?.child?.pid,
      ...(runtime?.observedPids || []),
      ...descendantPids(rows, runtime?.child?.pid),
    ]);
    if (server && serverLogPath) {
      writeJson(path.resolve(serverLogPath), buildQualificationFeedServerLog(server));
    }
    await server?.close().catch(() => {});
    try { installedFixture?.cleanup(); } catch { /* best-effort fixture cleanup */ }
    try { expectedCandidate?.cleanup(); } catch { /* best-effort candidate cleanup */ }
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
    });
    writeJson(path.resolve(args.out), report);
    console.log(`[restart-update] ${report.target_id} passed ${report.executed_tests} real lifecycle checks`);
  } catch (error) {
    console.error(`[restart-update] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
