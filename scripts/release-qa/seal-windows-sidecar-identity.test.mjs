import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import asar from "@electron/asar";
import { NtExecutable, NtExecutableResource } from "resedit";
import YAML from "yaml";
import {
  prepareWindowsSidecarIdentity,
  sealWindowsSidecarIdentity,
  verifyWindowsSidecarIdentity,
} from "./seal-windows-sidecar-identity.mjs";
import { inspectResources } from "./installed-package-qualification.mjs";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const IDENTITY = "build/unchain-artifact-identity.v1.json";
const fixture = async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-sidecar-seal-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = path.join(root, "payload");
  const resourceRoot = path.join(payload, "resources");
  const sidecar = path.join(resourceRoot, "unchain_runtime/dist/windows/unchain-server.exe");
  fs.mkdirSync(path.dirname(sidecar), { recursive: true });
  fs.writeFileSync(sidecar, "unsigned-sidecar-test-bytes");
  const identity = {
    runtime_manifest_digest: `sha256:${"a".repeat(64)}`,
    schema: "pupu.windows-unchain-artifact-identity.v1",
    sidecar_sha256: `sha256:${digest(fs.readFileSync(sidecar))}`,
    unchain_wheel_sha256: `sha256:${"b".repeat(64)}`,
  };
  const companion = path.join(path.dirname(sidecar), "windows-vault-runtime-provenance.v1.json");
  fs.writeFileSync(companion, `${JSON.stringify({ ...identity, schema: "pupu.windows-vault-provenance.v1", arch: "x64" }, null, 2)}\n`);
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "build"), { recursive: true });
  fs.writeFileSync(path.join(source, IDENTITY), `${JSON.stringify(identity, null, 2)}\n`);
  fs.writeFileSync(path.join(source, "unrelated.js"), "console.log('unchanged');");
  fs.writeFileSync(path.join(source, "native.node"), "unchanged unpacked native module");
  const archive = path.join(resourceRoot, "app.asar");
  await asar.createPackageWithOptions(source, archive, { unpack: "*.node" });
  const exe = NtExecutable.createEmpty(false, false);
  const resources = NtExecutableResource.from(exe);
  resources.entries.push({ type: "INTEGRITY", id: "ELECTRONASAR", lang: 1033, codepage: 1252,
    bin: Buffer.from(JSON.stringify([{ file: "resources\\\\app.asar", alg: "SHA256", value: digest(asar.getRawHeader(archive).headerString) }])) });
  resources.entries.push({ type: "UNCHANGED", id: "SENTINEL", lang: 1033, codepage: 1252, bin: Buffer.from("keep resource") });
  resources.outputResource(exe);
  exe.setExtraData(Buffer.from("keep overlay"));
  const executable = path.join(payload, "PuPu.exe");
  fs.writeFileSync(executable, Buffer.from(exe.generate()));
  return { root, payload, resourceRoot, sidecar, identity, companion, archive, executable,
    receipt: path.join(root, "receipt.json") };
};

