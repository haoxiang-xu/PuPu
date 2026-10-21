import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import test from "node:test";

import YAML from "yaml";
import { prepareProductionAppUpdate, validateProductionAppUpdateFile } from "./production-app-update.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const source = fs.readFileSync(new URL("./installed-package-qualification.mjs", import.meta.url), "utf8");
const start = source.indexOf("export async function runInstalledPackageQualification");
const end = source.indexOf("const parseArgs =", start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start, end).replace(/^export /gm, "");

// Execute the production installation orchestrator with a real updater file
// and real validator. OS installation and app launch remain explicit test seams.
for (const fault of ["valid", "missing", "provider", "owner", "repo", "releaseType", "cache", "missing-key", "extra-key", "duplicate-key", "malformed"]) {
  test(`installed qualification admission enforces the real updater file: ${fault}`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-updater-install-contract-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const resources = path.join(root, "installed", "resources");
    fs.mkdirSync(resources, { recursive: true });
    const appUpdatePath = path.join(resources, "app-update.yml");
    prepareProductionAppUpdate({ appUpdatePath });
    const valid = fs.readFileSync(appUpdatePath, "utf8");
    const invalid = {
      provider: valid.replace("provider: github", "provider: generic"),
      owner: valid.replace("owner: haoxiang-xu", "owner: other"),
      repo: valid.replace("repo: PuPu", "repo: Other"),
      releaseType: valid.replace("releaseType: release", "releaseType: draft"),
      cache: valid.replace("pupu-updater", "other-updater"),
      "missing-key": valid.replace(/^releaseType:.*\n/m, ""),
      "extra-key": `${valid}channel: beta\n`,
      "duplicate-key": `${valid}provider: generic\n`,
      malformed: "owner: [\n",
    };
    if (fault === "missing") fs.unlinkSync(appUpdatePath);
    else if (fault !== "valid") fs.writeFileSync(appUpdatePath, invalid[fault]);
    const events = [];
    const sandbox = {
      ROOT, path, os, fs, console: { log() {} },
      readReleaseArtifactContract: () => ({}), readJson: () => ({ manifest_digest: "digest" }),
      validateReleaseAssetManifest() {}, verifyReleaseAssetDirectory() {},
      requiredFormats: () => ["exe"],
      assetForFormat: () => ({ name: "candidate.exe", sha256: "sha256:candidate" }),
      hashFile: () => "sha256:candidate",
      installWindowsNsis: async () => ({
        identity: { asarPath: path.join(resources, "app.asar"), hashes: {}, snapshot: { fingerprint: "snapshot" } },
        cleanup: () => events.push("installed:cleanup"),
      }),
      validateProductionAppUpdateFile,
      launchInstalledApplication: async () => { events.push("launch"); return { executed_tests: 1 }; },
      REPORT_SCHEMA: "test",
      validateInstalledPackageQualificationReport: (report) => { events.push("report"); return report; },
      removeInstalledQualificationTempRoot: async (directory) => {
        events.push("temp:cleanup");
        fs.rmSync(directory, { recursive: true, force: true });
      },
    };
    vm.runInNewContext(`${body}\nthis.run = runInstalledPackageQualification;`, sandbox);
    const run = () => sandbox.run({ candidateDir: root, targetId: "windows-x64" });
    if (fault === "valid") {
      await run();
      assert.deepEqual(events, ["launch", "installed:cleanup", "report", "temp:cleanup"]);
    } else {
      await assert.rejects(run(), /production updater config/);
      assert.deepEqual(events, ["installed:cleanup", "temp:cleanup"]);
    }
  });
}

test("native signing preflight refuses release evidence with the fixture updater profile", {
  skip: process.platform !== "win32",
}, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-updater-signing-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "payload");
  fs.mkdirSync(payload);
  const action = YAML.parse(fs.readFileSync(path.join(ROOT, ".github/actions/windows-artifact-signing/action.yml"), "utf8"));
  const run = [
    '$ErrorActionPreference = "Stop"',
    'function npx { throw "PACKAGING_REACHED" }',
    action.runs.steps[0].run,
  ].join("\n");
  const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", run], {
    cwd: ROOT,
    env: {
      ...process.env,
      SIGNING_ROOT_PATH: root, PAYLOAD_PATH: payload,
      BOOTSTRAP_OUTPUT_PATH: path.join(root, "bootstrap"),
      INSTALLER_PATH: path.join(root, "installer.exe"),
      EVIDENCE_OUTPUT: "windows-signing-evidence.v1.json",
      EVIDENCE_SCHEMA: "pupu.windows-release-candidate-signing.v1",
      APP_UPDATE_CONTRACT: "qualification-fixture",
      PACKAGE_VERSION: "0.1.13", TARGET_ID: "windows-x64",
    },
    encoding: "utf8", timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /release-candidate signing requires the production updater config contract/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /PACKAGING_REACHED/);
});
