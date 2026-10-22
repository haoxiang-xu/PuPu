import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import test from "node:test";

const require = createRequire(import.meta.url);
const curation = require("./mcp-runtime-curation.cjs");
const preparation = require("./prepare-mcp-runtime.cjs");
const tar = require("tar");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

const source = (version, archive) => ({
  version,
  url: `https://example.test/${version}/${archive}`,
  sha256: "a".repeat(64),
  archive,
});
const nodeCuration = () => ({
  schema_version: 1,
  npm: { ...source("11.21.1", "npm-11.21.1.tgz"), expected_base_version: "11.19.1" },
  ip_address: { ...source("10.7.4", "ip-address-10.7.4.tgz"), expected_base_version: "10.7.2" },
});

test("curation descriptors are typed and closed", () => {
  assert.doesNotThrow(() => curation.validateCuration("node", nodeCuration()));
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.npm.to = "../outside"; },
    (value) => { value.npm.sha256 = "bad"; },
    (value) => { value.npm.url = "http://example.test/11.21.1/npm-11.21.1.tgz"; },
    (value) => { delete value.ip_address; },
  ]) {
    const value = nodeCuration();
    mutate(value);
    assert.throws(() => curation.validateCuration("node", value));
  }
  assert.throws(() => curation.validateCuration("uv", nodeCuration()));
});

test("writes deterministic wheels with independently readable CRC and RECORD", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-curation-zip-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "input", "demo-1.dist-info"), { recursive: true });
  await fs.writeFile(path.join(root, "input", "demo.py"), "value = 1\n");
  await curation.rebuildWheelRecord(path.join(root, "input"), "demo-1.dist-info/RECORD");
  const first = path.join(root, "first.whl");
  const second = path.join(root, "second.whl");
  await curation.writeDeterministicWheel(path.join(root, "input"), first);
  await curation.writeDeterministicWheel(path.join(root, "input"), second);
  assert.deepEqual(await fs.readFile(first), await fs.readFile(second));
  const { extractWheel } = require("./prepare-mcp-runtime.cjs");
  await extractWheel(first, path.join(root, "readback"));
  assert.equal(await fs.readFile(path.join(root, "readback/demo.py"), "utf8"), "value = 1\n");
  assert.match(await fs.readFile(path.join(root, "readback/demo-1.dist-info/RECORD"), "utf8"), /demo.py,sha256=[A-Za-z0-9_-]+,10/);
});

test("destination guards reject a symlink ancestor before a write", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-curation-link-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "runtime"));
  await fs.mkdir(path.join(root, "outside"));
  await fs.symlink(path.join(root, "outside"), path.join(root, "runtime/link"), "dir");
  await assert.rejects(curation.safePackagePath(path.join(root, "runtime"), "link/package"), /symlink/);
  await assert.rejects(curation.safePackagePath(path.join(root, "runtime"), "../outside"), /relative|escape/);
  assert.equal(await curation.safePackagePath(path.join(root, "runtime"), "new/package"), path.join(root, "runtime/new/package"));
});

test("urllib3 curation preserves pip namespace and optional dependency policy", () => {
  assert.equal(curation.transformUrllib3("util/url.py", "            import idna\n"), "            from pip._vendor import idna\n");
  assert.equal(curation.transformUrllib3("contrib/socks.py", "import socks\n"), "import socks\n");
  assert.throws(() => curation.transformUrllib3("util/url.py", "import changed_dependency\n"), /expected/);
});

async function npmFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-curation-npm-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtimeRoot = path.join(root, "stage/node");
  const npm = path.join(runtimeRoot, "lib/node_modules/npm");
  await fs.mkdir(npm, { recursive: true });
  await fs.writeFile(path.join(npm, "package.json"), JSON.stringify({ name: "npm", version: "11.19.1" }));
  const config = nodeCuration();
  const archives = new Map();
  for (const [name, pin] of [["npm", config.npm], ["ip-address", config.ip_address]]) {
    const sourceRoot = path.join(root, `source-${name}`);
    const packageRoot = path.join(sourceRoot, "package");
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name, version: pin.version }));
    await fs.writeFile(path.join(packageRoot, "LICENSE"), `${name} license`);
    if (name === "npm") {
      await fs.mkdir(path.join(packageRoot, "node_modules/ip-address"), { recursive: true });
      await fs.writeFile(path.join(packageRoot, "node_modules/ip-address/package.json"), JSON.stringify({ name: "ip-address", version: "10.7.2" }));
    }
    const archive = path.join(root, pin.archive);
    await tar.c({ cwd: sourceRoot, file: archive, gzip: true }, ["package"]);
    const bytes = await fs.readFile(archive);
    pin.sha256 = hash(bytes);
    archives.set(pin.url, bytes);
  }
  const options = {
    runtimeRoot, runtimeName: "node", runtime: { curation: config }, target: "darwin-arm64",
    cacheDir: path.join(root, "cache"),
    downloader: async (url, destination) => fs.writeFile(destination, archives.get(url)),
    ...Object.fromEntries(["ensureCachedSource", "extractArchive", "extractWheel", "sha256File", "sha256Tree"].map((name) => [name, preparation[name]])),
  };
  return { root, npm, options, config };
}

