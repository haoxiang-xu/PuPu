import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { prepareQualificationFixtureAppUpdate } from "./prepare-qualification-fixture-app-update.mjs";
import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";
import { createQualificationFixtureBuildConfig } from "./write-qualification-fixture-build-config.mjs";

const require = createRequire(import.meta.url);
const { PublishManager } = require("app-builder-lib/out/publish/PublishManager.js");
const { PlatformPackager } = require("app-builder-lib/out/platformPackager.js");
const { AppInfo } = require("app-builder-lib/out/appInfo.js");
const { Platform } = require("app-builder-lib");
const { CancellationToken } = require("builder-util-runtime");
const FEED_URL = "http://127.0.0.1:38193/";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-fixture-updater-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "resources"));
  return { root, appUpdatePath: path.join(root, "resources", "app-update.yml"), feedUrl: FEED_URL };
}

// Execute installed electron-builder code, not a reimplementation of its target
// selection or YAML producer. Only the surrounding packager/event bus is a stub.
function builder(f) {
  const sourcePackage = require("../../package.json");
  const config = createQualificationFixtureBuildConfig({ sourcePackage, feedUrl: FEED_URL });
  const info = { config, metadata: { ...sourcePackage, version: "0.1.10" } };
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
    onArtifactCreated: () => {},
  }, { publish: "never" });
  return { packager, afterPack: (target) => afterPack({
    packager, appOutDir: f.root, electronPlatformName: "win32", arch: 1,
    targets: [{ name: target }],
  }) };
}

test("real electron-builder dir producer reproduces missing config; preparation repairs it before strict admission", async (t) => {
  const f = fixture(t);
  await builder(f).afterPack("dir");
  assert.throws(() => fs.readFileSync(f.appUpdatePath, "utf8"), { code: "ENOENT" });
  prepareQualificationFixtureAppUpdate(f);
  const result = validateQualificationFixtureAppUpdate({
    contents: fs.readFileSync(f.appUpdatePath, "utf8"), feedUrl: FEED_URL,
  });
  assert.deepEqual(result, { provider: "generic", url: FEED_URL, updaterCacheDirName: "pupu-updater" });
});

test("prepared config matches real electron-builder NSIS YAML and cache identity", async (t) => {
  const expected = fixture(t);
  await builder(expected).afterPack("nsis");
  const produced = fixture(t);
  prepareQualificationFixtureAppUpdate(produced);
  const parse = (f) => validateQualificationFixtureAppUpdate({
    contents: fs.readFileSync(f.appUpdatePath, "utf8"), feedUrl: FEED_URL,
  });
  assert.deepEqual(parse(produced), parse(expected));
});

test("real prepackaged path skips afterPack and preserves updater bytes in both installer passes", async (t) => {
  const f = fixture(t);
  prepareQualificationFixtureAppUpdate(f);
  const before = fs.readFileSync(f.appUpdatePath);
  const { packager, afterPack } = builder(f);
  packager.config.publish = { provider: "github", owner: "haoxiang-xu", repo: "PuPu" };
  let calls = 0;
  const context = {
    packagerOptions: { prepackaged: f.root },
    info: { cancellationToken: { cancelled: false }, emitBeforePack() { calls += 1; } },
  };
  for (let pass = 0; pass < 2; pass += 1) {
    await PlatformPackager.prototype.doPack.call(context, {
      appOutDir: f.root, targets: [{ name: "nsis" }],
    });
    assert.equal(calls, 0, "prepackaged must not start repacking");
    assert.deepEqual(fs.readFileSync(f.appUpdatePath), before);
  }
  // Show that executing the actual writer WOULD change it to production. The
  // preservation assertion therefore depends on prepackaged's early return.
  await afterPack("nsis");
  assert.throws(() => prepareQualificationFixtureAppUpdate(f), /keys must be exactly/);
});

test("repeated preparation preserves valid bytes and rejects stale/foreign configurations without overwrite", (t) => {
  const f = fixture(t);
  prepareQualificationFixtureAppUpdate(f);
  const valid = `# preserve existing formatting\n${fs.readFileSync(f.appUpdatePath, "utf8")}`;
  fs.writeFileSync(f.appUpdatePath, valid);
  prepareQualificationFixtureAppUpdate(f);
  assert.equal(fs.readFileSync(f.appUpdatePath, "utf8"), valid);
  for (const bad of [
    valid.replace("38193", "38194"),
    valid.replace("pupu-updater", "another-updater"),
    `${valid}channel: beta\n`,
    "provider: github\nowner: haoxiang-xu\nrepo: PuPu\n",
  ]) {
    fs.writeFileSync(f.appUpdatePath, bad);
    assert.throws(() => prepareQualificationFixtureAppUpdate(f));
    assert.equal(fs.readFileSync(f.appUpdatePath, "utf8"), bad);
  }
});

test("invalid feed or missing payload fails without creating directories or files", (t) => {
  const f = fixture(t);
  for (const feedUrl of ["https://example.com/", "http://127.0.0.1:38193/?token=x"]) {
    assert.throws(() => prepareQualificationFixtureAppUpdate({ ...f, feedUrl }));
    assert.equal(fs.existsSync(f.appUpdatePath), false);
  }
  assert.throws(() => prepareQualificationFixtureAppUpdate({
    ...f, appUpdatePath: path.join(f.root, "absent", "app-update.yml"),
  }), { code: "ENOENT" });
  assert.equal(fs.existsSync(path.join(f.root, "absent")), false);
});

test("workflow CLI creates missing file, validates repeat, and exits nonzero on drift", (t) => {
  const f = fixture(t);
  const script = path.join(import.meta.dirname, "prepare-qualification-fixture-app-update.mjs");
  const run = () => spawnSync(process.execPath, [
    script, "--app-update", f.appUpdatePath, "--feed-url", FEED_URL,
  ], { encoding: "utf8" });
  assert.equal(run().status, 0);
  assert.equal(run().status, 0);
  fs.writeFileSync(f.appUpdatePath, "provider: github\n");
  assert.equal(run().status, 1);
});
