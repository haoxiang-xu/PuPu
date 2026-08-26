import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";

const require = createRequire(import.meta.url);
const tar = require("tar");
const {
  DEFAULT_PINS_PATH,
  PYTHON_SITECUSTOMIZE,
  SUPPORTED_TARGETS,
  detectHostTarget,
  extractArchive,
  parseArgs,
  prepareMcpRuntime,
  readPinsManifest,
  renameSealedDirectory,
  sha256Tree,
  validatePinsManifest,
  verifyMcpRuntime,
} = require("./prepare-mcp-runtime.cjs");
const {
  currentHostTarget,
  smokePackagedMcpRuntime,
  targetFromAfterPackContext,
  verifyPackagedMcpRuntime,
} = require("./verify-packaged-mcp-runtime.cjs");

const tempDirs = [];

async function makeDirectoriesWritable(directory) {
  const stat = await fs.stat(directory).catch(() => null);
  if (!stat?.isDirectory()) return;
  await fs.chmod(directory, stat.mode | 0o700);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        makeDirectoriesWritable(path.join(directory, entry.name)),
      ),
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      makeDirectoriesWritable(directory)
        .catch(() => {})
        .then(() => fs.rm(directory, { recursive: true, force: true })),
    ),
  );
});

async function makeTempDir() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "pupu-mcp-runtime-test-"),
  );
  tempDirs.push(directory);
  return directory;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildFakePins() {
  const payloads = new Map();
  const makeTargetPin = (runtimeName, version, target) => {
    const archive = `${runtimeName}-${version}-${target}.tar.gz`;
    const url = `https://example.test/${runtimeName}/${version}/${archive}`;
    const payload = Buffer.from(`${runtimeName}:${version}:${target}`);
    payloads.set(url, payload);
    if (runtimeName === "node") {
      return {
        url,
        sha256: sha256(payload),
        archive,
        archive_type: "tar.gz",
        archive_root: `node-${version}-${target}`,
        command: "node/bin/node",
        args_prefix: ["node/lib/node_modules/npm/bin/npx-cli.js"],
        bin_dir: "node/bin",
        required_files: [
          "LICENSE",
          "bin/node",
          "lib/node_modules/npm/bin/npm-cli.js",
          "lib/node_modules/npm/bin/npx-cli.js",
        ],
        executable_files: ["bin/node"],
      };
    }
    if (runtimeName === "python") {
      return {
        url,
        sha256: sha256(payload),
        archive,
        archive_type: "tar.gz",
        archive_root: "python",
        command: "python/bin/python3",
        args_prefix: [],
        bin_dir: "python/bin",
        required_files: ["LICENSE", "PYTHON.json", "bin/python3"],
        required_directories: ["licenses"],
        executable_files: ["bin/python3"],
      };
    }
    return {
      url,
      sha256: sha256(payload),
      archive,
      archive_type: "tar.gz",
      archive_root: `uv-${version}-${target}`,
      command: "uv/uvx",
      args_prefix: [],
      bin_dir: "uv",
      required_files: ["uv", "uvx", "LICENSE-APACHE", "LICENSE-MIT"],
      executable_files: ["uv", "uvx"],
    };
  };

  const apachePayload = Buffer.from("fake Apache license");
  const mitPayload = Buffer.from("fake MIT license");
  const apacheUrl = "https://example.test/uv/0.1.0/licenses/LICENSE-APACHE";
  const mitUrl = "https://example.test/uv/0.1.0/licenses/LICENSE-MIT";
  payloads.set(apacheUrl, apachePayload);
  payloads.set(mitUrl, mitPayload);
  const truststorePayload = Buffer.from("fake truststore wheel");
  const certifiPayload = Buffer.from("fake certifi wheel");
  const truststoreUrl =
    "https://example.test/python-bootstrap/0.10.4/truststore-0.10.4-py3-none-any.whl";
  const certifiUrl =
    "https://example.test/python-bootstrap/2026.2.25/certifi-2026.2.25-py3-none-any.whl";
  payloads.set(truststoreUrl, truststorePayload);
  payloads.set(certifiUrl, certifiPayload);

  return {
    pins: {
      schema_version: 1,
      targets: [...SUPPORTED_TARGETS],
      runtimes: {
        node: {
          version: "v1.0.0",
          default_env: { NODE_USE_SYSTEM_CA: "1" },
          targets: Object.fromEntries(
            SUPPORTED_TARGETS.map((target) => [
              target,
              makeTargetPin("node", "v1.0.0", target),
            ]),
          ),
        },
        uv: {
          version: "0.1.0",
          default_env: {
            UV_SYSTEM_CERTS: "true",
            UV_PYTHON_DOWNLOADS: "never",
          },
          runtime_env: {
            UV_PYTHON: {
              runtime: "python",
              field: "command",
            },
          },
          additional_files: [
            {
              url: apacheUrl,
              sha256: sha256(apachePayload),
              output: "LICENSE-APACHE",
            },
            {
              url: mitUrl,
              sha256: sha256(mitPayload),
              output: "LICENSE-MIT",
            },
          ],
          targets: Object.fromEntries(
            SUPPORTED_TARGETS.map((target) => [
              target,
              makeTargetPin("uv", "0.1.0", target),
            ]),
          ),
        },
        python: {
          version: "3.12.0+test",
          default_env: {
            PYTHONNOUSERSITE: "1",
            PYTHONUTF8: "1",
          },
          post_stage: {
            copy_files: [
              {
                from: "lib/python3.12/LICENSE.txt",
                to: "LICENSE",
              },
            ],
            copy_directories: [
              {
                from: "lib/python3.12/site-packages/pip-26.1.2.dist-info/licenses",
                to: "licenses/pip",
              },
            ],
            provenance_file: "PYTHON.json",
          },
          bootstrap: {
            directory: "python_bootstrap",
            sitecustomize: "sitecustomize.py",
            packages: [
              {
                name: "truststore",
                version: "0.10.4",
                url: truststoreUrl,
                sha256: sha256(truststorePayload),
                archive: "truststore-0.10.4-py3-none-any.whl",
              },
              {
                name: "certifi",
                version: "2026.2.25",
                url: certifiUrl,
                sha256: sha256(certifiPayload),
                archive: "certifi-2026.2.25-py3-none-any.whl",
              },
            ],
            required_files: [
              "sitecustomize.py",
              "truststore/__init__.py",
              "truststore-0.10.4.dist-info/licenses/LICENSE",
              "certifi/__init__.py",
              "certifi/cacert.pem",
              "certifi-2026.2.25.dist-info/licenses/LICENSE",
            ],
          },
          targets: Object.fromEntries(
            SUPPORTED_TARGETS.map((target) => [
              target,
              makeTargetPin("python", "3.12.0+test", target),
            ]),
          ),
        },
      },
    },
    payloads,
  };
}

