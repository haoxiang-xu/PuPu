import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";

import YAML from "yaml";
import { prepareProductionAppUpdate } from "./production-app-update.mjs";

const require = createRequire(import.meta.url);
const { PublishManager } = require("app-builder-lib/out/publish/PublishManager.js");
const { PlatformPackager } = require("app-builder-lib/out/platformPackager.js");
const { AppInfo } = require("app-builder-lib/out/appInfo.js");
const { Platform } = require("app-builder-lib");
const { CancellationToken } = require("builder-util-runtime");
const { NsisUpdater } = require("electron-updater/out/NsisUpdater.js");
const sourcePackage = require("../../package.json");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-production-updater-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "resources"));
  return { root, appUpdatePath: path.join(root, "resources", "app-update.yml") };
}

// Run the dependency's actual config producer with the repository's real
// metadata. Only its packaging event bus and filesystem layout are isolated.
function builder(f) {
  const config = structuredClone(sourcePackage.build);
  const info = { config, metadata: sourcePackage };
  info.appInfo = new AppInfo(info);
  const packager = {
    config, info, appInfo: info.appInfo, platform: Platform.WINDOWS,
    platformSpecificBuildOptions: {}, isForceCodeSigningVerification: false,
    expandMacro: (value) => value,
    getResourcesDir: (output) => path.join(output, "resources"),
  };
  let afterPack;
  new PublishManager({
    cancellationToken: new CancellationToken(),
    onAfterPack: (callback) => { afterPack = callback; },
    onArtifactCreated() {},
  }, { publish: "never" });
  return (target) => afterPack({
    packager, appOutDir: f.root, electronPlatformName: "win32", arch: 1,
    targets: [{ name: target }],
  });
}

test("real project metadata repairs dir omission and matches the actual NSIS config producer", async (t) => {
  const actual = fixture(t);
  await builder(actual)("dir");
  assert.equal(fs.existsSync(actual.appUpdatePath), false);
  prepareProductionAppUpdate(actual);
  const expected = fixture(t);
  await builder(expected)("nsis");
  assert.deepEqual(
    YAML.parse(fs.readFileSync(actual.appUpdatePath, "utf8")),
    YAML.parse(fs.readFileSync(expected.appUpdatePath, "utf8")),
  );
});

test("actual prepackaged path preserves production updater bytes through both installer passes", async (t) => {
  const f = fixture(t);
  prepareProductionAppUpdate(f);
  const before = fs.readFileSync(f.appUpdatePath);
  let packCalls = 0;
  for (let pass = 0; pass < 2; pass++) {
    await PlatformPackager.prototype.doPack.call({
      packagerOptions: { prepackaged: f.root },
      info: { cancellationToken: { cancelled: false }, emitBeforePack() { packCalls++; } },
    }, { appOutDir: f.root, targets: [{ name: "nsis" }] });
    assert.deepEqual(fs.readFileSync(f.appUpdatePath), before);
  }
  assert.equal(packCalls, 0);
});

test("real Windows updater consumes produced config and resolves the GitHub stable EXE", async (t) => {
  const f = fixture(t);
  prepareProductionAppUpdate(f);
  const updater = new NsisUpdater(undefined, {
    version: "0.1.12", name: "PuPu", isPackaged: true,
    userDataPath: path.join(f.root, "isolated-user"),
    baseCachePath: path.join(f.root, "isolated-cache"),
    whenReady: async () => {},
  });
  updater.logger = null;
  updater.updateConfigPath = f.appUpdatePath;
  updater._testOnlyOptions = { platform: "win32" };
  const requests = [];
  // The real provider parses responses and constructs download URLs. Network,
  // EXE installation, Electron launch and restart are outside this unit check.
  updater.httpExecutor = { request: async (request) => {
    assert.equal(request.hostname, "github.com");
    requests.push(request.path);
    if (request.path === "/haoxiang-xu/PuPu/releases.atom") {
      return '<feed><entry><link href="https://github.com/haoxiang-xu/PuPu/releases/tag/v0.1.13"/><title>v0.1.13</title><content>release</content></entry></feed>';
    }
    if (request.path === "/haoxiang-xu/PuPu/releases/latest") {
      return JSON.stringify({ tag_name: "v0.1.13" });
    }
    assert.equal(request.path, "/haoxiang-xu/PuPu/releases/download/v0.1.13/latest.yml");
    return YAML.stringify({
      version: "0.1.13",
      files: [{ url: "PuPu-0.1.13-windows-x64-setup.exe", sha512: crypto.createHash("sha512").update("probe").digest("base64"), size: 5 }],
    });
  } };
  const { provider, info } = await updater.getUpdateInfoAndProvider();
  assert.equal(provider.constructor.name, "GitHubProvider");
  assert.equal(info.version, "0.1.13");
  assert.equal(provider.resolveFiles(info)[0].url.href,
    "https://github.com/haoxiang-xu/PuPu/releases/download/v0.1.13/PuPu-0.1.13-windows-x64-setup.exe");
  assert.equal(requests.length, 3);
  const cache = await updater.getOrCreateDownloadHelper();
  assert.equal(cache.cacheDir, path.join(f.root, "isolated-cache", "pupu-updater"));
});

test("workflow CLI consumes real package.json and refuses existing config drift without overwrite", (t) => {
  const f = fixture(t);
  const script = path.join(import.meta.dirname, "production-app-update.mjs");
  const run = (mode) => spawnSync(process.execPath, [script, mode, "--app-update", f.appUpdatePath], { encoding: "utf8" });
  assert.equal(run("prepare").status, 0);
  assert.equal(run("validate").status, 0);
  fs.appendFileSync(f.appUpdatePath, "channel: beta\n");
  const before = fs.readFileSync(f.appUpdatePath);
  assert.equal(run("prepare").status, 1);
  assert.equal(run("validate").status, 1);
  assert.deepEqual(fs.readFileSync(f.appUpdatePath), before);
});