test("whole npm overlays preserve provenance and reject a forged receipt", async (t) => {
  const { npm, options } = await npmFixture(t);
  const staged = await curation.stageCuration(options);
  await curation.verifyCuration({ ...options, staged });
  assert.equal(JSON.parse(await fs.readFile(path.join(npm, "node_modules/ip-address/package.json"))).version, "10.7.4");
  assert.match(await fs.readFile(path.join(npm, "PUPU-BUNDLED-LICENSES.txt"), "utf8"), /ip-address license/);
  const file = path.join(options.runtimeRoot, curation.RECEIPT_FILE);
  const receipt = JSON.parse(await fs.readFile(file));
  receipt.sources.npm.version = "0.0.0";
  await fs.writeFile(file, JSON.stringify(receipt));
  await assert.rejects(curation.verifyCuration({ ...options, staged }), /receipt checksum/);
});

test("a corrupt whole-package source leaves original runtime bytes intact", async (t) => {
  const { npm, options, config } = await npmFixture(t);
  const original = await fs.readFile(path.join(npm, "package.json"));
  config.ip_address.sha256 = "0".repeat(64);
  await assert.rejects(curation.stageCuration(options), /Checksum mismatch/);
  assert.deepEqual(await fs.readFile(path.join(npm, "package.json")), original);
  await assert.rejects(fs.access(path.join(options.runtimeRoot, curation.RECEIPT_FILE)));
});

test("unexpected base package is rejected before any replacement", async (t) => {
  const { npm, options } = await npmFixture(t);
  const original = '{"name":"npm","version":"0.0.0"}';
  await fs.writeFile(path.join(npm, "package.json"), original);
  await assert.rejects(curation.stageCuration(options), /Unexpected base npm/);
  assert.equal(await fs.readFile(path.join(npm, "package.json"), "utf8"), original);
});

test("invalid package archive cannot replace an original runtime", async (t) => {
  const { npm, options, config } = await npmFixture(t);
  const original = await fs.readFile(path.join(npm, "package.json"));
  const invalid = Buffer.from("not a package archive");
  config.npm.sha256 = hash(invalid);
  const previous = options.downloader;
  options.downloader = async (url, destination) => url === config.npm.url ? fs.writeFile(destination, invalid) : previous(url, destination);
  await assert.rejects(curation.stageCuration(options));
  assert.deepEqual(await fs.readFile(path.join(npm, "package.json")), original);
});