async function writeFakePins(directory) {
  const fixture = buildFakePins();
  const pinsPath = path.join(directory, "pins.json");
  await fs.writeFile(pinsPath, `${JSON.stringify(fixture.pins, null, 2)}\n`);
  return { ...fixture, pinsPath };
}

function fakeDownloader(payloads, overrides = new Map()) {
  return async (url, destination) => {
    const payload = overrides.has(url) ? overrides.get(url) : payloads.get(url);
    if (!payload) throw new Error(`Missing fake payload for ${url}`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, payload);
  };
}

function fakeRuntimeStager(payloads, cacheDir) {
  return (options) =>
    prepareMcpRuntime({
      ...options,
      cacheDir,
      downloader: fakeDownloader(payloads),
      extractor: fakeExtractor,
      wheelExtractor: fakeWheelExtractor,
    });
}

async function fakeExtractor(
  _archivePath,
  destination,
  _archiveType,
  { runtimeName, pin },
) {
  const runtimeRoot = path.join(destination, pin.archive_root);
  if (runtimeName === "node") {
    await fs.mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
    await fs.mkdir(
      path.join(runtimeRoot, "lib", "node_modules", "npm", "bin"),
      { recursive: true },
    );
    const iconvTableDirectory = path.join(
      runtimeRoot,
      "lib",
      "node_modules",
      "npm",
      "node_modules",
      "iconv-lite",
      "encodings",
      "tables",
    );
    await fs.mkdir(iconvTableDirectory, { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, "LICENSE"), "node license");
    await fs.writeFile(path.join(runtimeRoot, "bin", "node"), "node");
    await fs.writeFile(
      path.join(runtimeRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
      "npm",
    );
    await fs.writeFile(
      path.join(runtimeRoot, "lib", "node_modules", "npm", "bin", "npx-cli.js"),
      "npx",
    );
    await fs.writeFile(
      path.join(iconvTableDirectory, "big5-added.json"),
      '[["8740","䏰䰲"]]\n',
    );
    return;
  }
  if (runtimeName === "python") {
    await fs.mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
    await fs.mkdir(
      path.join(
        runtimeRoot,
        "lib",
        "python3.12",
        "site-packages",
        "pip-26.1.2.dist-info",
        "licenses",
      ),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(runtimeRoot, "lib", "python3.12", "LICENSE.txt"),
      "python license",
    );
    await fs.writeFile(
      path.join(
        runtimeRoot,
        "lib",
        "python3.12",
        "site-packages",
        "pip-26.1.2.dist-info",
        "licenses",
        "LICENSE.txt",
      ),
      "pip license",
    );
    await fs.writeFile(path.join(runtimeRoot, "bin", "python3"), "python");
    return;
  }
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(path.join(runtimeRoot, "uv"), "uv");
  await fs.writeFile(path.join(runtimeRoot, "uvx"), "uvx");
}

async function fakeWheelExtractor(_wheelPath, destination, { packagePin }) {
  if (packagePin.name === "truststore") {
    await fs.mkdir(path.join(destination, "truststore"), { recursive: true });
    await fs.writeFile(
      path.join(destination, "truststore", "__init__.py"),
      "def inject_into_ssl(): pass\n",
    );
    await fs.mkdir(
      path.join(destination, "truststore-0.10.4.dist-info", "licenses"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        destination,
        "truststore-0.10.4.dist-info",
        "licenses",
        "LICENSE",
      ),
      "truststore license",
    );
    return;
  }
  await fs.mkdir(path.join(destination, "certifi"), { recursive: true });
  await fs.writeFile(
    path.join(destination, "certifi", "__init__.py"),
    "def where(): return 'cacert.pem'\n",
  );
  await fs.writeFile(path.join(destination, "certifi", "cacert.pem"), "CA");
  await fs.mkdir(
    path.join(destination, "certifi-2026.2.25.dist-info", "licenses"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(
      destination,
      "certifi-2026.2.25.dist-info",
      "licenses",
      "LICENSE",
    ),
    "certifi license",
  );
}

test("versioned pins cover every supported target without dynamic URLs", async () => {
  const { pins } = await readPinsManifest(DEFAULT_PINS_PATH);
  assert.deepEqual([...pins.targets].sort(), [...SUPPORTED_TARGETS].sort());
  for (const runtime of Object.values(pins.runtimes)) {
    assert.notEqual(runtime.version.toLowerCase(), "latest");
    for (const target of SUPPORTED_TARGETS) {
      assert.match(runtime.targets[target].sha256, /^[a-f0-9]{64}$/);
      assert.doesNotMatch(
        runtime.targets[target].url,
        /\/latest(?:\/|$)|\/index\.json/i,
      );
    }
  }
  assert.equal(pins.runtimes.python.version, "3.12.13+20260718");
  assert.equal(pins.runtimes.node.default_env.NODE_USE_ENV_PROXY, "1");
  assert.equal(pins.runtimes.uv.default_env.UV_PYTHON_DOWNLOADS, "never");
  assert.deepEqual(pins.runtimes.uv.runtime_env.UV_PYTHON, {
    runtime: "python",
    field: "command",
  });
  assert.equal(pins.runtimes.python.default_env.PYTHONDONTWRITEBYTECODE, "1");
  assert.equal(pins.runtimes.python.bootstrap.directory, "python_bootstrap");
});

test("host target detection is explicit and fail-closed", () => {
  assert.equal(detectHostTarget("darwin", "arm64"), "darwin-arm64");
  assert.equal(detectHostTarget("darwin", "x64"), "darwin-x64");
  assert.equal(detectHostTarget("win32", "x64"), "win32-x64");
  assert.equal(detectHostTarget("linux", "x64"), "linux-x64");
  assert.throws(
    () => detectHostTarget("linux", "arm64"),
    /Unsupported MCP runtime build host/,
  );
  assert.equal(
    targetFromAfterPackContext({
      electronPlatformName: "darwin",
      arch: 3,
    }),
    "darwin-arm64",
  );
});

test("CLI argument parsing supports target-specific staging and verification", () => {
  const parsed = parseArgs([
    "--target",
    "darwin-x64",
    "--output",
    "/tmp/example/mcp_runtime",
    "--verify-only",
  ]);
  assert.equal(parsed.target, "darwin-x64");
  assert.equal(parsed.outputDir, "/tmp/example/mcp_runtime");
  assert.equal(parsed.verifyOnly, true);
});

test("Electron build scripts stage the matching target and package only runtime outputs", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(
      path.resolve(path.dirname(DEFAULT_PINS_PATH), "..", "package.json"),
      "utf8",
    ),
  );
  assert.match(
    packageJson.scripts["build:unchain:mac"],
    /build:unchain:mac:raw/,
  );
  assert.match(
    packageJson.scripts["build:unchain:mac:raw"],
    /--target darwin-arm64/,
  );
  assert.match(
    packageJson.scripts["build:unchain:mac:intel"],
    /build:unchain:mac:intel:raw/,
  );
  assert.match(
    packageJson.scripts["build:unchain:mac:intel:raw"],
    /UNCHAIN_TARGET_ARCH=x86_64/,
  );
  assert.doesNotMatch(
    packageJson.scripts["build:unchain:mac:intel:raw"],
    /MISO_TARGET_ARCH/,
  );
  assert.match(packageJson.scripts["build:unchain:win"], /build:unchain:win:raw/);
  assert.match(packageJson.scripts["build:unchain:win:raw"], /--target win32-x64/);
  assert.match(
    packageJson.scripts["build:unchain:linux"],
    /build:unchain:linux:raw/,
  );
  assert.match(
    packageJson.scripts["build:unchain:linux:raw"],
    /--target linux-x64/,
  );
  assert.equal(
    packageJson.build.afterPack,
    "./scripts/verify-packaged-mcp-runtime.cjs",
  );
  assert.deepEqual(
    packageJson.build.extraResources.map(({ from, to }) => ({
      from,
      to,
    })),
    [
      {
        from: "unchain_runtime/dist",
        to: "unchain_runtime/dist",
      },
      {
        from: "THIRD_PARTY_NOTICES.txt",
        to: "THIRD_PARTY_NOTICES.txt",
      },
    ],
  );
});

