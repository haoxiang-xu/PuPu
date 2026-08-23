#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import asar from "@electron/asar";

import {
  readJson,
  readReleaseArtifactContract,
  validateReleaseAssetManifest,
  verifyReleaseAssetDirectory,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const REPORT_SCHEMA = "pupu.installed-package-qualification.v1";
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SNAPSHOT_FINGERPRINT = /^[0-9a-f]{64}$/;
const TARGET_FORMS = Object.freeze({
  "macos-arm64": ["dmg"],
  "macos-x64": ["dmg"],
  "windows-x64": ["exe"],
  "linux-x64": ["AppImage", "deb"],
});
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
const hashFile = (filePath) => `sha256:${crypto.createHash("sha256")
  .update(fs.readFileSync(filePath))
  .digest("hex")}`;
const hashBytes = (bytes) => `sha256:${crypto.createHash("sha256")
  .update(bytes)
  .digest("hex")}`;

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys must be exactly ${required.join(", ")}`);
  }
};

const requireSha256 = (value, label) => {
  if (!SHA256.test(value)) throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  return value;
};

const requirePositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
};

const runChecked = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed: ${String(
        result.stderr || result.stdout || result.error || "unknown failure",
      ).trim()}`,
    );
  }
  return String(result.stdout || "").trim();
};

const listFiles = (root) => {
  const results = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) results.push(entryPath);
    }
  };
  visit(root);
  return results;
};