test("signing transition repairs the actual production identity and all Electron integrity layers", async (t) => {
  const f = await fixture(t);
  assert.equal(verifyWindowsSidecarIdentity(f.payload).sidecar_sha256, f.identity.sidecar_sha256);
  const before = fs.readFileSync(f.archive);
  const oldRaw = asar.getRawHeader(f.archive);
  const oldNode = oldRaw.header.files.build.files[path.posix.basename(IDENTITY)];
  const oldHeader = structuredClone(oldRaw.header);
  const beforePe = NtExecutable.from(fs.readFileSync(f.executable));
  prepareWindowsSidecarIdentity(f.payload, f.receipt);
  // Deterministically simulate the byte change made by Authenticode; native
  // signature validity remains a required Windows Actions check, not this fake.
  fs.appendFileSync(f.sidecar, "simulated-signature");
  assert.throws(() => verifyWindowsSidecarIdentity(f.payload), /runtime provenance is invalid/);
  assert.throws(() => inspectResources({ resourceRoot: f.resourceRoot, executablePath: f.executable, sidecarPlatform: "windows" }), /runtime provenance is invalid/);
  const result = sealWindowsSidecarIdentity(f.payload, f.receipt);
  assert.equal(result.sidecar_sha256, `sha256:${digest(fs.readFileSync(f.sidecar))}`);
  assert.equal(result.unchain_wheel_sha256, f.identity.unchain_wheel_sha256);
  assert.equal(result.runtime_manifest_digest, f.identity.runtime_manifest_digest);
  const newHeader = structuredClone(asar.getRawHeader(f.archive).header);
  newHeader.files.build.files[path.posix.basename(IDENTITY)].integrity = oldNode.integrity;
  assert.deepEqual(newHeader, oldHeader, "all other header entries and unpacked flags must stay unchanged");
  const after = fs.readFileSync(f.archive);
  assert.equal(after.length, before.length);
  const dataOffset = 8 + oldRaw.headerSize;
  const fileOffset = dataOffset + Number(oldNode.offset);
  assert.deepEqual(after.subarray(0, 16), before.subarray(0, 16));
  assert.deepEqual(after.subarray(dataOffset, fileOffset), before.subarray(dataOffset, fileOffset));
  assert.deepEqual(after.subarray(fileOffset + oldNode.size), before.subarray(fileOffset + oldNode.size));
  assert.equal(asar.extractFile(f.archive, "unrelated.js").toString(), "console.log('unchanged');");
  assert.equal(asar.extractFile(f.archive, "native.node").toString(), "unchanged unpacked native module");
  const afterPe = NtExecutable.from(fs.readFileSync(f.executable));
  assert.deepEqual(Buffer.from(afterPe.getExtraData()), Buffer.from(beforePe.getExtraData()));
  const otherResources = (exe) => NtExecutableResource.from(exe).entries.filter(e => e.type !== "INTEGRITY");
  assert.deepEqual(otherResources(afterPe), otherResources(beforePe));
  assert.throws(() => sealWindowsSidecarIdentity(f.payload, f.receipt), /pre-sign payload binding changed/);
});

test("prepare refuses reused receipt or receipt inside the payload", async (t) => {
  const f = await fixture(t);
  prepareWindowsSidecarIdentity(f.payload, f.receipt);
  assert.throws(() => prepareWindowsSidecarIdentity(f.payload, f.receipt), /EEXIST/);
  assert.throws(() => prepareWindowsSidecarIdentity(f.payload, path.join(f.payload, "receipt.json")), /outside the payload/);
  assert.throws(() => prepareWindowsSidecarIdentity(f.payload, path.join(f.payload, "..not-a-parent", "receipt.json")), /outside the payload/);
});

test("prepare never mutates a launcher that already has a PE certificate table", async (t) => {
  const f = await fixture(t);
  const original = fs.readFileSync(f.executable);
  const exe = NtExecutable.from(original);
  // Synthetic certificate-table marker: exercise the signed-input refusal,
  // without pretending this fixture has a valid Authenticode signature.
  exe.newHeader.optionalHeaderDataDirectory.set(4, { virtualAddress: original.length, size: 8 });
  const marked = Buffer.concat([original, Buffer.alloc(8)]);
  Buffer.from(exe.getRawHeader()).copy(marked);
  fs.writeFileSync(f.executable, marked);
  assert.throws(() => prepareWindowsSidecarIdentity(f.payload, f.receipt), /signed executable binary is not allowed/);
  assert.deepEqual(fs.readFileSync(f.executable), marked);
  assert.equal(fs.existsSync(f.receipt), false);
});

for (const mutation of ["schema", "extra", "manifest", "wheel"]) {
  test(`prepare rejects pre-existing companion ${mutation} drift`, async (t) => {
    const f = await fixture(t);
    const companion = JSON.parse(fs.readFileSync(f.companion));
    if (mutation === "schema") companion.schema = "pupu.windows-vault-provenance.v2";
    else if (mutation === "extra") companion.extra = true;
    else if (mutation === "manifest") companion.runtime_manifest_digest = `sha256:${"d".repeat(64)}`;
    else companion.unchain_wheel_sha256 = `sha256:${"d".repeat(64)}`;
    fs.writeFileSync(f.companion, JSON.stringify(companion));
    assert.throws(() => prepareWindowsSidecarIdentity(f.payload, f.receipt), /runtime provenance is invalid/);
    assert.equal(fs.existsSync(f.receipt), false);
  });
}

