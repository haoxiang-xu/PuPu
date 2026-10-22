// Whole-package downstream security updates for the otherwise immutable MCP
// runtime archives. Keep this deliberately typed: pins cannot choose paths or
// arbitrary transformations, and all work happens before the stage is sealed.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { crc32 } = require("node:zlib");

const RECEIPT_FILE = "PUPU-CURATED-PACKAGES.json";
const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_KEYS = ["version", "url", "sha256", "archive"];

function closedObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} must contain exactly ${keys.join(", ")}`);
  }
}

function validateSource(source, name, suffix, extra = []) {
  closedObject(source, [...SOURCE_KEYS, ...extra], name);
  if (!/^\d+\.\d+\.\d+$/.test(source.version || "") ||
      !SHA256.test(source.sha256 || "") ||
      source.archive !== `${name}-${source.version}${suffix}`) {
    throw new Error(`Invalid immutable ${name} curation source`);
  }
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || path.posix.basename(url.pathname) !== source.archive) {
    throw new Error(`Invalid immutable ${name} curation URL`);
  }
  if (extra.includes("expected_base_version") &&
      !/^\d+\.\d+\.\d+$/.test(source.expected_base_version || "")) {
    throw new Error(`Invalid expected base ${name} version`);
  }
}

function validateCuration(runtimeName, curation) {
  if (curation === undefined) return;
  if (runtimeName === "node") {
    closedObject(curation, ["schema_version", "npm", "ip_address"], "Node curation");
    validateSource(curation.npm, "npm", ".tgz", ["expected_base_version"]);
    validateSource(curation.ip_address, "ip-address", ".tgz", ["expected_base_version"]);
  } else if (runtimeName === "python") {
    closedObject(curation, ["schema_version", "pip", "urllib3"], "Python curation");
    validateSource(curation.pip, "pip", "-py3-none-any.whl");
    validateSource(curation.urllib3, "urllib3", "-py3-none-any.whl", ["expected_base_version"]);
  } else {
    throw new Error(`Curation is not supported for ${runtimeName}`);
  }
  if (curation.schema_version !== 1) throw new Error("Unknown runtime curation schema");
}

async function safePackagePath(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") ||
      path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative ||
      relative.split("/").some((part) => part === ".." || part === "." || !part)) {
    throw new Error(`Curation path must be a canonical relative path: ${relative}`);
  }
  let current = path.resolve(root);
  for (const part of ["", ...relative.split("/")]) {
    if (part) current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Curation destination contains a symlink: ${current}`);
    if (stat && current !== path.join(path.resolve(root), ...relative.split("/")) && !stat.isDirectory()) {
      throw new Error(`Curation destination ancestor is not a directory: ${current}`);
    }
  }
  return current;
}

async function filesIn(root, relative = "") {
  const result = [];
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  entries.sort((a, b) => Buffer.from(a.name).compare(Buffer.from(b.name)));
  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Curated package contains a symlink: ${name}`);
    if (entry.isDirectory()) result.push(...await filesIn(root, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Unsupported curated package entry: ${name}`);
  }
  return result;
}

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function assertPackage(root, name, version) {
  const metadata = JSON.parse(await fs.readFile(await safePackagePath(root, "package.json"), "utf8"));
  if (metadata.name !== name || metadata.version !== version) {
    throw new Error(`Unexpected base ${name} package: expected ${version}, got ${metadata.version}`);
  }
}

function runtimePaths(target) {
  return target === "win32-x64"
    ? { npm: "node_modules/npm", site: "Lib/site-packages", lib: "Lib" }
    : { npm: "lib/node_modules/npm", site: "lib/python3.12/site-packages", lib: "lib/python3.12" };
}

async function replaceDirectory(root, relative, source) {
  const destination = await safePackagePath(root, relative);
  await filesIn(source);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true });
}