test("pins reject mutable latest/index metadata sources", () => {
  const { pins } = buildFakePins();
  pins.runtimes.node.targets["darwin-arm64"].url =
    "https://nodejs.org/dist/index.json?v=v1.0.0";
  assert.throws(
    () => validatePinsManifest(pins),
    /must not use latest or index\.json/,
  );
});

test("Python bootstrap respects explicit CA overrides and has safe fallbacks", () => {
  assert.match(
    PYTHON_SITECUSTOMIZE,
    /if not any\(os\.environ\.get\(name\) for name in _PUPU_CA_ENV\):/,
  );
  assert.match(PYTHON_SITECUSTOMIZE, /truststore\.inject_into_ssl\(\)/);
  assert.match(
    PYTHON_SITECUSTOMIZE,
    /os\.environ\["SSL_CERT_FILE"\] = certifi\.where\(\)/,
  );
});

test("tree checksums use bytewise path ordering", async () => {
  const directory = await makeTempDir();
  const treeRoot = path.join(directory, "tree");
  const files = [
    ["z", "letter"],
    ["0", "digit"],
    ["_", "underscore"],
  ];
  await fs.mkdir(treeRoot, { recursive: true });
  for (const [name, content] of files) {
    await fs.writeFile(path.join(treeRoot, name), content);
  }

  const expected = crypto.createHash("sha256");
  for (const [name, content] of [...files].sort(([left], [right]) =>
    Buffer.from(left).compare(Buffer.from(right)),
  )) {
    expected.update(`F\0${name}\0${Buffer.byteLength(content)}\0`);
    expected.update(content);
    expected.update("\0");
  }

  assert.equal(await sha256Tree(treeRoot), expected.digest("hex"));
});