for (const mutation of ["receipt-extra", "receipt-schema", "companion-wheel", "companion-extra", "archive", "launcher", "unsigned-sidecar"]) {
  test(`reseal fails closed on ${mutation}`, async (t) => {
    const f = await fixture(t);
    prepareWindowsSidecarIdentity(f.payload, f.receipt);
    if (mutation !== "unsigned-sidecar") fs.appendFileSync(f.sidecar, "simulated-signature");
    if (mutation.startsWith("receipt-")) {
      const receipt = JSON.parse(fs.readFileSync(f.receipt));
      if (mutation === "receipt-extra") receipt.extra = true;
      else receipt.schema = "pupu.windows-pre-sign-identity.v2";
      fs.writeFileSync(f.receipt, JSON.stringify(receipt));
    } else if (mutation.startsWith("companion-")) {
      const companion = JSON.parse(fs.readFileSync(f.companion));
      if (mutation === "companion-extra") companion.extra = true;
      else companion.unchain_wheel_sha256 = `sha256:${"c".repeat(64)}`;
      fs.writeFileSync(f.companion, JSON.stringify(companion));
    } else if (mutation === "archive") fs.appendFileSync(f.archive, "tampered");
    else if (mutation === "launcher") fs.appendFileSync(f.executable, "tampered");
    assert.throws(() => sealWindowsSidecarIdentity(f.payload, f.receipt), /pre-sign payload binding changed|signing did not change/);
  });
}

test("prepare rejects broken ASAR identity bytes and launcher header integrity", async (t) => {
  const f = await fixture(t);
  const original = fs.readFileSync(f.archive);
  const raw = asar.getRawHeader(f.archive);
  const node = raw.header.files.build.files[path.posix.basename(IDENTITY)];
  const broken = Buffer.from(original);
  broken[8 + raw.headerSize + Number(node.offset)] ^= 1;
  fs.writeFileSync(f.archive, broken);
  assert.throws(() => prepareWindowsSidecarIdentity(f.payload, f.receipt), /ASAR identity file integrity mismatch/);
  fs.writeFileSync(f.archive, original);
  const exe = NtExecutable.from(fs.readFileSync(f.executable));
  const resource = NtExecutableResource.from(exe);
  const entry = resource.entries.find(e => e.type === "INTEGRITY");
  const records = JSON.parse(Buffer.from(entry.bin).toString());
  records[0].value = "0".repeat(64);
  entry.bin = Buffer.from(JSON.stringify(records));
  resource.outputResource(exe);
  fs.writeFileSync(f.executable, Buffer.from(exe.generate()));
  assert.throws(() => prepareWindowsSidecarIdentity(f.payload, f.receipt), /launcher ASAR header integrity mismatch/);
});

test("Windows shared action enforces dependency → reseal → launcher → installer signing order", () => {
  const action = YAML.parse(fs.readFileSync(new URL("../../.github/actions/windows-artifact-signing/action.yml", import.meta.url), "utf8"));
  const steps = action.runs.steps;
  const named = name => steps.findIndex(s => s.name === name);
  const prepare = named("Build the exact signing catalogue");
  const dependencies = named("Sign Windows dependencies with Artifact Signing");
  const seal = named("Reseal signed Sidecar identity before signing the launcher");
  const launcher = named("Sign resealed Windows launcher with Artifact Signing");
  const pack = named("Build installer from Azure-signed Windows payload");
  const installer = named("Sign Windows installer with Artifact Signing");
  assert.ok(prepare >= 0 && prepare < dependencies && dependencies < seal && seal < launcher && launcher < pack && pack < installer);
  assert.equal(steps.filter(s => s.uses === "azure/artifact-signing-action@v2").length, 3);
  assert.match(steps[prepare].run, /seal-windows-sidecar-identity\.mjs prepare/);
  assert.match(steps[prepare].run, /\$dependencyFiles = .*\$signableFiles.*\$_.FullName -ne \$launcherPath/);
  assert.match(steps[prepare].run, /\$dependencyFiles \| ForEach-Object/);
  assert.match(steps[seal].run, /Get-AuthenticodeSignature/);
  assert.match(steps[seal].run, /Status -ne "Valid"/);
  assert.match(steps[seal].run, /seal-windows-sidecar-identity\.mjs seal/);
  assert.match(steps[launcher].with.files, /catalogue.outputs.launcher_path/);
  assert.match(steps[pack].run, /seal-windows-sidecar-identity\.mjs verify/);
  assert.match(steps.at(-1).run, /seal-windows-sidecar-identity\.mjs verify/);
});
