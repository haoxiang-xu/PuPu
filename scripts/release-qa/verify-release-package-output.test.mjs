import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  expectedTargetAssets,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/release-qa/verify-release-package-output.mjs");
const CONTRACT = readReleaseArtifactContract(
  path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"),
);

function fixture(targetId, { omit = "", support = [], extra = [], version = "0.1.10" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-package-output-"));
  for (const asset of expectedTargetAssets(CONTRACT, version).filter((candidate) => candidate.target_id === targetId)) {
    if (asset.name !== omit) fs.writeFileSync(path.join(dir, asset.name), asset.name, "utf8");
  }
  const target = CONTRACT.targets.find((candidate) => candidate.id === targetId);
  if (target.updater_channel) fs.writeFileSync(path.join(dir, target.updater_channel), `version: ${version}\n`, "utf8");
  for (const fileName of support) fs.writeFileSync(path.join(dir, fileName), "builder support", "utf8");
  for (const fileName of extra) fs.writeFileSync(path.join(dir, fileName), "unexpected", "utf8");
  return { dir, version };
}

function run(targetId, dir, version) {
  return spawnSync(process.execPath, [SCRIPT, "--target", targetId, "--version", version, "--dist-dir", dir], {
    encoding: "utf8",
  });
}

test("package output verifier requires the exact artifact set for each supported v0.1.10 target", () => {
  for (const targetId of ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"]) {
    const { dir, version } = fixture(targetId);
    const result = run(targetId, dir, version);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("package output verifier requires full RC filenames on every supported target", () => {
  for (const targetId of ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"]) {
    const { dir, version } = fixture(targetId, { version: "0.1.10-rc.1" });
    const result = run(targetId, dir, version);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.readdirSync(dir).some((name) => name.includes("0.1.10-rc.1")));
    assert.equal(fs.readdirSync(dir).some((name) => name.includes("PuPu-0.1.10-") && !name.includes("-rc.1")), false);
  }
});

test("package output verifier rejects a missing canonical artifact and future reserved targets", () => {
  const { dir, version } = fixture("windows-x64", {
    omit: "PuPu-0.1.10-windows-x64-setup.exe.blockmap",
  });
  const missing = run("windows-x64", dir, version);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /missing=/);

  const reserved = run("windows-arm64", dir, version);
  assert.notEqual(reserved.status, 0);
  assert.match(reserved.stderr, /must be required/);
});

test("package output verifier permits only documented builder support files", () => {
  const mac = fixture("macos-arm64", {
    support: [
      "PuPu-0.1.10-macos-arm64.dmg.blockmap",
      "builder-effective-config.yaml",
      "builder-debug.yml",
    ],
  });
  assert.equal(run("macos-arm64", mac.dir, mac.version).status, 0);

  const linux = fixture("linux-x64", {
    support: ["latest-linux.yml", "builder-effective-config.yaml"],
  });
  assert.equal(run("linux-x64", linux.dir, linux.version).status, 0);
});

test("package output verifier rejects an extra release-looking filename", () => {
  const { dir, version } = fixture("windows-x64", {
    extra: ["PuPu-0.1.10-windows-arm64-setup.exe"],
  });
  const result = run("windows-x64", dir, version);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected=.*windows-arm64/);
});