async function stageNpmCuration({ runtimeRoot, curation, target, cacheDir, downloader, ensureCachedSource, extractArchive, work }) {
  const { npm: npmPath } = runtimePaths(target);
  await assertPackage(await safePackagePath(runtimeRoot, npmPath), "npm", curation.npm.expected_base_version);
  // Extract both sources before replacing anything, including all hash checks.
  const extracted = {};
  for (const [key, source] of [["npm", curation.npm], ["ip-address", curation.ip_address]]) {
    const archive = await ensureCachedSource(`curation-${key}`, source, cacheDir, downloader);
    const extraction = path.join(work, key);
    await extractArchive(archive, extraction, "tar.gz");
    const packageRoot = await safePackagePath(extraction, "package");
    await assertPackage(packageRoot, key, source.version);
    await filesIn(packageRoot);
    extracted[key] = packageRoot;
  }
  await assertPackage(await safePackagePath(extracted.npm, "node_modules/ip-address"), "ip-address", curation.ip_address.expected_base_version);
  await replaceDirectory(runtimeRoot, npmPath, extracted.npm);
  await replaceDirectory(runtimeRoot, `${npmPath}/node_modules/ip-address`, extracted["ip-address"]);
  const npmRoot = await safePackagePath(runtimeRoot, npmPath);
  const licenses = [];
  for (const name of await filesIn(npmRoot)) {
    if (/(?:^|\/)(?:licen[cs]e(?:[.-].*)?|copying(?:[.-].*)?)$/i.test(name)) {
      licenses.push(`${name}\n\n${await fs.readFile(path.join(npmRoot, name), "utf8")}`);
    }
  }
  if (!licenses.length) throw new Error("Curated npm license inventory is empty");
  await fs.writeFile(path.join(npmRoot, "PUPU-BUNDLED-LICENSES.txt"), licenses.join("\n\n---\n\n"));
  return {};
}

function replaceExpected(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`Curated urllib3 expected one ${label}, got ${count}`);
  return text.replace(before, after);
}

function transformUrllib3(name, original) {
  let text = original;
  if (["util/url.py", "contrib/pyopenssl.py"].includes(name)) {
    const indent = name === "util/url.py" ? "            " : "        ";
    text = replaceExpected(text, `${indent}import idna\n`, `${indent}from pip._vendor import idna\n`, `${name} idna import`);
  }
  if (name === "contrib/emscripten/__init__.py") {
    text = replaceExpected(text, "import urllib3.connection\n", "import pip._vendor.urllib3.connection as urllib3_connection\n", "emscripten import");
    text = text.replaceAll("urllib3.connection.", "urllib3_connection.");
  }
  // Match pip's upstream vendoring: namespace examples, and retain the
  // existing policy that pip does not load ambient Brotli extensions.
  text = text.replaceAll("        import urllib3\n", "        from pip._vendor import urllib3\n");
  if (name === "contrib/pyopenssl.py") {
    text = replaceExpected(text, "        import urllib3.contrib.pyopenssl\n        urllib3.contrib.pyopenssl.inject_into_urllib3()", "        import pip._vendor.urllib3.contrib.pyopenssl as pyopenssl\n        pyopenssl.inject_into_urllib3()", "pyopenssl example");
  }
  if (name === "response.py") {
    text = replaceExpected(text,
      "try:\n    try:\n        import brotlicffi as brotli  # type: ignore[import-not-found]\n    except ImportError:\n        import brotli  # type: ignore[import-not-found]\nexcept ImportError:\n    brotli = None\n",
      "brotli = None\n", "optional Brotli decoder policy");
  }
  if (name === "util/request.py") {
    text = replaceExpected(text,
      "try:\n    try:\n        import brotlicffi as _unused_module_brotli  # type: ignore[import-not-found] # noqa: F401\n    except ImportError:\n        import brotli as _unused_module_brotli  # type: ignore[import-not-found] # noqa: F401\nexcept ImportError:\n    pass\nelse:\n    ACCEPT_ENCODING += \",br\"\n",
      "", "optional Brotli request policy");
  }
  return text;
}

async function recordRow(root, name) {
  const bytes = await fs.readFile(path.join(root, name));
  return `${name},sha256=${crypto.createHash("sha256").update(bytes).digest("base64url")},${bytes.length}`;
}