const oneFile = (root, predicate, label) => {
  const matches = listFiles(root).filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label} must resolve to exactly one file, found ${matches.length}`);
  }
  return matches[0];
};

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

const allocateLoopbackPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});

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

export const descendantPids = (rows, rootPid) => {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        row.pid !== rootPid &&
        (row.ppid === rootPid || descendants.has(row.ppid)) &&
        !descendants.has(row.pid)
      ) {
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
  const targets = [...new Set(pids)].filter(
    (pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid,
  );
  if (process.platform === "win32") {
    for (const pid of targets) {
      if (processAlive(pid)) {
        spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      }
    }
    return;
  }
  for (const pid of targets) {
    if (processAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* best effort cleanup */ }
    }
  }
  await sleep(800);
  for (const pid of targets) {
    if (processAlive(pid)) {
      try { process.kill(pid, "SIGKILL"); } catch { /* best effort cleanup */ }
    }
  }
};

const normalizePath = (value) => String(value || "").replaceAll("\\", "/").toLowerCase();

const assertSnapshot = (asarPath) => {
  const bytes = Buffer.from(asar.extractFile(asarPath, "build/build_feature_flags.json"));
  const snapshot = JSON.parse(bytes.toString("utf8"));
  const fingerprint = snapshot?._pupu_memory_v2_release?.snapshot_fingerprint;
  if (snapshot?.enable_memory_v2 !== true ||
      typeof fingerprint !== "string" || !SNAPSHOT_FINGERPRINT.test(fingerprint)) {
    throw new Error("installed app has no valid enabled release build snapshot");
  }
  return { fingerprint, sha256: hashBytes(bytes) };
};

const inspectResources = ({ resourceRoot, executablePath, sidecarPlatform }) => {
  const asarPath = path.join(resourceRoot, "app.asar");
  const sidecarPath = path.join(
    resourceRoot,
    "unchain_runtime",
    "dist",
    sidecarPlatform,
    process.platform === "win32" ? "unchain-server.exe" : "unchain-server",
  );
  for (const [label, candidate] of Object.entries({
    executable: executablePath,
    app_asar: asarPath,
    packaged_sidecar: sidecarPath,
  })) {
    if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`installed ${label} is missing`);
    }
  }
  const snapshot = assertSnapshot(asarPath);
  return {
    executablePath,
    asarPath,
    sidecarPath,
    snapshot,
    hashes: {
      executable_sha256: hashFile(executablePath),
      app_asar_sha256: hashFile(asarPath),
      sidecar_sha256: hashFile(sidecarPath),
      snapshot_sha256: snapshot.sha256,
    },
  };
};

const appRootFromAsar = (root) => path.dirname(oneFile(root, (filePath) =>
  path.basename(filePath) === "app.asar", "installed app.asar"));

const installMacDmg = ({ installerPath, tempRoot }) => {
  if (process.platform !== "darwin") throw new Error("DMG qualification requires macOS");
  const mountPath = path.join(tempRoot, "mounted-dmg");
  const installRoot = path.join(tempRoot, "installed");
  fs.mkdirSync(mountPath, { recursive: true });
  fs.mkdirSync(installRoot, { recursive: true });
  let mounted = false;
  const detach = () => {
    if (!mounted) return;
    try { runChecked("/usr/bin/hdiutil", ["detach", mountPath]); }
    catch { runChecked("/usr/bin/hdiutil", ["detach", "-force", mountPath]); }
    finally { mounted = false; }
  };
  try {
    runChecked("/usr/bin/hdiutil", [
      "attach", "-readonly", "-nobrowse", "-mountpoint", mountPath, installerPath,
    ]);
    mounted = true;
    const appEntries = fs.readdirSync(mountPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (appEntries.length !== 1) {
      throw new Error(`DMG must contain exactly one app bundle, found ${appEntries.length}`);
    }
    const appPath = path.join(installRoot, appEntries[0].name);
    runChecked("/usr/bin/ditto", [path.join(mountPath, appEntries[0].name), appPath]);
    const executableName = runChecked("/usr/bin/plutil", [
      "-extract", "CFBundleExecutable", "raw", "-o", "-", path.join(appPath, "Contents", "Info.plist"),
    ]);
    const identity = inspectResources({
      resourceRoot: path.join(appPath, "Contents", "Resources"),
      executablePath: path.join(appPath, "Contents", "MacOS", executableName),
      sidecarPlatform: "macos",
    });
    return {
      identity,
      executablePath: identity.executablePath,
      launchCwd: path.dirname(identity.executablePath),
      sidecarNeedle: identity.sidecarPath,
      candidateNeedle: appPath,
      close: () => runChecked("/usr/bin/osascript", [
        "-l", "JavaScript", "-e", "function run(argv) { Application(argv[0]).quit(); }", appPath,
      ]),
      cleanup: detach,
    };
  } catch (error) {
    try {
      detach();
    } catch (detachError) {
      throw new Error(
        `${error.message || String(error)}; additionally failed to detach DMG: ${detachError.message || String(detachError)}`,
      );
    }
    throw error;
  }
};

const installWindowsNsis = ({ installerPath, tempRoot }) => {
  if (process.platform !== "win32") throw new Error("NSIS qualification requires Windows");
  const installRoot = path.join(tempRoot, "installed");
  fs.mkdirSync(installRoot, { recursive: true });
  runChecked(installerPath, ["/S", `/D=${installRoot}`]);
  const resourceRoot = appRootFromAsar(installRoot);
  const executablePath = path.join(path.dirname(resourceRoot), "PuPu.exe");
  const identity = inspectResources({ resourceRoot, executablePath, sidecarPlatform: "windows" });
  return {
    identity,
    executablePath,
    launchCwd: path.dirname(executablePath),
    sidecarNeedle: identity.sidecarPath,
    candidateNeedle: installRoot,
    close: (pid) => runChecked("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      `$process = Get-Process -Id ${pid} -ErrorAction Stop; if (-not $process.CloseMainWindow()) { throw 'CloseMainWindow returned false' }`,
    ]),
    cleanup: () => {},
  };
};

const executableFromLinuxRoot = (resourceRoot) => {
  const appRoot = path.dirname(resourceRoot);
  const candidates = fs.readdirSync(appRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(appRoot, entry.name))
    .filter((filePath) => fs.statSync(filePath).mode & 0o111)
    .filter((filePath) => /pupu/i.test(path.basename(filePath)));
  if (candidates.length !== 1) {
    throw new Error(`Linux package must contain exactly one executable PuPu launcher, found ${candidates.length}`);
  }
  return candidates[0];
};

const installLinuxAppImage = ({ installerPath, tempRoot }) => {
  if (process.platform !== "linux") throw new Error("AppImage qualification requires Linux");
  const installRoot = path.join(tempRoot, "appimage");
  fs.mkdirSync(installRoot, { recursive: true });
  const executablePath = path.join(installRoot, "PuPu.AppImage");
  fs.copyFileSync(installerPath, executablePath);
  fs.chmodSync(executablePath, 0o755);
  runChecked(executablePath, ["--appimage-extract"], { cwd: installRoot });
  const resourceRoot = appRootFromAsar(path.join(installRoot, "squashfs-root"));
  const internalExecutable = executableFromLinuxRoot(resourceRoot);
  const identity = inspectResources({ resourceRoot, executablePath, sidecarPlatform: "linux" });
  return {
    identity,
    executablePath,
    launchCwd: installRoot,
    launchEnvironment: { APPIMAGE_EXTRACT_AND_RUN: "1" },
    sidecarNeedle: "unchain_runtime/dist/linux/unchain-server",
    candidateNeedle: path.basename(executablePath),
    close: (pid) => process.kill(pid, "SIGTERM"),
    cleanup: () => {},
    internalExecutable,
  };
};

const installLinuxDeb = ({ installerPath, tempRoot }) => {
  if (process.platform !== "linux") throw new Error("DEB qualification requires Linux");
  const installRoot = path.join(tempRoot, "deb-root");
  fs.mkdirSync(installRoot, { recursive: true });
  runChecked("dpkg-deb", ["-x", installerPath, installRoot]);
  const resourceRoot = appRootFromAsar(installRoot);
  const executablePath = executableFromLinuxRoot(resourceRoot);
  const identity = inspectResources({ resourceRoot, executablePath, sidecarPlatform: "linux" });
  return {
    identity,
    executablePath,
    launchCwd: path.dirname(executablePath),
    sidecarNeedle: identity.sidecarPath,
    candidateNeedle: path.dirname(executablePath),
    close: (pid) => process.kill(pid, "SIGTERM"),
    cleanup: () => {},
  };
};

const launchInstalledApplication = async ({ installed, tempRoot }) => {
  const debugPort = await allocateLoopbackPort();
  const userData = path.join(tempRoot, "user-data");
  const isolatedHome = path.join(tempRoot, "home");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(isolatedHome, { recursive: true });
  const environment = { ...process.env, ...(installed.launchEnvironment || {}) };
  for (const key of RELEASE_ENVIRONMENT_KEYS) delete environment[key];
  Object.assign(environment, {
    HOME: isolatedHome,
    NODE_ENV: "production",
    PUPU_TEST_API_DISABLE: "1",
  });
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userData}`,
    ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
  ];
  const child = spawn(installed.executablePath, args, {
    cwd: installed.launchCwd,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout?.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => output.push(chunk.toString()));
  const observedPids = new Set([child.pid]);
  const sidecarNeedle = normalizePath(installed.sidecarNeedle);
  const candidateNeedle = normalizePath(installed.candidateNeedle);
  let browser = null;
  try {
    const endpoint = `http://127.0.0.1:${debugPort}`;
    const target = await waitFor(async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`installed app exited early: ${output.join("").slice(-8000)}`);
      }
      const response = await fetch(`${endpoint}/json/list`);
      if (!response.ok) return null;
      const targets = await response.json();
      return targets.find((candidate) => candidate?.type === "page" &&
        String(candidate.url || "").startsWith("file:")) || null;
    }, 60_000, "installed renderer CDP readiness");

    const { chromium } = await import("playwright");
    browser = await chromium.connectOverCDP(endpoint);
    const page = browser.contexts().flatMap((context) => context.pages())
      .find((candidate) => candidate.url() === target.url);
    if (!page) throw new Error("CDP page disappeared before renderer probe");
    await page.waitForLoadState("domcontentloaded");
    const rendererReady = await page.evaluate(() =>
      Boolean(document.getElementById("root")) && location.protocol === "file:");
    if (!rendererReady) throw new Error("installed renderer did not load the packaged file UI");

    await waitFor(() => {
      const rows = readProcessTable();
      const descendants = descendantPids(rows, child.pid);
      for (const pid of descendants) observedPids.add(pid);
      const sidecar = rows.find((row) => descendants.has(row.pid) &&
        normalizePath(row.command).includes(sidecarNeedle));
      return sidecar || null;
    }, 60_000, "bundled Sidecar descendant");

    installed.close(child.pid);
    await waitFor(() => !processAlive(child.pid), 15_000, "controlled installed-app shutdown");
    await waitFor(() => {
      const rows = readProcessTable();
      return !rows.some((row) => observedPids.has(row.pid) ||
        normalizePath(row.command).includes(candidateNeedle));
    }, 15_000, "installed candidate process cleanup");
    return {
      executed_tests: 4,
      renderer_ready: true,
      packaged_sidecar_descendant: true,
      controlled_shutdown: true,
      process_cleanup: true,
    };
  } finally {
    await browser?.close().catch(() => {});
    const rows = readProcessTable();
    await terminateProcesses([child.pid, ...observedPids, ...descendantPids(rows, child.pid)]);
  }
};