test("preparation seals runtimes and replaces a prior stage", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const outputDir = path.join(directory, "mcp_runtime");
  const options = {
    target: "darwin-arm64",
    pinsPath,
    outputDir,
    cacheDir: path.join(directory, "cache"),
    downloader: fakeDownloader(payloads),
    extractor: fakeExtractor,
    wheelExtractor: fakeWheelExtractor,
  };

  await prepareMcpRuntime(options);
  await prepareMcpRuntime(options);
  await verifyMcpRuntime({
    target: "darwin-arm64",
    pinsPath,
    outputDir,
  });

  if (process.platform !== "win32") {
    const outputMode = (await fs.stat(outputDir)).mode;
    const pythonMode = (await fs.stat(path.join(outputDir, "python"))).mode;
    const executableMode = (
      await fs.stat(path.join(outputDir, "python", "bin", "python3"))
    ).mode;
    assert.equal(outputMode & 0o222, 0);
    assert.equal(pythonMode & 0o222, 0);
    assert.equal(executableMode & 0o222, 0);
  }
});

test("atomic replacement temporarily unlocks a sealed root and restores its mode", async () => {
  const directory = await makeTempDir();
  const tempDir = path.join(directory, ".mcp_runtime.tmp-fixture");
  const outputDir = path.join(directory, "mcp_runtime");
  const payloadPath = path.join(tempDir, "payload.json");
  await fs.mkdir(tempDir);
  await fs.writeFile(payloadPath, '{"fixture":"字节"}\n');
  await fs.chmod(payloadPath, 0o444);
  await fs.chmod(tempDir, 0o555);

  let sourceWasWritable = false;
  await renameSealedDirectory(tempDir, outputDir, {
    rename: async (source, destination) => {
      sourceWasWritable = ((await fs.stat(source)).mode & 0o200) !== 0;
      await fs.rename(source, destination);
    },
  });

  assert.equal(sourceWasWritable, true);
  assert.equal((await fs.stat(outputDir)).mode & 0o222, 0);
  assert.equal((await fs.stat(path.join(outputDir, "payload.json"))).mode & 0o222, 0);
});