async function pipFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-curation-pip-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = path.join(root, "base");
  const replacement = path.join(root, "replacement");
  const config = {
    schema_version: 1,
    pip: source("26.2.2", "pip-26.2.2-py3-none-any.whl"),
    urllib3: { ...source("2.8.0", "urllib3-2.8.0-py3-none-any.whl"), expected_base_version: "2.7.0" },
  };
  const write = async (directory, name, text) => {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), text);
  };
  for (const [name, text] of Object.entries({
    "pip/__init__.py": "__version__ = '26.2.2'\n",
    "pip/_vendor/urllib3/__init__.py": "__version__ = '2.7.0'\n",
    "pip/_vendor/vendor.txt": "    urllib3==2.7.0\n",
    "pip/_vendor/README.rst": "Upstream vendoring policy\n",
    "pip/_vendor/bom.cdx.json": JSON.stringify({ components: [{ name: "urllib3", version: "2.7.0", "bom-ref": "pkg:pypi/urllib3@2.7.0", purl: "pkg:pypi/urllib3@2.7.0" }] }),
    "pip/_vendor/distlib/t64.exe": "PBS platform launcher bytes",
    "pip-26.2.2.dist-info/METADATA": "Metadata-Version: 2.1\nName: pip\nVersion: 26.2.2\n",
  })) await write(base, name, text);
  for (const [name, text] of Object.entries({
    "urllib3/__init__.py": "__version__ = '2.8.0'\n",
    "urllib3/util/url.py": "def _idna_encode():\n    if True:\n        if True:\n            import idna\n",
    "urllib3-2.8.0.dist-info/METADATA": "Metadata-Version: 2.1\nName: urllib3\nVersion: 2.8.0\n",
    "urllib3-2.8.0.dist-info/licenses/LICENSE.txt": "urllib3 MIT license\n",
  })) await write(replacement, name, text);
  await curation.rebuildWheelRecord(base, "pip-26.2.2.dist-info/RECORD");
  const archives = new Map();
  for (const [directory, pin] of [[base, config.pip], [replacement, config.urllib3]]) {
    const archive = path.join(root, pin.archive);
    await curation.writeDeterministicWheel(directory, archive);
    const bytes = await fs.readFile(archive);
    pin.sha256 = hash(bytes);
    archives.set(pin.url, bytes);
  }
  const runtimeRoot = path.join(root, "stage/python");
  const site = path.join(runtimeRoot, "lib/python3.12/site-packages");
  await fs.cp(base, site, { recursive: true });
  const bundled = path.join(runtimeRoot, "lib/python3.12/ensurepip/_bundled", config.pip.archive);
  await fs.mkdir(path.dirname(bundled), { recursive: true });
  await fs.writeFile(bundled, archives.get(config.pip.url));
  return {
    root, site, bundled, config,
    options: {
      runtimeRoot, runtimeName: "python", runtime: { curation: config }, target: "darwin-arm64", cacheDir: path.join(root, "cache"),
      downloader: async (url, destination) => fs.writeFile(destination, archives.get(url)),
      ...Object.fromEntries(["ensureCachedSource", "extractArchive", "extractWheel", "sha256File", "sha256Tree"].map((name) => [name, preparation[name]])),
    },
  };
}

test("pip vendor update patches installed and ensurepip copies while preserving PBS launchers", async (t) => {
  const { root, site, bundled, options } = await pipFixture(t);
  const staged = await curation.stageCuration(options);
  await curation.verifyCuration({ ...options, staged });
  assert.equal(await fs.readFile(path.join(site, "pip/_vendor/distlib/t64.exe"), "utf8"), "PBS platform launcher bytes");
  assert.match(await fs.readFile(path.join(site, "pip/_vendor/vendor.txt"), "utf8"), /urllib3==2.8.0/);
  const readback = path.join(root, "readback");
  await preparation.extractWheel(bundled, readback);
  for (const name of ["pip/_vendor/urllib3/__init__.py", "pip/_vendor/urllib3/util/url.py", "pip/_vendor/vendor.txt", "pip/_vendor/PUPU-CURATION.json"]) {
    assert.deepEqual(await fs.readFile(path.join(site, name)), await fs.readFile(path.join(readback, name)));
  }
  assert.match(await fs.readFile(path.join(readback, "pip-26.2.2.dist-info/RECORD"), "utf8"), /pip\/_vendor\/PUPU-CURATION.json,sha256=/);
  assert.match(await fs.readFile(path.join(site, "pip-26.2.2.dist-info/RECORD"), "utf8"), /pip\/_vendor\/urllib3\/LICENSE.txt,sha256=/);
});

test("pip curation rejects an unexpected ensurepip wheel before changing installed files", async (t) => {
  const { site, bundled, options } = await pipFixture(t);
  await fs.writeFile(bundled, "corrupted wheel");
  await assert.rejects(curation.stageCuration(options), /base ensurepip wheel checksum/);
  assert.match(await fs.readFile(path.join(site, "pip/_vendor/vendor.txt"), "utf8"), /urllib3==2.7.0/);
});

test("pip curation rejects unexpected base source bytes", async (t) => {
  const { site, options } = await pipFixture(t);
  await fs.appendFile(path.join(site, "pip/_vendor/urllib3/__init__.py"), "unexpected = True\n");
  await assert.rejects(curation.stageCuration(options), /Unexpected installed pip urllib3 base bytes/);
  assert.match(await fs.readFile(path.join(site, "pip/_vendor/vendor.txt"), "utf8"), /urllib3==2.7.0/);
});