const requiredFormats = (targetId) => {
  const formats = TARGET_FORMS[targetId];
  if (!formats) throw new Error(`unsupported installed qualification target: ${targetId}`);
  return formats;
};

const assetForFormat = ({ manifest, targetId, format }) => {
  const matches = manifest.assets.filter((asset) =>
    asset.target_id === targetId && asset.role === "installer" && asset.format === format);
  if (matches.length !== 1) {
    throw new Error(`candidate manifest must contain exactly one ${targetId} ${format} installer`);
  }
  return matches[0];
};

export function validateInstalledPackageQualificationReport(report, {
  manifest = null,
  manifestDigest = "",
  targetId = "",
} = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("installed qualification report requires the candidate manifest");
  }
  requireSha256(manifest.manifest_digest, "candidate manifest digest");
  if (manifestDigest && manifest.manifest_digest !== manifestDigest) {
    throw new Error("candidate manifest digest does not match expectation");
  }
  exactKeys(report, ["candidate", "executed_tests", "package_forms", "schema", "target_id"], "installed qualification report");
  if (report.schema !== REPORT_SCHEMA) {
    throw new Error(`installed qualification report schema must be ${REPORT_SCHEMA}`);
  }
  if (!TARGET_FORMS[report.target_id]) throw new Error("installed qualification report target is unsupported");
  if (targetId && report.target_id !== targetId) throw new Error("installed qualification report target does not match expectation");
  exactKeys(report.candidate, ["manifest_digest"], "installed qualification report candidate");
  requireSha256(report.candidate.manifest_digest, "installed qualification report candidate.manifest_digest");
  if (manifestDigest && report.candidate.manifest_digest !== manifestDigest) {
    throw new Error("installed qualification report manifest digest does not match candidate");
  }
  if (!Array.isArray(report.package_forms)) {
    throw new Error("installed qualification report package_forms must be an array");
  }
  const expectedFormats = requiredFormats(report.target_id);
  const seenFormats = report.package_forms.map((form, index) => {
    exactKeys(form, ["format", "installed", "installer", "lifecycle"], `package_forms[${index}]`);
    if (!expectedFormats.includes(form.format)) throw new Error(`package_forms[${index}] format is invalid`);
    exactKeys(form.installer, ["name", "sha256"], `package_forms[${index}].installer`);
    if (typeof form.installer.name !== "string" || !form.installer.name) {
      throw new Error(`package_forms[${index}].installer.name must be non-empty`);
    }
    requireSha256(form.installer.sha256, `package_forms[${index}].installer.sha256`);
    const expectedInstaller = assetForFormat({
      manifest,
      targetId: report.target_id,
      format: form.format,
    });
    if (form.installer.name !== expectedInstaller.name) {
      throw new Error(`package_forms[${index}].installer.name does not match candidate manifest`);
    }
    if (form.installer.sha256 !== expectedInstaller.sha256) {
      throw new Error(`package_forms[${index}].installer.sha256 does not match candidate manifest`);
    }
    exactKeys(form.installed, [
      "app_asar_sha256", "executable_sha256", "sidecar_sha256", "snapshot_fingerprint", "snapshot_sha256",
    ], `package_forms[${index}].installed`);
    for (const key of ["app_asar_sha256", "executable_sha256", "sidecar_sha256", "snapshot_sha256"]) {
      requireSha256(form.installed[key], `package_forms[${index}].installed.${key}`);
    }
    if (typeof form.installed.snapshot_fingerprint !== "string" ||
        !SNAPSHOT_FINGERPRINT.test(form.installed.snapshot_fingerprint)) {
      throw new Error(`package_forms[${index}].installed.snapshot_fingerprint must be sha256 hex`);
    }
    exactKeys(form.lifecycle, [
      "controlled_shutdown", "executed_tests", "packaged_sidecar_descendant", "process_cleanup", "renderer_ready",
    ], `package_forms[${index}].lifecycle`);
    requirePositiveInteger(form.lifecycle.executed_tests, `package_forms[${index}].lifecycle.executed_tests`);
    for (const key of ["renderer_ready", "packaged_sidecar_descendant", "controlled_shutdown", "process_cleanup"]) {
      if (form.lifecycle[key] !== true) throw new Error(`package_forms[${index}].lifecycle.${key} must be true`);
    }
    return form.format;
  });
  if (new Set(seenFormats).size !== seenFormats.length ||
      JSON.stringify([...seenFormats].sort()) !== JSON.stringify([...expectedFormats].sort())) {
    throw new Error("installed qualification report package forms do not match target contract");
  }
  const expectedTests = report.package_forms.reduce(
    (total, form) => total + form.lifecycle.executed_tests,
    0,
  );
  if (report.executed_tests !== expectedTests || report.executed_tests <= 0) {
    throw new Error("installed qualification report executed_tests total is invalid");
  }
  return report;
}