test("prepares and verifies Node/npm/npx, uv/uvx, and CPython", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const outputDir = path.join(directory, "mcp_runtime");
  const cacheDir = path.join(directory, "cache");

  const manifest = await prepareMcpRuntime({
    target: "darwin-arm64",
    pinsPath,
    outputDir,
    cacheDir,
    downloader: fakeDownloader(payloads),
    extractor: fakeExtractor,
    wheelExtractor: fakeWheelExtractor,
  });

  assert.equal(manifest.target, "darwin-arm64");
  assert.equal(manifest.runtimes.node.command, "node/bin/node");
  assert.deepEqual(manifest.runtimes.node.args_prefix, [
    "node/lib/node_modules/npm/bin/npx-cli.js",
  ]);
  assert.equal(manifest.runtimes.uv.command, "uv/uvx");
  assert.equal(manifest.runtimes.uv.default_env, undefined);
  assert.equal(manifest.runtimes.uv.runtime_env, undefined);
  assert.equal(manifest.runtimes.python.command, "python/bin/python3");
  assert.equal(manifest.runtimes.python.bootstrap_dir, "python_bootstrap");
  assert.equal(path.isAbsolute(manifest.runtimes.node.command), false);
  await fs.access(path.join(outputDir, "node", "bin", "node"));
  await fs.access(path.join(outputDir, "uv", "uvx"));
  await fs.access(path.join(outputDir, "uv", "LICENSE-APACHE"));
  await fs.access(path.join(outputDir, "python", "bin", "python3"));
  await fs.access(path.join(outputDir, "python", "LICENSE"));
  await fs.access(path.join(outputDir, "python", "licenses"));
  await fs.access(path.join(outputDir, "python", "PYTHON.json"));
  await fs.access(
    path.join(outputDir, "python_bootstrap", "truststore", "__init__.py"),
  );
  await fs.access(
    path.join(outputDir, "python_bootstrap", "certifi", "cacert.pem"),
  );
  await fs.access(
    path.join(
      outputDir,
      "python_bootstrap",
      "truststore-0.10.4.dist-info",
      "licenses",
      "LICENSE",
    ),
  );
  await fs.access(
    path.join(
      outputDir,
      "python_bootstrap",
      "certifi-2026.2.25.dist-info",
      "licenses",
      "LICENSE",
    ),
  );
  assert.equal(
    await fs.readFile(
      path.join(outputDir, "python_bootstrap", "sitecustomize.py"),
      "utf8",
    ),
    PYTHON_SITECUSTOMIZE,
  );

  const verified = await verifyMcpRuntime({
    target: "darwin-arm64",
    pinsPath,
    outputDir,
  });
  assert.equal(verified.runtimes.node.staged_tree_sha256.length, 64);
  assert.equal(verified.runtimes.uv.staged_tree_sha256.length, 64);
  assert.equal(verified.runtimes.python.staged_tree_sha256.length, 64);
  assert.equal(verified.runtimes.node.tree_sha256, undefined);
  assert.equal(verified.runtimes.python.bootstrap_tree_sha256.length, 64);
});

