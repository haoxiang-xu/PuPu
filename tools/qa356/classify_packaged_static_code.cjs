"use strict";
// QA-only exact published-source spans; never a value or whole-file exemption.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const LOCK_SHA = "c8f37cfdcb51380f60242731cd3e51eb7a199a77410c832d556558bf5adefc85";
const SRI = "sha512-g/kR520giAFYkSXTzcmF3kqQq7wi8F6N6SzeDgZrqTBN+VHdmgWOyTdD1yD7AATDId/yXLvuP34CxW46/BwCdw==";
const ASAR_SRI = "sha512-i4/rNPRS84t0vSRa2HorerGRXWyF4vThfHesw0dmcWHp+cspK743UanA0suA5Q5y8kzY2y6YKrvbIUn69BCAiA==";
const MATCH_SHA = "7c47a805c4387c9d3d46377377bc141a951d38289c7bd4d48bd23d487b7ca019";
const VALUE_SHA = "65cd5af6a874b71e4a69966efcea8e864678060a562e80418d39f8ebed07fabd";
const FILES = [
  ["node_modules/builder-util-runtime/out/httpExecutor.js", 23064, "13050c5e047556326a2a17bc991dcf1e0f58b20409e0476486a6fd0ed6c577f6", 21788],
  ["node_modules/builder-util-runtime/out/httpExecutor.js.map", 42807, "83ac73f71ec2b611f934a041cfdd60cba331ff30b239bb4053cbe41ea509a95a", 41464],
];
function requireFact(condition, code) {
  if (!condition) { const error = new Error(code); error.code = code; throw error; }
}
function hash(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function fileHash(filename) {
  const digest = crypto.createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(filename, "r");
  try { for (;;) { const count = fs.readSync(fd, buffer, 0, buffer.length, null); if (!count) break; digest.update(buffer.subarray(0, count)); } }
  finally { fs.closeSync(fd); }
  return digest.digest("hex");
}
function classifyPackagedStaticCode(candidateRoot, inventoryPath, outputPath) {
  const root = path.resolve(candidateRoot), archive = path.join(root, "dist/linux-unpacked/resources/app.asar");
  const lockBytes = fs.readFileSync(path.join(root, "package-lock.json"));
  requireFact(hash(lockBytes) === LOCK_SHA, "LOCK_BYTES_MISMATCH");
  const lock = JSON.parse(lockBytes), dependency = lock.packages["node_modules/builder-util-runtime"], reader = lock.packages["node_modules/@electron/asar"];
  requireFact(dependency.version === "9.7.0" && dependency.resolved === "https://registry.npmjs.org/builder-util-runtime/-/builder-util-runtime-9.7.0.tgz" && dependency.integrity === SRI, "PUBLISHED_PACKAGE_IDENTITY_MISMATCH");
  requireFact(reader.version === "3.4.1" && reader.resolved === "https://registry.npmjs.org/@electron/asar/-/asar-3.4.1.tgz" && reader.integrity === ASAR_SRI, "ASAR_READER_LOCK_MISMATCH");
  const readerRoot = path.join(root, "node_modules/@electron/asar");
  requireFact(JSON.parse(fs.readFileSync(path.join(readerRoot, "package.json"))).version === "3.4.1", "ASAR_READER_VERSION_MISMATCH");
  const asar = require(readerRoot); // Existing pinned build-tool API only; no application import.
  const archiveStat = fs.lstatSync(archive);
  requireFact(archiveStat.isFile() && !archiveStat.isSymbolicLink() && Number.isSafeInteger(archiveStat.size), "ASAR_NOT_REGULAR");
  const inventory = JSON.parse(fs.readFileSync(inventoryPath)), expected = inventory["resources/app.asar"];
  requireFact(expected && expected.type === "file" && expected.size === archiveStat.size && /^[0-9a-f]{64}$/.test(expected.sha256), "ASAR_INVENTORY_IDENTITY_MISMATCH");
  const before = fileHash(archive);
  requireFact(before === expected.sha256, "ASAR_INVENTORY_HASH_MISMATCH");
  // Bound the existing reader's header allocation; its API remains the parser.
  const fd = fs.openSync(archive, "r"), prefix = Buffer.alloc(8);
  let headerBound;
  try { requireFact(fs.readSync(fd, prefix, 0, 8, 0) === 8 && prefix.readUInt32LE(0) === 4, "ASAR_HEADER_PREFIX_INVALID"); headerBound = prefix.readUInt32LE(4); }
  finally { fs.closeSync(fd); }
  requireFact(headerBound > 0 && headerBound <= 16 * 1024 * 1024 && 8 + headerBound <= archiveStat.size, "ASAR_HEADER_SIZE_INVALID");
  const rawHeader = asar.getRawHeader(archive);
  requireFact(rawHeader.headerSize === headerBound && JSON.stringify(rawHeader.header) === rawHeader.headerString, "ASAR_HEADER_NONCANONICAL");
  const entries = [];
  for (const [name, size, sha256, localOffset] of FILES) {
    let info = rawHeader.header;
    for (const part of name.split("/")) {
      requireFact(info && typeof info === "object" && !Array.isArray(info) && !Object.hasOwn(info, "link") && !info.unpacked && info.files && Object.hasOwn(info.files, part), "ASAR_SELECTED_PARENT_OR_ENTRY_INVALID");
      info = info.files[part];
    }
    requireFact(info && !Object.hasOwn(info, "link") && !Object.hasOwn(info, "files") && !info.unpacked && Number.isSafeInteger(info.size) && info.size === size && typeof info.offset === "string" && /^(0|[1-9][0-9]*)$/.test(info.offset), "ASAR_SELECTED_ENTRY_NOT_PACKED_REGULAR");
    const relativeOffset = Number(info.offset), dataOffset = 8 + headerBound + relativeOffset;
    requireFact(Number.isSafeInteger(relativeOffset) && Number.isSafeInteger(dataOffset) && dataOffset >= 8 + headerBound && dataOffset + size <= archiveStat.size, "ASAR_SELECTED_OFFSET_OUT_OF_BOUNDS");
    const apiInfo = asar.statFile(archive, name, false);
    requireFact(apiInfo.offset === info.offset && apiInfo.size === size && !apiInfo.link && !apiInfo.unpacked && !apiInfo.files, "ASAR_READER_ENTRY_DISAGREEMENT");
    const bytes = asar.extractFile(archive, name, false);
    requireFact(bytes.length === size && hash(bytes) === sha256, "PUBLISHED_ENTRY_BYTES_MISMATCH");
    const installed = path.join(root, name);
    requireFact(fs.lstatSync(installed).isFile() && fileHash(installed) === sha256, "INSTALLED_PUBLISHED_SOURCE_MISMATCH");
    const matches = [...bytes.toString("latin1").matchAll(/(?:x-unchain-auth|authorization|bearer)[ \t\n\r\v\f]*[:=][ \t\n\r\v\f]*([A-Za-z0-9._~+/-]{16,})/gi)];
    requireFact(matches.length === 1 && matches[0].index === localOffset && matches[0][0].length === 32 && hash(Buffer.from(matches[0][0], "latin1")) === MATCH_SHA && matches[0][1].length === 16 && hash(Buffer.from(matches[0][1], "latin1")) === VALUE_SHA, "AUDITED_ENTRY_SPAN_MISMATCH");
    entries.push({path: name, type: "PACKED_REGULAR_FILE", size, sha256, data_offset: dataOffset, local_offset: localOffset,
      start: dataOffset + localOffset, end: dataOffset + localOffset + 32, match_sha256: MATCH_SHA, value_sha256: VALUE_SHA, match_length: 32, value_length: 16});
  }
  requireFact(entries[0].data_offset + entries[0].size <= entries[1].data_offset || entries[1].data_offset + entries[1].size <= entries[0].data_offset, "ASAR_SELECTED_ENTRIES_OVERLAP");
  requireFact(fileHash(archive) === before && fs.lstatSync(archive).isFile() && fs.statSync(archive).size === archiveStat.size, "ASAR_CHANGED_DURING_PROOF");
  const proof = {schema: "qa356.exact-static-code-spans.v1", status: "PROVISIONAL_UNTIL_COMPLETE_TAR_SCAN", lock_sha256: LOCK_SHA,
    package_version: "9.7.0", package_integrity: SRI, published_tgz_sha256: "6b1f079463c7ddb2992c10ceea45761ef9be63a8e2290105fea918d869c23498",
    asar_reader_version: "3.4.1", asar_path: "resources/app.asar", asar_sha256: before, asar_size: archiveStat.size,
    inventory_sha256: expected.sha256, header_size: headerBound, header_sha256: hash(Buffer.from(rawHeader.headerString)), entries};
  const raw = JSON.stringify(proof, null, 2) + "\n";
  requireFact(Buffer.byteLength(raw) <= 16384, "STATIC_PROOF_TOO_LARGE");
  fs.writeFileSync(outputPath, raw, {flag: "wx"});
  return proof;
}
module.exports = {classifyPackagedStaticCode};
if (require.main === module) {
  try { requireFact(process.argv.length === 5, "CLASSIFIER_USAGE"); classifyPackagedStaticCode(...process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${/^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "STATIC_CODE_PROOF_REFUSED"}\n`); process.exitCode = 1; }
}
