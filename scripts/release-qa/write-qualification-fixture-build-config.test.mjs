import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createQualificationFixtureBuildConfig,
  validateRunnerLoopbackFeedUrl,
  writeQualificationFixtureBuildConfig,
} from "./write-qualification-fixture-build-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PACKAGE_PATH = path.join(ROOT, "package.json");

test("qualification fixture build config changes only the signed package updater provider", () => {
  const sourcePackage = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  const config = createQualificationFixtureBuildConfig({
    sourcePackage,
    feedUrl: "http://127.0.0.1:42871/",
  });
  const { publish: ignoredSourcePublish, ...sourceWithoutPublish } = sourcePackage.build;
  const { publish: fixturePublish, ...fixtureWithoutPublish } = config;
  assert.deepEqual(fixtureWithoutPublish, sourceWithoutPublish);
  assert.deepEqual(fixturePublish, {
    provider: "generic",
    url: "http://127.0.0.1:42871/",
  });
});

test("qualification fixture config rejects every feed other than a runner-loopback root endpoint", () => {
  for (const value of [
    "https://127.0.0.1:42871/",
    "http://localhost:42871/",
    "http://127.0.0.1/",
    "http://127.0.0.1:42871/updates",
    "http://127.0.0.1:42871/?token=secret",
  ]) {
    assert.throws(() => validateRunnerLoopbackFeedUrl(value), /127\.0\.0\.1/);
  }
});

test("qualification fixture config is written once and fails closed on unexpected source publishers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-fixture-config-"));
  try {
    const sourcePath = path.join(root, "package.json");
    const output = path.join(root, "nested", "fixture-builder.json");
    fs.writeFileSync(sourcePath, fs.readFileSync(PACKAGE_PATH));
    const config = writeQualificationFixtureBuildConfig({
      packageJsonPath: sourcePath,
      feedUrl: "http://127.0.0.1:42871/",
      outPath: output,
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), config);
    assert.throws(
      () => writeQualificationFixtureBuildConfig({
        packageJsonPath: sourcePath,
        feedUrl: "http://127.0.0.1:42871/",
        outPath: output,
      }),
      /must not already exist/,
    );
    const badSource = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    badSource.build.publish = [{ provider: "generic", url: "https://example.invalid/" }];
    assert.throws(
      () => createQualificationFixtureBuildConfig({
        sourcePackage: badSource,
        feedUrl: "http://127.0.0.1:42871/",
      }),
      /source build publish config/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