test("rejects an archive that does not match the pinned checksum", async () => {
  const directory = await makeTempDir();
  const { pins, pinsPath, payloads } = await writeFakePins(directory);
  const nodeUrl = pins.runtimes.node.targets["darwin-arm64"].url;
  const overrides = new Map([[nodeUrl, Buffer.from("tampered archive")]]);

  await assert.rejects(
    prepareMcpRuntime({
      target: "darwin-arm64",
      pinsPath,
      outputDir: path.join(directory, "mcp_runtime"),
      cacheDir: path.join(directory, "cache"),
      downloader: fakeDownloader(payloads, overrides),
      extractor: fakeExtractor,
      wheelExtractor: fakeWheelExtractor,
    }),
    /Checksum mismatch/,
  );
});

test("verification catches staged runtime tampering", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const outputDir = path.join(directory, "mcp_runtime");

  await prepareMcpRuntime({
    target: "darwin-arm64",
    pinsPath,
    outputDir,
    cacheDir: path.join(directory, "cache"),
    downloader: fakeDownloader(payloads),
    extractor: fakeExtractor,
    wheelExtractor: fakeWheelExtractor,
  });
  const nodePath = path.join(outputDir, "node", "bin", "node");
  const nodeStat = await fs.stat(nodePath);
  await fs.chmod(nodePath, nodeStat.mode | 0o200);
  await fs.appendFile(nodePath, "changed");

  await assert.rejects(
    verifyMcpRuntime({
      target: "darwin-arm64",
      pinsPath,
      outputDir,
    }),
    /tree checksum mismatch/,
  );
});