export async function runInstalledPackageQualification({ candidateDir, targetId }) {
  const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
  const candidateRoot = path.resolve(candidateDir);
  const manifest = readJson(path.join(candidateRoot, "release-assets.v1.json"));
  validateReleaseAssetManifest(manifest, contract);
  verifyReleaseAssetDirectory({
    manifest,
    contract,
    assetDir: path.join(candidateRoot, "assets"),
  });
  const forms = requiredFormats(targetId);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-installed-qualification-"));
  try {
    const packageForms = [];
    for (const format of forms) {
      const asset = assetForFormat({ manifest, targetId, format });
      const installerPath = path.join(candidateRoot, "assets", asset.name);
      if (hashFile(installerPath) !== asset.sha256) {
        throw new Error(`candidate installer hash does not match manifest: ${asset.name}`);
      }
      const formRoot = path.join(tempRoot, format.toLowerCase());
      fs.mkdirSync(formRoot, { recursive: true });
      let installed;
      if (format === "dmg") installed = installMacDmg({ installerPath, tempRoot: formRoot });
      else if (format === "exe") installed = installWindowsNsis({ installerPath, tempRoot: formRoot });
      else if (format === "AppImage") installed = installLinuxAppImage({ installerPath, tempRoot: formRoot });
      else if (format === "deb") installed = installLinuxDeb({ installerPath, tempRoot: formRoot });
      else throw new Error(`installed qualification has no installer for ${format}`);
      try {
        const lifecycle = await launchInstalledApplication({ installed, tempRoot: formRoot });
        packageForms.push({
          format,
          installer: { name: asset.name, sha256: asset.sha256 },
          installed: {
            ...installed.identity.hashes,
            snapshot_fingerprint: installed.identity.snapshot.fingerprint,
          },
          lifecycle,
        });
      } finally {
        installed.cleanup();
      }
    }
    return validateInstalledPackageQualificationReport({
      schema: REPORT_SCHEMA,
      target_id: targetId,
      candidate: { manifest_digest: manifest.manifest_digest },
      executed_tests: packageForms.reduce((total, form) => total + form.lifecycle.executed_tests, 0),
      package_forms: packageForms,
    }, { manifest, manifestDigest: manifest.manifest_digest, targetId });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

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
  for (const key of ["candidate-dir", "target", "out"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await runInstalledPackageQualification({
      candidateDir: args["candidate-dir"],
      targetId: args.target,
    });
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`[release-qualification] ${report.target_id} passed ${report.executed_tests} installed checks`);
  } catch (error) {
    console.error(`[release-qualification] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