async function assertVendorBase(installed, upstream) {
  const expected = await filesIn(upstream);
  const actual = (await filesIn(installed)).filter((name) => !/(?:^|\/)__pycache__\/[^/]+\.cpython-312(?:\.opt-[12])?\.pyc$/.test(name));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unexpected installed pip urllib3 base files");
  for (const name of expected) {
    if (!(await fs.readFile(path.join(installed, name))).equals(await fs.readFile(path.join(upstream, name)))) {
      throw new Error(`Unexpected installed pip urllib3 base bytes: ${name}`);
    }
  }
}

async function rebuildWheelRecord(root, recordPath) {
  const rows = [];
  for (const name of await filesIn(root)) {
    if (name !== recordPath) rows.push(await recordRow(root, name));
  }
  rows.push(`${recordPath},,`);
  await fs.writeFile(await safePackagePath(root, recordPath), `${rows.join("\n")}\n`);
}

// Wheel files use deterministic uncompressed ZIP entries, 1980-01-01 timestamps,
// fixed modes and bytewise ordering. No platform binary is executed to build it.
async function writeDeterministicWheel(root, destination) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const name of await filesIn(root)) {
    const filename = Buffer.from(name);
    const bytes = await fs.readFile(path.join(root, name));
    if (bytes.length > 0xffffffff || offset > 0xffffffff || filename.length > 0xffff) throw new Error("Curated wheel exceeds ZIP limits");
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    chunks.push(local, filename, bytes);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(0x314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x800, 8);
    header.writeUInt16LE(33, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(bytes.length, 20);
    header.writeUInt32LE(bytes.length, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, filename);
    offset += local.length + filename.length + bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  const count = central.length / 2;
  if (count > 0xffff) throw new Error("Curated wheel has too many ZIP entries");
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  await fs.writeFile(destination, Buffer.concat([...chunks, centralBytes, end]), { flag: "wx" });
}

async function stagePipCuration({ runtimeRoot, curation, target, cacheDir, downloader, ensureCachedSource, extractWheel, sha256File, sha256Tree, work }) {
  const { site, lib } = runtimePaths(target);
  const installed = await safePackagePath(runtimeRoot, site);
  const bundledWheel = await safePackagePath(runtimeRoot, `${lib}/ensurepip/_bundled/${curation.pip.archive}`);
  if (await sha256File(bundledWheel) !== curation.pip.sha256) throw new Error("Unexpected base ensurepip wheel checksum");
  const baseWheel = await ensureCachedSource("curation-pip", curation.pip, cacheDir, downloader);
  const urllibWheel = await ensureCachedSource("curation-urllib3", curation.urllib3, cacheDir, downloader);
  const base = path.join(work, "pip");
  const replacement = path.join(work, "urllib3");
  await extractWheel(baseWheel, base);
  await extractWheel(urllibWheel, replacement);
  await filesIn(base);
  await filesIn(replacement);
  const metadataPath = `pip-${curation.pip.version}.dist-info`;
  const vendor = "pip/_vendor/urllib3";
  const vendorText = await fs.readFile(path.join(base, "pip/_vendor/vendor.txt"), "utf8");
  const expectedLine = `urllib3==${curation.urllib3.expected_base_version}`;
  if (!vendorText.split(/\r?\n/).some((line) => line.trim() === expectedLine) ||
      await fs.readFile(await safePackagePath(installed, "pip/_vendor/vendor.txt"), "utf8") !== vendorText) {
    throw new Error("Unexpected installed pip vendored urllib3 base identity");
  }
  // The immutable Windows PBS archive also carries CPython 3.12 bytecode.
  // Verify every source/license byte against the official pip wheel, then
  // replace the whole directory, dropping only that stale derived bytecode.
  await assertVendorBase(await safePackagePath(installed, vendor), path.join(base, vendor));
  const urllibMetadata = await fs.readFile(path.join(replacement, `urllib3-${curation.urllib3.version}.dist-info/METADATA`), "utf8");
  if (!urllibMetadata.includes(`\nName: urllib3\n`) || !urllibMetadata.includes(`\nVersion: ${curation.urllib3.version}\n`)) throw new Error("Unexpected urllib3 wheel metadata");
  const urllibRoot = path.join(replacement, "urllib3");
  for (const name of await filesIn(urllibRoot)) {
    if (name.endsWith(".py")) {
      const file = path.join(urllibRoot, name);
      await fs.writeFile(file, transformUrllib3(name, await fs.readFile(file, "utf8")));
    }
  }
  const license = await fs.readFile(path.join(replacement, `urllib3-${curation.urllib3.version}.dist-info/licenses/LICENSE.txt`));
  await fs.writeFile(path.join(urllibRoot, "LICENSE.txt"), license);
  await replaceDirectory(base, vendor, urllibRoot);
  await fs.writeFile(path.join(base, "pip/_vendor/vendor.txt"), replaceExpected(vendorText, expectedLine, `urllib3==${curation.urllib3.version}`, "vendor inventory"));
  const bomPath = "pip/_vendor/bom.cdx.json";
  const bom = JSON.parse(await fs.readFile(path.join(base, bomPath), "utf8"));
  const components = bom.components.filter((item) => item.name === "urllib3");
  if (components.length !== 1 || components[0].version !== curation.urllib3.expected_base_version) throw new Error("Unexpected pip urllib3 SBOM component");
  const oldRef = components[0]["bom-ref"];
  const newRef = `pkg:pypi/urllib3@${curation.urllib3.version}`;
  components[0].version = curation.urllib3.version;
  components[0].purl = newRef;
  components[0]["bom-ref"] = newRef;
  for (const dependency of bom.dependencies || []) {
    if (dependency.ref === oldRef) dependency.ref = newRef;
    if (dependency.dependsOn) dependency.dependsOn = dependency.dependsOn.map((ref) => ref === oldRef ? newRef : ref);
  }
  await fs.writeFile(path.join(base, bomPath), jsonBytes(bom));
  const vendorReceipt = {
    schema_version: 1,
    kind: "pupu-curated-pip-vendor",
    pip: curation.pip,
    urllib3: curation.urllib3,
    transformations: "pip namespace imports and existing optional Brotli policy; complete upstream urllib3 library",
  };
  const receiptPath = "pip/_vendor/PUPU-CURATION.json";
  await fs.writeFile(path.join(base, receiptPath), jsonBytes(vendorReceipt));
  const readmePath = "pip/_vendor/README.rst";
  await fs.appendFile(path.join(base, readmePath), `\nPuPu downstream security curation\n--------------------------------\n\nThe complete urllib3 ${curation.urllib3.version} release replaces ${curation.urllib3.expected_base_version}.\nNamespace imports and optional Brotli policy follow pip's existing vendoring.\nSee PUPU-CURATION.json for immutable upstream wheel identities.\n`);
  // Copy just the changed vendor payload, preserving PBS's platform-specific
  // installed distlib launchers and every other upstream pip file.
  await replaceDirectory(installed, vendor, path.join(base, vendor));
  const changed = ["pip/_vendor/vendor.txt", bomPath, receiptPath, readmePath];
  for (const name of changed) await fs.copyFile(path.join(base, name), await safePackagePath(installed, name));
  const installedRecord = await safePackagePath(installed, `${metadataPath}/RECORD`);
  const oldRows = (await fs.readFile(installedRecord, "utf8")).trimEnd().split(/\r?\n/);
  const retained = oldRows.filter((row) => !row.startsWith(`${vendor}/`) && ![...changed, `${metadataPath}/RECORD`].includes(row.split(",")[0]));
  for (const name of [...(await filesIn(path.join(installed, vendor))).map((name) => `${vendor}/${name}`), ...changed]) retained.push(await recordRow(installed, name));
  retained.sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  retained.push(`${metadataPath}/RECORD,,`);
  await fs.writeFile(installedRecord, `${retained.join("\n")}\n`);
  await rebuildWheelRecord(base, `${metadataPath}/RECORD`);
  const curatedWheel = path.join(work, curation.pip.archive);
  await writeDeterministicWheel(base, curatedWheel);
  await fs.copyFile(curatedWheel, bundledWheel);
  return { pip_wheel_sha256: await sha256File(curatedWheel), vendor_tree_sha256: await sha256Tree(path.join(installed, vendor)) };
}

async function stageCuration(options) {
  const { runtimeRoot, runtimeName, runtime } = options;
  const curation = runtime.curation;
  if (!curation) return {};
  validateCuration(runtimeName, curation);
  const work = path.join(path.dirname(runtimeRoot), `.curate-${runtimeName}`);
  await fs.mkdir(work);
  try {
    const details = runtimeName === "node"
      ? await stageNpmCuration({ ...options, curation, work })
      : await stagePipCuration({ ...options, curation, work });
    const receipt = { schema_version: 1, runtime: runtimeName, sources: curation, ...details };
    const receiptPath = await safePackagePath(runtimeRoot, RECEIPT_FILE);
    await fs.writeFile(receiptPath, jsonBytes(receipt), { flag: "wx" });
    return { curation_sha256: digest(await fs.readFile(receiptPath)) };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function verifyCuration({ runtimeRoot, runtimeName, runtime, target, staged, sha256File, sha256Tree }) {
  const curation = runtime.curation;
  if (!curation) {
    if (staged.curation_sha256 !== undefined) throw new Error(`Unexpected ${runtimeName} curation receipt`);
    return;
  }
  const receiptPath = await safePackagePath(runtimeRoot, RECEIPT_FILE);
  const bytes = await fs.readFile(receiptPath);
  if (digest(bytes) !== staged.curation_sha256) throw new Error(`${runtimeName} curation receipt checksum mismatch`);
  const receipt = JSON.parse(bytes);
  closedObject(receipt, runtimeName === "node" ? ["schema_version", "runtime", "sources"] : ["schema_version", "runtime", "sources", "pip_wheel_sha256", "vendor_tree_sha256"], "Runtime curation receipt");
  if (receipt.schema_version !== 1 || receipt.runtime !== runtimeName || JSON.stringify(receipt.sources) !== JSON.stringify(curation)) throw new Error(`${runtimeName} curation receipt does not match pins`);
  const paths = runtimePaths(target);
  if (runtimeName === "node") {
    const npm = await safePackagePath(runtimeRoot, paths.npm);
    await assertPackage(npm, "npm", curation.npm.version);
    await assertPackage(await safePackagePath(npm, "node_modules/ip-address"), "ip-address", curation.ip_address.version);
    await fs.access(await safePackagePath(npm, "PUPU-BUNDLED-LICENSES.txt"));
  } else {
    const wheel = await safePackagePath(runtimeRoot, `${paths.lib}/ensurepip/_bundled/${curation.pip.archive}`);
    const vendor = await safePackagePath(runtimeRoot, `${paths.site}/pip/_vendor/urllib3`);
    if (!SHA256.test(receipt.pip_wheel_sha256 || "") || await sha256File(wheel) !== receipt.pip_wheel_sha256 || await sha256Tree(vendor) !== receipt.vendor_tree_sha256) throw new Error("Curated pip installed/wheel payload mismatch");
  }
}

function curationNotices(runtimeName, curation, target) {
  if (!curation) return [];
  validateCuration(runtimeName, curation);
  const paths = runtimePaths(target);
  if (runtimeName === "node") return [
    { name: "npm (PuPu curated)", version: curation.npm.version, url: curation.npm.url, license: "Artistic-2.0 and bundled third-party licenses", paths: [`node/${paths.npm}/LICENSE`, `node/${paths.npm}/PUPU-BUNDLED-LICENSES.txt`] },
    { name: "ip-address", version: curation.ip_address.version, url: curation.ip_address.url, license: "MIT", paths: [`node/${paths.npm}/node_modules/ip-address/LICENSE`] },
  ];
  return [{ name: "urllib3 (pip vendor)", version: curation.urllib3.version, url: curation.urllib3.url, license: "MIT", paths: [`python/${paths.site}/pip/_vendor/urllib3/LICENSE.txt`, `python/${paths.site}/pip/_vendor/PUPU-CURATION.json`] }];
}

module.exports = { RECEIPT_FILE, validateCuration, safePackagePath, stageCuration, verifyCuration, transformUrllib3, rebuildWheelRecord, writeDeterministicWheel, curationNotices };
