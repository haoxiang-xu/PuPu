import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import {
  buildProductionAppUpdateConfig,
  prepareProductionAppUpdate,
  validateProductionAppUpdate,
  validateProductionAppUpdateFile,
} from "./production-app-update.mjs";

// Exercise the exact metadata consumed by the workflow CLI. A handwritten
// lowercase package name hid a release-blocking mismatch with the real PuPu name.
const packageJson = Object.freeze(JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
));

const expected = Object.freeze({
  owner: "haoxiang-xu",
  repo: "PuPu",
  provider: "github",
  releaseType: "release",
  updaterCacheDirName: "pupu-updater",
});

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-production-app-update-"));
  const packageJsonPath = path.join(root, "package.json");
  const resourceRoot = path.join(root, "resources");
  const appUpdatePath = path.join(resourceRoot, "app-update.yml");
  fs.mkdirSync(resourceRoot);
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return {
    root,
    packageJsonPath,
    appUpdatePath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

test("production updater config matches Electron Builder's closed GitHub config", () => {
  assert.deepEqual(buildProductionAppUpdateConfig(packageJson), expected);
  const validated = validateProductionAppUpdate({
    contents: YAML.stringify(expected),
    packageJson,
  });
  assert.deepEqual(validated.config, expected);
  assert.match(validated.sha256, /^sha256:[0-9a-f]{64}$/);
});

test("prepare creates the missing config and validates an idempotent retry", () => {
  const f = fixture();
  try {
    const first = prepareProductionAppUpdate({
      appUpdatePath: f.appUpdatePath,
      packageJsonPath: f.packageJsonPath,
    });
    const firstContents = fs.readFileSync(f.appUpdatePath, "utf8");
    const second = prepareProductionAppUpdate({
      appUpdatePath: f.appUpdatePath,
      packageJsonPath: f.packageJsonPath,
    });
    assert.deepEqual(YAML.parse(firstContents), expected);
    assert.deepEqual(second, first);
    assert.deepEqual(
      validateProductionAppUpdateFile({
        appUpdatePath: f.appUpdatePath,
        packageJsonPath: f.packageJsonPath,
      }),
      first,
    );
  } finally {
    f.cleanup();
  }
});

test("prepare refuses to overwrite a stale or test-only config", () => {
  const f = fixture();
  const stale = "provider: generic\nurl: http://127.0.0.1:38193/\nupdaterCacheDirName: pupu-updater\n";
  try {
    fs.writeFileSync(f.appUpdatePath, stale);
    assert.throws(
      () => prepareProductionAppUpdate({
        appUpdatePath: f.appUpdatePath,
        packageJsonPath: f.packageJsonPath,
      }),
      /keys must be exactly|production updater config/,
    );
    assert.equal(fs.readFileSync(f.appUpdatePath, "utf8"), stale);
  } finally {
    f.cleanup();
  }
});

test("validation rejects missing, extra, or mismatched production fields", () => {
  const cases = [
    { ...expected, provider: "generic" },
    { ...expected, owner: "someone-else" },
    { ...expected, repo: "Other" },
    { ...expected, releaseType: "draft" },
    { ...expected, updaterCacheDirName: "other-updater" },
    { owner: expected.owner, repo: expected.repo, provider: expected.provider },
    { ...expected, channel: "latest" },
  ];
  for (const candidate of cases) {
    assert.throws(
      () => validateProductionAppUpdate({
        contents: YAML.stringify(candidate),
        packageJson,
      }),
      /production updater config|keys must be exactly/,
    );
  }
});

test("package metadata must retain the exact public PuPu updater identity", () => {
  for (const candidate of [
    { ...packageJson, name: "renamed" },
    { ...packageJson, name: "pupu" },
    { ...packageJson, build: { publish: [] } },
    { ...packageJson, build: { publish: [{ ...packageJson.build.publish[0], owner: "someone-else" }] } },
    { ...packageJson, build: { publish: [{ ...packageJson.build.publish[0], releaseType: "draft" }] } },
    { ...packageJson, build: { publish: [{ ...packageJson.build.publish[0], channel: "beta" }] } },
  ]) {
    assert.throws(() => buildProductionAppUpdateConfig(candidate), /production publish config/);
  }
});
