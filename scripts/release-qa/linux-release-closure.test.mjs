import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

import YAML from "yaml";

import {
  expectedReleaseAssetNames,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const { createUpdateService, UPDATE_STAGES } = require("../../electron/main/services/update/service");

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
const qualificationWorkflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/release-qualification.yml"),
  "utf8",
);
const sharedInstalledWorkflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/_shared-release-update-qualification.yml"),
  "utf8",
);
const windowsRestartWorkflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/_shared-release-windows-restart-update.yml"),
  "utf8",
);

test("Linux release contract is AppImage plus deb with no in-app updater channel", () => {
  const linux = contract.targets.find((target) => target.id === "linux-x64");
  assert.ok(linux);
  assert.equal(linux.status, "required");
  assert.equal(linux.updater_channel, null);
  assert.deepEqual(
    linux.artifacts.map((artifact) => `${artifact.role}:${artifact.format}`),
    ["installer:AppImage", "installer:deb"],
  );
  assert.equal(
    contract.updater_channels.some((channel) => channel.target_ids.includes("linux-x64")),
    false,
  );
  assert.equal(packageJson.build.linux.publish, null);

  const names = expectedReleaseAssetNames(contract, "0.2.0");
  assert.ok(names.includes("PuPu-0.2.0-linux-x64.AppImage"));
  assert.ok(names.includes("PuPu-0.2.0-linux-x64.deb"));
  assert.equal(names.includes("latest-linux.yml"), false);
});

test("Linux installed qualification runs both retained package forms on the closed Ubuntu tuple", () => {
  for (const [label, source] of [
    ["release qualification", qualificationWorkflow],
    ["shared installed qualification", sharedInstalledWorkflow],
  ]) {
    const document = YAML.parseDocument(source, { uniqueKeys: true });
    assert.deepEqual(document.errors.map((error) => error.message), [], `${label} must be valid YAML`);
  }
  assert.match(qualificationWorkflow, /target_id: linux-x64\s+os: ubuntu-latest/);
  assert.match(sharedInstalledWorkflow, /linux-x64:ubuntu-latest/);
  assert.match(sharedInstalledWorkflow, /xvfb-run -a node scripts\/release-qa\/installed-package-qualification\.mjs/);
  assert.doesNotMatch(windowsRestartWorkflow, /linux-x64|latest-linux\.yml/);
});

test("packaged Linux fails closed before any updater provider or startup timer is used", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const originalSetTimeout = global.setTimeout;
  let scheduled = false;
  let updateChecks = 0;
  try {
    Object.defineProperty(process, "platform", { value: "linux" });
    global.setTimeout = () => {
      scheduled = true;
      return 1;
    };

    const autoUpdater = new EventEmitter();
    autoUpdater.checkForUpdates = async () => {
      updateChecks += 1;
    };
    autoUpdater.quitAndInstall = () => {};
    const service = createUpdateService({
      app: {
        isPackaged: true,
        getPath: () => "/tmp/pupu-linux-update-contract",
        getVersion: () => "0.2.0",
      },
      webContents: { getAllWebContents: () => [] },
      autoUpdater,
      fs: {
        readFileSync: () => { throw new Error("ENOENT"); },
        writeFileSync: () => {},
      },
      path,
    });

    assert.equal(service.isInAppUpdateSupported(), false);
    service.applyUnsupportedRuntimeMessage();
    assert.deepEqual(service.getAppUpdateStatePayload(), {
      stage: UPDATE_STAGES.IDLE,
      currentVersion: "0.2.0",
      message: "In-app updates are available on macOS and Windows only.",
    });
    service.scheduleStartupAutoUpdateCheck();
    assert.equal(scheduled, false);
    assert.deepEqual(await service.checkAndDownloadAppUpdate(), { started: false });
    assert.equal(updateChecks, 0);
    assert.equal(service.getAppUpdateStatePayload().stage, UPDATE_STAGES.ERROR);
  } finally {
    global.setTimeout = originalSetTimeout;
    Object.defineProperty(process, "platform", originalPlatform);
  }
});