test("afterPack restages a writable cache-polluted runtime", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const resourcesDir = path.join(directory, "app-out", "resources");
  const outputDir = path.join(resourcesDir, "mcp_runtime");
  const cacheDir = path.join(directory, "cache");
  const stagedOptions = {
    target: "linux-x64",
    pinsPath,
    outputDir,
    cacheDir,
    downloader: fakeDownloader(payloads),
    extractor: fakeExtractor,
    wheelExtractor: fakeWheelExtractor,
  };

  await prepareMcpRuntime(stagedOptions);
  await makeDirectoriesWritable(outputDir);
  const generatedBytecode = path.join(
    outputDir,
    "python",
    "lib",
    "python3.12",
    "__pycache__",
    "generated.cpython-312.pyc",
  );
  await fs.mkdir(path.dirname(generatedBytecode), { recursive: true });
  await fs.writeFile(generatedBytecode, "generated cache");
  const stagedCalls = [];
  const stageMcpRuntime = async (options) => {
    stagedCalls.push(options);
    return fakeRuntimeStager(payloads, cacheDir)(options);
  };

  await verifyPackagedMcpRuntime(
    {
      electronPlatformName: "linux",
      arch: "x64",
      appOutDir: path.join(directory, "app-out"),
      packager: {
        getResourcesDir: () => resourcesDir,
      },
    },
    {
      pinsPath,
      stageMcpRuntime,
      executeFile: async (command, args) => {
        if (!args.includes("--version")) {
          return { stdout: "truststore._api\n", stderr: "" };
        }
        if (command.includes(`${path.sep}node${path.sep}`)) {
          return {
            stdout: args.length === 1 ? "v1.0.0\n" : "11.6.2\n",
            stderr: "",
          };
        }
        if (command.includes(`${path.sep}uv${path.sep}`)) {
          return { stdout: "uvx 0.1.0\n", stderr: "" };
        }
        return { stdout: "Python 3.12.0\n", stderr: "" };
      },
    },
  );
  await assert.rejects(fs.access(generatedBytecode), { code: "ENOENT" });
  assert.equal(stagedCalls.length, 1);
  assert.equal(stagedCalls[0].outputDir, outputDir);
  if (process.platform !== "win32") {
    const pythonDirectory = await fs.stat(path.join(outputDir, "python"));
    const manifest = await fs.stat(path.join(outputDir, "manifest.json"));
    assert.notEqual(pythonDirectory.mode & 0o222, 0);
    assert.equal(manifest.mode & 0o222, 0);
  }
});

test("afterPack unlocks only the verified macOS package copy for codesign", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const resourcesDir = path.join(directory, "app-out", "resources");
  const outputDir = path.join(resourcesDir, "mcp_runtime");
  const cacheDir = path.join(directory, "cache");
  const target = currentHostTarget() === "darwin-arm64"
    ? "darwin-x64"
    : "darwin-arm64";

  await verifyPackagedMcpRuntime(
    {
      electronPlatformName: "darwin",
      arch: target.endsWith("arm64") ? "arm64" : "x64",
      appOutDir: path.join(directory, "app-out"),
      packager: {
        getResourcesDir: () => resourcesDir,
      },
    },
    {
      pinsPath,
      stageMcpRuntime: fakeRuntimeStager(payloads, cacheDir),
    },
  );

  const binaryLikeDataPath = path.join(
    outputDir,
    "node",
    "lib",
    "node_modules",
    "npm",
    "node_modules",
    "iconv-lite",
    "encodings",
    "tables",
    "big5-added.json",
  );
  assert.notEqual((await fs.stat(binaryLikeDataPath)).mode & 0o200, 0);
  await verifyMcpRuntime({ target, pinsPath, outputDir });
});

