#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readAndVerifyUnchainArtifactEvidence } from "./unchain-artifact.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 || result.error) {
    const detail = String(
      result.stderr || result.stdout || result.error || "unknown failure",
    ).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout || "").trim();
};

const separator = process.argv.indexOf("--");
const childCommand = separator >= 0 ? process.argv[separator + 1] : "";
const childArgs = separator >= 0 ? process.argv.slice(separator + 2) : [];
if (!childCommand) {
  console.error("usage: run-with-unchain-artifact.mjs -- <package command> [args...]");
  process.exit(2);
}

let artifactPath = String(process.env.UNCHAIN_ARTIFACT_PATH || "");
let evidencePath = String(process.env.UNCHAIN_ARTIFACT_EVIDENCE_PATH || "");
let temporaryDirectory = "";

try {
  if (Boolean(artifactPath) !== Boolean(evidencePath)) {
    throw new Error(
      "UNCHAIN_ARTIFACT_PATH and UNCHAIN_ARTIFACT_EVIDENCE_PATH must be supplied together",
    );
  }
  if (!artifactPath) {
    const sourcePath = path.resolve(
      process.env.UNCHAIN_ARTIFACT_SOURCE_PATH || path.join(ROOT, "..", "unchain"),
    );
    const venvPython = process.platform === "win32"
      ? path.join(ROOT, ".venv", "Scripts", "python.exe")
      : path.join(ROOT, ".venv", "bin", "python");
    const python = process.env.PYTHON ||
      (fs.existsSync(venvPython)
        ? venvPython
        : process.platform === "win32" ? "python" : "python3");
    let sourceRef = String(process.env.UNCHAIN_ARTIFACT_SOURCE_REF || "");
    if (!sourceRef) {
      const symbolicRef = spawnSync(
        "git",
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        { cwd: sourcePath, encoding: "utf8" },
      );
      sourceRef = symbolicRef.status === 0
        ? String(symbolicRef.stdout || "").trim()
        : run("git", ["rev-parse", "HEAD"], { cwd: sourcePath });
    }
    fs.mkdirSync(path.join(ROOT, ".release-qa"), { recursive: true });
    temporaryDirectory = fs.mkdtempSync(
      path.join(ROOT, ".release-qa", "local-package-artifact-"),
    );
    evidencePath = path.join(temporaryDirectory, "unchain-artifact.json");
    run(
      process.execPath,
      [
        path.join(ROOT, "scripts", "release-qa", "build-unchain-artifact.mjs"),
        "--source", sourcePath,
        "--source-ref", sourceRef,
        "--out-dir", temporaryDirectory,
        "--evidence", evidencePath,
        "--python", python,
      ],
      { stdio: "inherit" },
    );
    const wheels = fs.readdirSync(temporaryDirectory)
      .filter((name) => name.endsWith(".whl"));
    if (wheels.length !== 1) {
      throw new Error("local package preparation must produce exactly one wheel");
    }
    artifactPath = path.join(temporaryDirectory, wheels[0]);
  }

  const evidence = readAndVerifyUnchainArtifactEvidence({
    artifactPath,
    evidencePath,
  });
  console.log(
    `[package] Unchain artifact=${evidence.artifact.sha256}; ` +
      `manifest=${evidence.runtime_manifest.manifest_digest}`,
  );
  const isWindowsNpm = process.platform === "win32" && childCommand === "npm";
  const npmExecPath = String(process.env.npm_execpath || "");
  if (isWindowsNpm && !npmExecPath) {
    throw new Error("Windows npm execution requires npm_execpath");
  }
  const executable = isWindowsNpm ? process.execPath : childCommand;
  const executableArgs = isWindowsNpm
    ? [npmExecPath, ...childArgs]
    : childArgs;
  const result = spawnSync(executable, executableArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      UNCHAIN_ARTIFACT_PATH: path.resolve(artifactPath),
      UNCHAIN_ARTIFACT_EVIDENCE_PATH: path.resolve(evidencePath),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(`[package] immutable Unchain artifact preparation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
