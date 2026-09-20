import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { finished } from "node:stream/promises";
import asar from "@electron/asar";
import { inspectResources } from "./installed-package-qualification.mjs";

const snapshotBytes = (fingerprint = "a", enabled = true) => JSON.stringify({
  enable_memory_v2: enabled,
  _pupu_memory_v2_release: { snapshot_fingerprint: fingerprint.repeat(64) },
});
const digest = (bytes) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;

// Real tiny ASARs, not a mocked extractFile: only data files are created. Neither
// the app, Sidecar, installer nor any model is executed on the developer's host.
async function makeArchives(t, next = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-restart-asar-"));
  const archives = [];
  t.after(() => {
    for (const archive of archives) asar.uncache(archive);
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function build(name, { bytes, padding, omitSnapshot = false }) {
    const input = path.join(root, name, "input");
    const resourceRoot = path.join(root, name, "resources");
    const executablePath = path.join(root, name, "PuPu");
    const sidecarPath = path.join(resourceRoot, "unchain_runtime/dist/macos/unchain-server");
    fs.mkdirSync(path.join(input, "build"), { recursive: true });
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(executablePath, "inert test executable bytes");
    fs.writeFileSync(sidecarPath, "inert test Sidecar bytes");
    fs.writeFileSync(path.join(input, "build/aaa.svg"), `<svg>${"x".repeat(padding)}</svg>`);
    if (!omitSnapshot) fs.writeFileSync(path.join(input, "build/build_feature_flags.json"), bytes);
    const archive = path.join(resourceRoot, "app.asar");
    archives.push(archive);
    // This pinned ASAR implementation resolves with out.end(), before the
    // writable has necessarily flushed. Do not inspect/copy a partial fixture.
    const output = await asar.createPackage(input, archive);
    await finished(output);
    return { archive, resourceRoot, executablePath, sidecarPlatform: "macos", sidecarPath, bytes };
  }
  const old = await build("installed", { bytes: snapshotBytes(), padding: 10 });
  const candidate = await build("candidate", { bytes: snapshotBytes("b"), padding: 300, ...next });
  return { old, candidate, replace: () => fs.copyFileSync(candidate.archive, old.archive) };
}

function assertCandidateIdentity(installed, candidate) {
  // Use the production restart comparator without making private APIs public.
  const source = fs.readFileSync(new URL("./run-restart-update-qualification.mjs", import.meta.url), "utf8");
  const start = source.indexOf("const assertUpdatedIdentity =");
  const end = source.indexOf("const findRelaunchedRoot =", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ path, inspectResources, sidecarPlatformForTarget: () => "macos" });
  vm.runInContext(source.slice(start, end) + "\nthis.check = assertUpdatedIdentity;", context);
  return context.check({
    installed: { identity: { asarPath: installed.archive, executablePath: installed.executablePath } },
    targetId: "macos-arm64",
    expected: {
      executable_sha256: digest(fs.readFileSync(candidate.executablePath)),
      app_asar_sha256: digest(fs.readFileSync(candidate.archive)),
      sidecar_sha256: digest(fs.readFileSync(candidate.sidecarPath)),
      snapshot_sha256: digest(candidate.bytes),
      snapshot_fingerprint: JSON.parse(candidate.bytes)._pupu_memory_v2_release.snapshot_fingerprint,
    },
  });
}

test("same-path N-1 to N ASAR replacement refreshes offsets and passes exact candidate identity", async (t) => {
  const f = await makeArchives(t);
  assert.equal(inspectResources(f.old).snapshot.fingerprint, "a".repeat(64));
  f.replace();
  const actual = assertCandidateIdentity(f.old, f.candidate);
  assert.equal(actual.snapshot_fingerprint, "b".repeat(64));
  assert.equal(actual.snapshot_sha256, digest(f.candidate.bytes));
  assert.equal(actual.app_asar_sha256, digest(fs.readFileSync(f.candidate.archive)));
});

test("reinspection of an unchanged installed ASAR remains deterministic", async (t) => {
  const f = await makeArchives(t);
  assert.deepEqual(inspectResources(f.old), inspectResources(f.old));
});

test("ASAR refresh also handles N to N-1 replacement at the same path", async (t) => {
  const f = await makeArchives(t);
  const original = fs.readFileSync(f.old.archive);
  const before = inspectResources(f.old);
  f.replace();
  assert.equal(inspectResources(f.old).snapshot.fingerprint, "b".repeat(64));
  fs.writeFileSync(f.old.archive, original);
  assert.deepEqual(inspectResources(f.old), before);
});

test("ASAR refresh rejects a malformed replacement snapshot instead of trusting old metadata", async (t) => {
  const f = await makeArchives(t, { bytes: "not JSON" });
  inspectResources(f.old);
  f.replace();
  assert.throws(() => inspectResources(f.old), SyntaxError);
});

test("ASAR refresh rejects a missing replacement snapshot", async (t) => {
  const f = await makeArchives(t, { omitSnapshot: true });
  inspectResources(f.old);
  f.replace();
  assert.throws(() => inspectResources(f.old));
});

for (const [label, bytes] of [
  ["disabled Memory V2", snapshotBytes("b", false)],
  ["invalid fingerprint", snapshotBytes("z")],
]) {
  test(`ASAR refresh preserves snapshot admission for ${label}`, async (t) => {
    const f = await makeArchives(t, { bytes });
    inspectResources(f.old);
    f.replace();
    assert.throws(() => inspectResources(f.old), /no valid enabled release build snapshot/);
  });
}

test("a valid replacement from the wrong candidate still fails exact archive identity", async (t) => {
  const f = await makeArchives(t);
  inspectResources(f.old);
  f.replace();
  // The snapshot remains valid, but the complete archive differs from Candidate.
  fs.appendFileSync(f.old.archive, "unexpected trailing bytes");
  assert.throws(() => assertCandidateIdentity(f.old, f.candidate), /app_asar_sha256 does not match the exact N package/);
});

test("replacement executable and Sidecar mismatches remain fatal", async (t) => {
  const f = await makeArchives(t);
  inspectResources(f.old);
  f.replace();
  const executable = fs.readFileSync(f.old.executablePath);
  fs.writeFileSync(f.old.executablePath, "wrong executable");
  assert.throws(() => assertCandidateIdentity(f.old, f.candidate), /executable_sha256 does not match/);
  fs.writeFileSync(f.old.executablePath, executable);
  fs.writeFileSync(f.old.sidecarPath, "wrong Sidecar");
  assert.throws(() => assertCandidateIdentity(f.old, f.candidate), /sidecar_sha256 does not match/);
});
