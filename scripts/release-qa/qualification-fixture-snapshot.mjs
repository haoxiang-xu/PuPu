#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import asar from "@electron/asar";
import YAML from "yaml";

const fixtureSnapshotHash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Read the immutable N-1 workflow, not the candidate's current profile/path.
// Admit only a single literal profile argument; never execute its shell text.
export function resolveFixtureSnapshotProfile(sourceRoot) {
  const document = YAML.parseDocument(fs.readFileSync(path.join(sourceRoot,
    ".github/workflows/_shared-release-deterministic.yml"), "utf8"), { uniqueKeys: true });
  if (document.errors.length) throw new Error("invalid N-1 deterministic workflow");
  const steps = Object.values(document.toJSON().jobs || {}).flatMap((job) => job.steps || []);
  const producers = steps.filter((step) => step.id === "build_feature_snapshot");
  const run = producers[0]?.run || "";
  const matches = [...run.matchAll(/--profile\s+([A-Za-z0-9_./-]+\.json)(?=\s|$)/g)];
  if (producers.length !== 1 || matches.length !== 1 ||
      (run.match(/--profile\b/g) || []).length !== 1 ||
      !/node scripts\/write-build-feature-snapshot\.cjs\s/.test(run)) {
    throw new Error("N-1 workflow must select exactly one literal release snapshot profile");
  }
  const relative = matches[0][1];
  if (path.isAbsolute(relative) || relative.split("/").includes("..")) {
    throw new Error("N-1 snapshot profile must stay inside its source checkout");
  }
  return path.join(sourceRoot, relative);
}

export function prepareFixtureReleaseSnapshot({ sourceRoot, snapshotPath }) {
  const root = path.resolve(sourceRoot);
  const output = path.resolve(snapshotPath);
  const profilePath = resolveFixtureSnapshotProfile(root);
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  const result = spawnSync(process.execPath, [path.join(root, "scripts/write-build-feature-snapshot.cjs"),
    "--profile", profilePath, "--out", output], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`N-1 snapshot producer failed: ${result.error?.message || result.stderr}`);
  }
  const bytes = fs.readFileSync(output);
  const snapshot = JSON.parse(bytes.toString("utf8"));
  const { _pupu_memory_v2_release: release, ...flags } = snapshot;
  assert.deepEqual(flags, profile.feature_flags, "N-1 snapshot feature flags drifted from its release profile");
  assert.deepEqual(release?.sidecar_environment, profile.sidecar_environment,
    "N-1 snapshot environment drifted from its release profile");
  assert.deepEqual(Object.keys(release || {}).sort(), [
    "rollout_fingerprint", "schema", "sidecar_environment", "snapshot_fingerprint",
  ], "N-1 snapshot release metadata must be closed");
  if (flags.enable_memory_v2 !== true || release.schema !== "pupu.memory-v2-release.v1" ||
      !/^[0-9a-f]{64}$/.test(release.snapshot_fingerprint) ||
      !/^[0-9a-f]{64}$/.test(release.rollout_fingerprint)) {
    throw new Error("N-1 producer did not emit a valid enabled release snapshot");
  }
  const sha256 = fixtureSnapshotHash(bytes);
  fs.writeFileSync(`${output}.sha256`, `${sha256}\n`);
  return { profilePath, snapshotPath: output, sha256 };
}

export function verifyFixtureReleaseSnapshot({ snapshotPath, asarPath }) {
  const expected = fs.readFileSync(snapshotPath);
  const sha256 = fs.readFileSync(`${snapshotPath}.sha256`, "utf8").trim();
  if (!/^[0-9a-f]{64}$/.test(sha256) || fixtureSnapshotHash(expected) !== sha256) {
    throw new Error("N-1 release snapshot checksum mismatch");
  }
  const actual = Buffer.from(asar.extractFile(asarPath, "build/build_feature_flags.json"));
  if (!actual.equals(expected)) {
    throw new Error("packaged N-1 feature snapshot differs from its release producer output");
  }
  return { sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, first, firstPath, second, snapshotPath, ...extra] = process.argv.slice(2);
    if (extra.length || second !== "--snapshot" || !snapshotPath || !firstPath) {
      throw new Error("expected prepare --source <path> --snapshot <path> or verify --asar <path> --snapshot <path>");
    }
    let result;
    if (mode === "prepare" && first === "--source") {
      result = prepareFixtureReleaseSnapshot({ sourceRoot: firstPath, snapshotPath });
    } else if (mode === "verify" && first === "--asar") {
      result = verifyFixtureReleaseSnapshot({ asarPath: firstPath, snapshotPath });
    } else {
      throw new Error("unknown fixture snapshot command");
    }
    console.log(`[qualification-fixture-snapshot] ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`[qualification-fixture-snapshot] ${error.message}`);
    process.exitCode = 1;
  }
}
