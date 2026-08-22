#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import asar from "@electron/asar";

import { runPackagedSidecarSmoke } from "./package-sidecar-smoke.mjs";
import {
  hashFileSha256,
  readAndVerifyUnchainArtifactEvidence,
} from "./unchain-artifact.mjs";

const require = createRequire(import.meta.url);
const { runMatrix } = require("./p6-full-leg-runtime-matrix.cjs");
const {
  createBuildFeatureSnapshot,
} = require("../../electron/main/services/unchain/memory_v2_rollout");

const REPORT_SCHEMA = "pupu.macos-installed-candidate.v1";
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const LIFECYCLE_CHECK_COUNT = 4;
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

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const parseArgs = (argv) => {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  for (const key of ["dmg", "artifact", "evidence", "snapshot", "python", "out"]) {
    if (!parsed[key]) throw new Error(`--${key} is required`);
  }
  return parsed;
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

const hashBytesSha256 = (bytes) =>
  `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;

export const parseProcessTable = (source) => String(source || "")
  .split("\n")
  .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
  .filter(Boolean)
  .map((match) => ({
    pid: Number(match[1]),
    ppid: Number(match[2]),
    command: match[3],
  }));

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

const readProcessTable = () => parseProcessTable(
  runChecked("/bin/ps", ["-axo", "pid=,ppid=,command="]),
);

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (predicate, timeoutMs, description) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`${description} timed out`);
};

const terminateKnownProcesses = async (pids) => {
  const exactPids = [...new Set(pids)].filter(
    (pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid,
  );
  for (const pid of exactPids) {
    if (processAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Continue through every process from this isolated candidate tree.
      }
    }
  }
  await sleep(1_000);
  for (const pid of exactPids) {
    if (processAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // It may have exited between the liveness check and the signal.
      }
    }
  }
};

const readBundleField = (appPath, field) => runChecked(
  "/usr/bin/plutil",
  [
    "-extract",
    field,
    "raw",
    "-o",
    "-",
    path.join(appPath, "Contents", "Info.plist"),
  ],
);

const inspectInstalledBundle = ({ appPath, expectedSnapshotBytes }) => {
  const resourcesPath = path.join(appPath, "Contents", "Resources");
  const executableName = readBundleField(appPath, "CFBundleExecutable");
  const version = readBundleField(appPath, "CFBundleShortVersionString");
  const executablePath = path.join(appPath, "Contents", "MacOS", executableName);
  const asarPath = path.join(resourcesPath, "app.asar");
  const sidecarPath = path.join(
    resourcesPath,
    "unchain_runtime",
    "dist",
    "macos",
    "unchain-server",
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

  const embeddedSnapshotBytes = Buffer.from(
    asar.extractFile(asarPath, "build/build_feature_flags.json"),
  );
  if (!embeddedSnapshotBytes.equals(expectedSnapshotBytes)) {
    throw new Error("installed build feature snapshot bytes do not match input");
  }
  const snapshot = JSON.parse(embeddedSnapshotBytes.toString("utf8"));
  const snapshotFingerprint =
    snapshot?._pupu_memory_v2_release?.snapshot_fingerprint;
  if (
    snapshot?.enable_memory_v2 !== true ||
    typeof snapshotFingerprint !== "string" ||
    !snapshotFingerprint
  ) {
    throw new Error("installed Memory V2 snapshot is not release-enabled");
  }

  return {
    appPath,
    asarPath,
    executablePath,
    resourcesPath,
    sidecarPath,
    snapshotFingerprint,
    version,
    hashes: {
      app_asar: hashFileSha256(asarPath),
      executable: hashFileSha256(executablePath),
      packaged_sidecar: hashFileSha256(sidecarPath),
      snapshot: hashBytesSha256(embeddedSnapshotBytes),
    },
  };
};

const runInstalledLifecycle = async ({ identity, isolatedHome }) => {
  const userData = path.join(isolatedHome, "user-data");
  fs.mkdirSync(userData, { recursive: true });
  const environment = {
    ...process.env,
    HOME: isolatedHome,
    NODE_ENV: "production",
    PUPU_TEST_API_DISABLE: "1",
  };
  for (const key of RELEASE_ENVIRONMENT_KEYS) delete environment[key];

  const child = spawn(
    identity.executablePath,
    [
      `--user-data-dir=${userData}`,
      // Random-path unsigned app copies otherwise block on macOS Keychain UI
      // while Chromium creates its Safe Storage item. This lifecycle leg only
      // proves packaged process identity; the P6 Vault semantics run in the
      // following isolated main-service matrix.
      "--use-mock-keychain",
    ],
    {
      cwd: path.dirname(identity.executablePath),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const recordOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-32_768);
  };
  child.stdout?.on("data", recordOutput);
  child.stderr?.on("data", recordOutput);
  const observedPids = new Set([child.pid]);

  try {
    let observation;
    try {
      observation = await waitFor(() => {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(
            `installed app exited before Sidecar readiness: ${output.trim()}`,
          );
        }
        const rows = readProcessTable();
        const descendants = descendantPids(rows, child.pid);
        for (const pid of descendants) observedPids.add(pid);
        const sidecar = rows.find(
          (row) => descendants.has(row.pid) &&
            row.command.includes(identity.sidecarPath),
        );
        return sidecar ? { descendants, sidecar } : null;
      }, 60_000, "installed app packaged Sidecar launch");
    } catch (error) {
      const rows = readProcessTable();
      const descendants = descendantPids(rows, child.pid);
      const candidateRows = rows
        .filter((row) => row.pid === child.pid || descendants.has(row.pid))
        .map((row) => `${row.pid}/${row.ppid}:${row.command}`)
        .join(" | ");
      throw new Error(
        `${error.message}; candidate_processes=${candidateRows || "none"}; ` +
          `output=${output.trim() || "none"}`,
      );
    }

    if (!observation.sidecar.command.includes(identity.sidecarPath)) {
      throw new Error("installed app launched a non-candidate Sidecar");
    }
    runChecked("/usr/bin/osascript", [
      "-l",
      "JavaScript",
      "-e",
      "function run(argv) { Application(argv[0]).quit(); }",
      identity.appPath,
    ]);
    await waitFor(() => !processAlive(child.pid), 15_000, "installed app exit");
    await waitFor(() => {
      const rows = readProcessTable();
      return !rows.some((row) =>
        observedPids.has(row.pid) || row.command.includes(identity.appPath),
      );
    }, 15_000, "installed candidate process-tree cleanup");

    return {
      schema: "pupu.macos-installed-lifecycle.v1",
      executed_tests: LIFECYCLE_CHECK_COUNT,
      keychain_mode: "chromium_mock_isolated",
      checks: {
        installed_app_launched: "pass",
        packaged_sidecar_is_descendant: "pass",
        packaged_sidecar_path_is_exact: "pass",
        candidate_process_tree_cleaned: "pass",
      },
    };
  } finally {
    const rows = readProcessTable();
    const descendants = descendantPids(rows, child.pid);
    await terminateKnownProcesses([
      child.pid,
      ...observedPids,
      ...descendants,
    ]);
  }
};

export function validateMacOsInstalledCandidateReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("macOS installed report must be an object");
  }
  if (report.schema !== REPORT_SCHEMA) {
    throw new Error(`macOS installed report schema must be ${REPORT_SCHEMA}`);
  }
  if (report.candidate_class !== "diagnostic_local_unsigned") {
    throw new Error("macOS installed report must identify its diagnostic class");
  }
  for (const label of ["package_smoke", "installed_lifecycle", "installed_p6_matrix"]) {
    if (!Number.isSafeInteger(report[label]?.executed_tests) ||
        report[label].executed_tests <= 0) {
      throw new Error(`${label} must contain nonzero executed tests`);
    }
  }
  const expectedTotal =
    report.package_smoke.executed_tests +
    report.installed_lifecycle.executed_tests +
    report.installed_p6_matrix.executed_tests;
  if (report.executed_tests !== expectedTotal) {
    throw new Error("macOS installed report executed_tests total is invalid");
  }
  for (const [label, digest] of Object.entries(report.identity?.hashes || {})) {
    if (!SHA256_PATTERN.test(digest)) {
      throw new Error(`identity hash ${label} must be sha256:<64 hex>`);
    }
  }
  if (Object.keys(report.identity?.hashes || {}).length < 5) {
    throw new Error("macOS installed report identity hash chain is incomplete");
  }
  return report;
}

export async function runMacOsInstalledCandidate({
  dmgPath,
  artifactPath,
  evidencePath,
  snapshotPath,
  pythonPath,
} = {}) {
  if (process.platform !== "darwin") {
    throw new Error("macOS installed candidate matrix requires darwin");
  }
  for (const [label, candidate] of Object.entries({
    dmg: dmgPath,
    artifact: artifactPath,
    evidence: evidencePath,
    snapshot: snapshotPath,
    python: pythonPath,
  })) {
    if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${label} input must be an existing file`);
    }
  }

  const artifactEvidence = readAndVerifyUnchainArtifactEvidence({
    artifactPath,
    evidencePath,
  });
  const snapshotSource = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const expectedSnapshotBytes = Buffer.from(
    `${JSON.stringify(createBuildFeatureSnapshot(snapshotSource, {}), null, 2)}\n`,
    "utf8",
  );
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-macos-installed-"));
  const mountPath = path.join(tempRoot, "mounted-dmg");
  const installRoot = path.join(tempRoot, "installed");
  const isolatedHome = path.join(tempRoot, "home");
  fs.mkdirSync(mountPath, { recursive: true });
  fs.mkdirSync(installRoot, { recursive: true });
  fs.mkdirSync(isolatedHome, { recursive: true });
  let mounted = false;

  try {
    runChecked("/usr/bin/hdiutil", [
      "attach",
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mountPath,
      dmgPath,
    ]);
    mounted = true;
    const appEntries = fs.readdirSync(mountPath, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".app") && entry.isDirectory());
    if (appEntries.length !== 1) {
      throw new Error(
        `DMG must contain exactly one app bundle, found ${appEntries.length}`,
      );
    }
    const mountedApp = path.join(mountPath, appEntries[0].name);
    const installedApp = path.join(installRoot, appEntries[0].name);
    runChecked("/usr/bin/ditto", [mountedApp, installedApp]);
    const identity = inspectInstalledBundle({
      appPath: installedApp,
      expectedSnapshotBytes,
    });

    const packageSmoke = await runPackagedSidecarSmoke({
      binaryPath: identity.sidecarPath,
      evidencePath,
      artifactPath,
      snapshotPath,
    });
    const installedLifecycle = await runInstalledLifecycle({
      identity,
      isolatedHome,
    });
    const installedP6Matrix = await runMatrix({
      pythonPath,
      wheelPath: artifactPath,
      installedApp,
      appVersion: identity.version,
    });
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const pupuRevision = runChecked("/usr/bin/git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
    });
    const pupuDirty = Boolean(runChecked("/usr/bin/git", ["status", "--porcelain"], {
      cwd: repoRoot,
    }));
    const report = {
      schema: REPORT_SCHEMA,
      candidate_class: "diagnostic_local_unsigned",
      release_qualification: false,
      executed_tests:
        packageSmoke.executed_tests +
        installedLifecycle.executed_tests +
        installedP6Matrix.executed_tests,
      source: {
        pupu_revision: pupuRevision,
        pupu_dirty: pupuDirty,
        unchain_revision: artifactEvidence.source.revision,
        unchain_dirty: artifactEvidence.source.dirty,
      },
      identity: {
        version: identity.version,
        runtime_manifest_digest:
          artifactEvidence.runtime_manifest.manifest_digest,
        snapshot_fingerprint: identity.snapshotFingerprint,
        hashes: {
          dmg: hashFileSha256(dmgPath),
          wheel: hashFileSha256(artifactPath),
          ...identity.hashes,
        },
      },
      package_smoke: packageSmoke,
      installed_lifecycle: installedLifecycle,
      installed_p6_matrix: installedP6Matrix,
      limitations: [
        "PuPu source worktree was dirty; this is diagnostic evidence only.",
        "The local macOS candidate is unsigned/not notarized release evidence.",
        "Unsigned random-path lifecycle launch used Chromium's isolated mock keychain; release signing and real Keychain UX remain untested.",
        "Windows installed and active-containment matrices were not executed.",
      ],
    };
    return validateMacOsInstalledCandidateReport(report);
  } finally {
    if (mounted) {
      try {
        runChecked("/usr/bin/hdiutil", ["detach", mountPath]);
      } catch {
        runChecked("/usr/bin/hdiutil", ["detach", "-force", mountPath]);
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const outputPath = path.resolve(args.out);
    const report = await runMacOsInstalledCandidate({
      dmgPath: path.resolve(args.dmg),
      artifactPath: path.resolve(args.artifact),
      evidencePath: path.resolve(args.evidence),
      snapshotPath: path.resolve(args.snapshot),
      pythonPath: path.resolve(args.python),
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(
      `[release-qa] macOS installed candidate passed (${report.executed_tests} checks)`,
    );
  } catch (error) {
    console.error(
      `[release-qa] macOS installed candidate failed: ${error.message}`,
    );
    process.exitCode = 1;
  }
}
