#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import asar from "@electron/asar";
import { NtExecutable, NtExecutableResource } from "resedit";
import provenance from "../../electron/main/services/unchain/windows_vault_provenance.js";

const IDENTITY = "build/unchain-artifact-identity.v1.json";
const RECEIPT_SCHEMA = "pupu.windows-pre-sign-identity.v1";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const hashFile = (file) => provenance.hashFile(fs, file);
const pathsFor = (payload) => {
  const archive = path.join(payload, "resources", "app.asar");
  const sidecar = path.join(payload, "resources", "unchain_runtime", "dist", "windows", "unchain-server.exe");
  return {
    archive,
    sidecar,
    executable: path.join(payload, "PuPu.exe"),
    companion: path.join(path.dirname(sidecar), "windows-vault-runtime-provenance.v1.json"),
  };
};

const archiveIdentity = (archive) => {
  asar.uncache(archive);
  const raw = asar.getRawHeader(archive);
  const node = raw.header.files?.build?.files?.[path.posix.basename(IDENTITY)];
  assert.ok(node && !node.unpacked && !node.link, "identity must be a packed ASAR file");
  assert.equal(node.integrity?.algorithm, "SHA256", "ASAR identity integrity is required");
  const bytes = asar.extractFile(archive, IDENTITY);
  assert.equal(node.size, bytes.length);
  const integrity = integrityFor(bytes, node.integrity.blockSize);
  assert.deepEqual(node.integrity, integrity, "ASAR identity file integrity mismatch");
  return { raw, node, bytes, identity: provenance.parseWindowsUnchainArtifactIdentity(bytes) };
};

const integrityFor = (bytes, blockSize) => {
  assert.ok(Number.isSafeInteger(blockSize) && blockSize > 0, "invalid ASAR integrity block size");
  const blocks = [];
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    blocks.push(digest(bytes.subarray(offset, offset + blockSize)));
  }
  return { algorithm: "SHA256", hash: digest(bytes), blockSize, blocks };
};

const executableIntegrity = (executable, headerString, allowSigned) => {
  // Mutating an already signed launcher would invalidate Authenticode. Only
  // verification may ignore its certificate table; sealing must reject it.
  const exe = NtExecutable.from(fs.readFileSync(executable), { ignoreCert: allowSigned });
  const resource = NtExecutableResource.from(exe);
  const entries = resource.entries.filter((entry) => entry.type === "INTEGRITY" && entry.id === "ELECTRONASAR");
  assert.equal(entries.length, 1, "exactly one Electron ASAR integrity resource is required");
  const entry = entries[0];
  const records = JSON.parse(Buffer.from(entry.bin).toString("utf8"));
  assert.ok(Array.isArray(records) && records.length === 1, "exactly one ASAR binding is required");
  const record = records[0];
  assert.deepEqual(Object.keys(record).sort(), ["alg", "file", "value"]);
  assert.equal(record.file.replace(/\\+/g, "/"), "resources/app.asar");
  assert.equal(record.alg, "SHA256");
  assert.equal(record.value, digest(headerString), "launcher ASAR header integrity mismatch");
  return { exe, resource, entry, records, record };
};

export const verifyWindowsSidecarIdentity = (payload) => {
  const files = pathsFor(payload);
  const { raw, bytes } = archiveIdentity(files.archive);
  // Exercise the actual production admission function, not a parallel relaxed
  // validator. Node needs this one virtual read to emulate Electron's ASAR fs.
  const result = provenance.resolveWindowsVaultRuntimeProvenance({
    app: { isPackaged: true, getAppPath: () => files.archive },
    entrypoint: { command: files.sidecar },
    fs: {
      ...fs,
      readFileSync: (file, ...args) => file === path.join(files.archive, ...IDENTITY.split("/"))
        ? bytes.toString("utf8") : fs.readFileSync(file, ...args),
    },
    path,
    platform: "win32",
    arch: "x64",
  });
  executableIntegrity(files.executable, raw.headerString, true);
  return result;
};

const bindingReceipt = (files, sidecarSha256) => ({
  schema: RECEIPT_SCHEMA,
  archive_sha256: hashFile(files.archive),
  executable_sha256: hashFile(files.executable),
  companion_sha256: hashFile(files.companion),
  sidecar_sha256: sidecarSha256,
});

export const prepareWindowsSidecarIdentity = (payload, receiptPath) => {
  const files = pathsFor(payload);
  const identity = verifyWindowsSidecarIdentity(payload);
  executableIntegrity(files.executable, asar.getRawHeader(files.archive).headerString, false);
  const receipt = bindingReceipt(files, identity.sidecar_sha256);
  // Never replace evidence from a prior attempt: each signing job owns a fresh
  // isolated payload and receipt outside the payload.
  const relativeReceipt = path.relative(path.resolve(payload), path.resolve(receiptPath));
  assert.ok(relativeReceipt.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReceipt),
    "pre-sign receipt must be outside the payload");
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return receipt;
};