test("afterPack executes every bundled runtime natively without mutating it", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const target = currentHostTarget();
  const resourcesDir = path.join(directory, "app-out", "resources");
  const outputDir = path.join(resourcesDir, "mcp_runtime");
  const cacheDir = path.join(directory, "cache");
  const calls = [];

  await prepareMcpRuntime({
    target,
    pinsPath,
    outputDir,
    cacheDir,
    downloader: fakeDownloader(payloads),
    extractor: fakeExtractor,
    wheelExtractor: fakeWheelExtractor,
  });

  const executeFile = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes("--version")) {
      if (command.includes(`${path.sep}node${path.sep}`)) {
        return {
          stdout: args.length === 1 ? "v1.0.0\n" : "11.6.2\n",
          stderr: "",
        };
      }
      if (command.includes(`${path.sep}uv${path.sep}`)) {
        return { stdout: "uvx 0.1.0\n", stderr: "" };
      }
      return { stdout: "Python 3.12.0\n", stderr: "" };
    }
    return { stdout: "truststore._api\n", stderr: "" };
  };

  await verifyPackagedMcpRuntime(
    {
      electronPlatformName: process.platform,
      arch: process.arch,
      appOutDir: path.join(directory, "app-out"),
      packager: {
        getResourcesDir: () => resourcesDir,
      },
    },
    {
      pinsPath,
      executeFile,
      stageMcpRuntime: fakeRuntimeStager(payloads, cacheDir),
      requireNativeSmoke: true,
    },
  );

  assert.equal(calls.length, 5);
  const truststoreCall = calls.at(-1);
  assert.equal(truststoreCall.options.env.PYTHONDONTWRITEBYTECODE, "1");
  assert.equal(truststoreCall.options.env.PYTHONNOUSERSITE, "1");
  assert.equal(truststoreCall.options.env.SSL_CERT_FILE, undefined);
  assert.equal(truststoreCall.options.env.SSL_CERT_DIR, undefined);
  assert.equal(truststoreCall.options.env.PYTHONHOME, undefined);
  assert.match(truststoreCall.options.env.PYTHONPATH, /python_bootstrap$/);

  const manifest = await verifyMcpRuntime({
    target,
    pinsPath,
    outputDir,
  });
  await smokePackagedMcpRuntime(outputDir, manifest, { executeFile });
});

test("a failed preparation leaves an existing stage untouched", async () => {
  const directory = await makeTempDir();
  const { pinsPath, payloads } = await writeFakePins(directory);
  const outputDir = path.join(directory, "mcp_runtime");
  await fs.mkdir(outputDir);
  await fs.writeFile(path.join(outputDir, "existing.txt"), "keep me");

  await assert.rejects(
    prepareMcpRuntime({
      target: "darwin-arm64",
      pinsPath,
      outputDir,
      cacheDir: path.join(directory, "cache"),
      downloader: fakeDownloader(payloads),
      extractor: async (...args) => {
        const details = args[3];
        if (details.runtimeName === "uv") {
          throw new Error("synthetic extraction failure");
        }
        await fakeExtractor(...args);
      },
      wheelExtractor: fakeWheelExtractor,
    }),
    /synthetic extraction failure/,
  );
  assert.equal(
    await fs.readFile(path.join(outputDir, "existing.txt"), "utf8"),
    "keep me",
  );
});

test("tar.gz extraction preserves a single pinned archive root", async () => {
  const directory = await makeTempDir();
  const sourceDir = path.join(directory, "source");
  const archivePath = path.join(directory, "fixture.tar.gz");
  const extractedDir = path.join(directory, "extracted");
  await fs.mkdir(path.join(sourceDir, "runtime-root"), { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, "runtime-root", "runtime"),
    "fixture",
  );
  await tar.c({ cwd: sourceDir, file: archivePath, gzip: true }, [
    "runtime-root",
  ]);

  await extractArchive(archivePath, extractedDir, "tar.gz");
  assert.equal(
    await fs.readFile(
      path.join(extractedDir, "runtime-root", "runtime"),
      "utf8",
    ),
    "fixture",
  );
});
