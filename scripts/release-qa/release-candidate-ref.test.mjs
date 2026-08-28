import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveReleaseCandidateRef } from "./release-candidate-ref.mjs";

const scriptPath = fileURLToPath(new URL("./release-candidate-ref.mjs", import.meta.url));

test("candidate policy resolves stable and numbered RC refs against one stable package version", () => {
  assert.deepEqual(resolveReleaseCandidateRef({
    tag: "v0.1.10",
    packageVersion: "0.1.10",
    policy: "candidate",
  }), {
    tag: "v0.1.10",
    baseVersion: "0.1.10",
    effectiveVersion: "0.1.10",
    lane: "stable",
    promotable: true,
  });

  assert.deepEqual(resolveReleaseCandidateRef({
    tag: "v0.1.10-rc.1",
    packageVersion: "0.1.10",
  }), {
    tag: "v0.1.10-rc.1",
    baseVersion: "0.1.10",
    effectiveVersion: "0.1.10-rc.1",
    lane: "rc",
    promotable: false,
  });

  assert.equal(resolveReleaseCandidateRef({
    tag: "v12.34.56-rc.789",
    packageVersion: "12.34.56",
  }).effectiveVersion, "12.34.56-rc.789");
});

test("promotion policy admits only the exact stable tag", () => {
  assert.equal(resolveReleaseCandidateRef({
    tag: "v0.1.10",
    packageVersion: "0.1.10",
    policy: "promotion",
  }).promotable, true);

  assert.throws(() => resolveReleaseCandidateRef({
    tag: "v0.1.10-rc.1",
    packageVersion: "0.1.10",
    policy: "promotion",
  }), /not eligible for promotion/);
});

test("release ref parsing rejects non-RC prereleases, metadata, case drift, and invalid counters", () => {
  for (const tag of [
    "v0.1.10-beta.1",
    "v0.1.10-alpha",
    "v0.1.10-RC.1",
    "v0.1.10-rc",
    "v0.1.10-rc.0",
    "v0.1.10-rc.01",
    "v0.1.10-rc.-1",
    "v0.1.10-rc.1+build.4",
    "v0.1.10+build.4",
    "0.1.10",
    "v00.1.10",
    " v0.1.10",
    "v0.1.10 ",
  ]) {
    assert.throws(() => resolveReleaseCandidateRef({ tag, packageVersion: "0.1.10" }));
  }
});

test("release ref parsing rejects unstable package versions, identity mismatch, and unknown policy", () => {
  for (const packageVersion of [
    "0.1.10-rc.1",
    "0.1.10+build.4",
    "v0.1.10",
    "00.1.10",
    "0.1",
    "0.1.10 ",
  ]) {
    assert.throws(() => resolveReleaseCandidateRef({
      tag: "v0.1.10",
      packageVersion,
    }), /package version/);
  }

  assert.throws(() => resolveReleaseCandidateRef({
    tag: "v0.1.11-rc.1",
    packageVersion: "0.1.10",
  }), /must match package version/);
  assert.throws(() => resolveReleaseCandidateRef({
    tag: "v0.1.10",
    packageVersion: "0.1.10",
    policy: "publish",
  }), /must be one of/);
});

test("CLI emits the closed ref projection and fails closed on invalid invocation", () => {
  const success = spawnSync(process.execPath, [
    scriptPath,
    "--tag", "v0.1.10-rc.2",
    "--package-version", "0.1.10",
    "--policy", "candidate",
  ], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(JSON.parse(success.stdout), {
    tag: "v0.1.10-rc.2",
    baseVersion: "0.1.10",
    effectiveVersion: "0.1.10-rc.2",
    lane: "rc",
    promotable: false,
  });

  const promotion = spawnSync(process.execPath, [
    scriptPath,
    "--tag", "v0.1.10-rc.2",
    "--package-version", "0.1.10",
    "--policy", "promotion",
  ], { encoding: "utf8" });
  assert.equal(promotion.status, 1);
  assert.match(promotion.stderr, /not eligible for promotion/);

  const unsupported = spawnSync(process.execPath, [
    scriptPath,
    "--tag", "v0.1.10",
    "--package-version", "0.1.10",
    "--policy", "candidate",
    "--extra", "value",
  ], { encoding: "utf8" });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /unsupported argument/);
});
