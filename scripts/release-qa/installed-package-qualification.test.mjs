import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstalledLaunchArguments,
  buildInstalledProcessControl,
  validateInstalledPackageQualificationReport,
} from "./installed-package-qualification.mjs";

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const fingerprint = "f".repeat(64);

const form = (format, letter) => ({
  format,
  installer: { name: `PuPu-0.1.10-${format}`, sha256: digest(letter) },
  installed: {
    executable_sha256: digest("a"),
    app_asar_sha256: digest("b"),
    sidecar_sha256: digest("c"),
    snapshot_sha256: digest("d"),
    snapshot_fingerprint: fingerprint,
  },
  lifecycle: {
    executed_tests: 4,
    renderer_ready: true,
    packaged_sidecar_descendant: true,
    controlled_shutdown: true,
    process_cleanup: true,
  },
});

const reportFor = (targetId, packageForms) => ({
  schema: "pupu.installed-package-qualification.v1",
  target_id: targetId,
  candidate: { manifest_digest: digest("e") },
  executed_tests: packageForms.length * 4,
  package_forms: packageForms,
});

const manifestFor = (targetId, packageForms) => ({
  manifest_digest: digest("e"),
  assets: packageForms.map(({ format, installer }) => ({
    target_id: targetId,
    role: "installer",
    format,
    name: installer.name,
    sha256: installer.sha256,
  })),
});

const validateReport = (report, targetId) => validateInstalledPackageQualificationReport(report, {
  manifest: manifestFor(targetId, report.package_forms),
  targetId,
  manifestDigest: digest("e"),
});

test("installed qualification disables the Electron sandbox only for Linux CI launches", () => {
  const linux = buildInstalledLaunchArguments({
    debugPort: 9222,
    userData: "/tmp/pupu-user-data",
    platform: "linux",
  });
  assert.deepEqual(linux, [
    "--remote-debugging-port=9222",
    "--user-data-dir=/tmp/pupu-user-data",
    "--no-sandbox",
  ]);

  const macos = buildInstalledLaunchArguments({
    debugPort: 9223,
    userData: "/tmp/pupu-macos-user-data",
    platform: "darwin",
  });
  assert.deepEqual(macos, [
    "--remote-debugging-port=9223",
    "--user-data-dir=/tmp/pupu-macos-user-data",
    "--use-mock-keychain",
  ]);

  const windows = buildInstalledLaunchArguments({
    debugPort: 9224,
    userData: "C:\\pupu-user-data",
    platform: "win32",
  });
  assert.deepEqual(windows, [
    "--remote-debugging-port=9224",
    "--user-data-dir=C:\\pupu-user-data",
  ]);
});

test("installed qualification shuts down the complete Linux process group", () => {
  assert.deepEqual(
    buildInstalledProcessControl({ platform: "linux", pid: 4242 }),
    { detached: true, shutdownPid: -4242 },
  );
  assert.deepEqual(
    buildInstalledProcessControl({ platform: "darwin", pid: 4242 }),
    { detached: false, shutdownPid: 4242 },
  );
  assert.deepEqual(
    buildInstalledProcessControl({ platform: "win32", pid: 4242 }),
    { detached: false, shutdownPid: 4242 },
  );
});

test("installed qualification accepts the exact package forms for each target", () => {
  for (const [targetId, forms] of Object.entries({
    "macos-arm64": [form("dmg", "1")],
    "macos-x64": [form("dmg", "2")],
    "windows-x64": [form("exe", "3")],
    "linux-x64": [form("AppImage", "4"), form("deb", "5")],
  })) {
    const result = validateReport(reportFor(targetId, forms), targetId);
    assert.equal(result.target_id, targetId);
  }
});

test("installed qualification fails closed on wrong package forms and zero evidence", () => {
  const wrongForm = reportFor("windows-x64", [form("dmg", "1")]);
  assert.throws(
    () => validateReport(wrongForm, "windows-x64"),
    /format is invalid|package forms/,
  );
  const zero = reportFor("macos-arm64", [form("dmg", "1")]);
  zero.package_forms[0].lifecycle.executed_tests = 0;
  zero.executed_tests = 0;
  assert.throws(
    () => validateReport(zero, "macos-arm64"),
    /positive safe integer/,
  );
});

test("installed qualification rejects identity drift and incomplete lifecycle evidence", () => {
  const report = reportFor("linux-x64", [form("AppImage", "1"), form("deb", "2")]);
  report.candidate.manifest_digest = digest("0");
  assert.throws(
    () => validateInstalledPackageQualificationReport(report, {
      manifest: manifestFor("linux-x64", report.package_forms),
      manifestDigest: digest("e"),
    }),
    /manifest digest/,
  );
  const cleanup = reportFor("macos-arm64", [form("dmg", "1")]);
  cleanup.package_forms[0].lifecycle.process_cleanup = false;
  assert.throws(
    () => validateReport(cleanup, "macos-arm64"),
    /process_cleanup must be true/,
  );
});

test("installed qualification rejects installer identity outside the candidate manifest", () => {
  const wrongName = reportFor("windows-x64", [form("exe", "1")]);
  const expected = manifestFor("windows-x64", wrongName.package_forms);
  wrongName.package_forms[0].installer.name = "not-in-candidate.exe";
  assert.throws(
    () => validateInstalledPackageQualificationReport(wrongName, {
      manifest: expected,
      manifestDigest: digest("e"),
      targetId: "windows-x64",
    }),
    /installer.name does not match candidate manifest/,
  );

  const wrongHash = reportFor("windows-x64", [form("exe", "1")]);
  const expectedHash = manifestFor("windows-x64", wrongHash.package_forms);
  wrongHash.package_forms[0].installer.sha256 = digest("9");
  assert.throws(
    () => validateInstalledPackageQualificationReport(wrongHash, {
      manifest: expectedHash,
      manifestDigest: digest("e"),
      targetId: "windows-x64",
    }),
    /installer.sha256 does not match candidate manifest/,
  );
});