const replaceDigest = (bytes, before, after) => {
  const text = bytes.toString("utf8");
  const pattern = /("sidecar_sha256"\s*:\s*")(sha256:[0-9a-f]{64})(")/g;
  const matches = [...text.matchAll(pattern)];
  assert.equal(matches.length, 1, "exactly one sidecar digest is required");
  assert.equal(matches[0][2], before);
  const updated = Buffer.from(text.replace(pattern, (_, prefix, _value, suffix) => `${prefix}${after}${suffix}`));
  assert.equal(updated.length, bytes.length, "identity reseal must preserve byte length");
  return updated;
};

export const sealWindowsSidecarIdentity = (payload, receiptPath) => {
  const files = pathsFor(payload);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const { raw, node, bytes, identity } = archiveIdentity(files.archive);
  // The validated pre-sign payload must remain unchanged except for its signed
  // dependencies. In particular, reject replacement wheel/manifest/ASAR records.
  assert.deepEqual(receipt, bindingReceipt(files, identity.sidecar_sha256), "pre-sign payload binding changed");
  const companionBytes = fs.readFileSync(files.companion);
  const companion = provenance.parseRuntimeProvenance(companionBytes);
  for (const key of ["sidecar_sha256", "runtime_manifest_digest", "unchain_wheel_sha256"]) {
    assert.equal(companion[key], identity[key], `pre-sign ${key} mismatch`);
  }
  const pe = executableIntegrity(files.executable, raw.headerString, false);
  const signedDigest = hashFile(files.sidecar);
  assert.notEqual(signedDigest, identity.sidecar_sha256, "sidecar signing did not change its digest");
  const updatedIdentity = replaceDigest(bytes, identity.sidecar_sha256, signedDigest);
  const updatedCompanion = replaceDigest(companionBytes, identity.sidecar_sha256, signedDigest);

  // Same-length surgical writes preserve every unrelated ASAR byte, offset,
  // unpacked flag, native module and snapshot. Repacking can change those.
  assert.equal(JSON.stringify(raw.header), raw.headerString, "unsupported ASAR header serialization");
  node.integrity = integrityFor(updatedIdentity, node.integrity.blockSize);
  const header = Buffer.from(JSON.stringify(raw.header));
  assert.equal(header.length, Buffer.byteLength(raw.headerString), "ASAR header length changed");
  const descriptor = fs.openSync(files.archive, "r+");
  try {
    const prefix = Buffer.alloc(8 + raw.headerSize);
    assert.equal(fs.readSync(descriptor, prefix, 0, prefix.length, 0), prefix.length);
    const headerOffset = prefix.indexOf(Buffer.from(raw.headerString));
    assert.equal(headerOffset, 16, "unsupported ASAR pickle layout");
    const offset = Number(node.offset);
    assert.ok(Number.isSafeInteger(offset) && offset >= 0);
    assert.equal(fs.writeSync(descriptor, updatedIdentity, 0, updatedIdentity.length, 8 + raw.headerSize + offset), updatedIdentity.length);
    assert.equal(fs.writeSync(descriptor, header, 0, header.length, headerOffset), header.length);
  } finally {
    fs.closeSync(descriptor);
    asar.uncache(files.archive);
  }
  fs.writeFileSync(files.companion, updatedCompanion);
  pe.record.value = digest(header);
  pe.entry.bin = Buffer.from(JSON.stringify(pe.records));
  pe.resource.outputResource(pe.exe);
  fs.writeFileSync(files.executable, Buffer.from(pe.exe.generate()));
  return verifyWindowsSidecarIdentity(payload);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const [operation, payload, receipt, ...extra] = process.argv.slice(2);
    assert.ok(["prepare", "seal", "verify"].includes(operation) && payload && extra.length === 0,
      "usage: seal-windows-sidecar-identity.mjs prepare|seal|verify PAYLOAD [RECEIPT]");
    assert.equal(Boolean(receipt), operation !== "verify", "receipt is required only for prepare/seal");
    const result = operation === "prepare" ? prepareWindowsSidecarIdentity(payload, receipt)
      : operation === "seal" ? sealWindowsSidecarIdentity(payload, receipt)
        : verifyWindowsSidecarIdentity(payload);
    console.log(`[windows-sidecar-identity] ${operation} passed: ${result.sidecar_sha256}`);
  } catch (error) {
    console.error(`[windows-sidecar-identity] ${error.message}`);
    process.exitCode = 1;
  }
}
