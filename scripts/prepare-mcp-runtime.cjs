#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const extractZip = require("extract-zip");
const tar = require("tar");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PINS_PATH = path.join(
  REPO_ROOT,
  "unchain_runtime",
  "mcp_runtime_pins.json"
);
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  "unchain_runtime",
  "mcp_runtime"
);
const DEFAULT_CACHE_DIR = path.join(
  REPO_ROOT,
  "node_modules",
  ".cache",
  "pupu-mcp-runtime"
);
const SUPPORTED_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "win32-x64",
  "linux-x64",
];
const REQUIRED_RUNTIMES = ["node", "uv", "python"];
const SHA256_RE = /^[a-f0-9]{64}$/;
const FORBIDDEN_DYNAMIC_URL_RE = /(?:\/latest(?:\/|$)|\/index\.json(?:$|[?#]))/i;
const PYTHON_SITECUSTOMIZE = [
  '"""PuPu-managed TLS trust bootstrap for Python MCP subprocesses."""',
  "",
  "import os",
  "",
  '_PUPU_CA_ENV = ("SSL_CERT_FILE", "SSL_CERT_DIR")',
  "if not any(os.environ.get(name) for name in _PUPU_CA_ENV):",
  "    try:",
  "        import truststore",
  "",
  "        truststore.inject_into_ssl()",
  "    except Exception:",
  "        try:",
  "            import certifi",
  "",
  '            os.environ["SSL_CERT_FILE"] = certifi.where()',
  "        except Exception:",
  "            pass",
  "",
].join("\n");

function usage() {
  return [
    "Usage:",
    "  node scripts/prepare-mcp-runtime.cjs [options]",
    "",
    "Options:",
    "  --target <target>   darwin-arm64, darwin-x64, win32-x64, or linux-x64",
    "                      (default: current host)",
    "  --pins <path>       Versioned pins manifest",
    "  --output <path>     Staging directory (basename must be mcp_runtime)",
    "  --cache <path>      Verified archive download cache",
    "  --verify-only       Verify an existing staging directory without network",
    "  --help              Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = {
    target: "",
    pinsPath: DEFAULT_PINS_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    cacheDir: DEFAULT_CACHE_DIR,
    verifyOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--verify-only") {
      parsed.verifyOnly = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (["--target", "--pins", "--output", "--cache"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      if (arg === "--target") parsed.target = value;
      if (arg === "--pins") parsed.pinsPath = path.resolve(value);
      if (arg === "--output") parsed.outputDir = path.resolve(value);
      if (arg === "--cache") parsed.cacheDir = path.resolve(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function detectHostTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new Error(
      `Unsupported MCP runtime build host: ${platform}/${arch}. ` +
        `Supported targets: ${SUPPORTED_TARGETS.join(", ")}`
    );
  }
  return target;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRelativeManifestPath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\")) {
    throw new Error(`${label} must be a non-empty forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    path.posix.isAbsolute(value) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== value
  ) {
    throw new Error(`${label} must stay inside the staged runtime: ${value}`);
  }
  return value;
}

function validatePinnedSource(source, label, version, { archive = false } = {}) {
  if (!isPlainObject(source)) {
    throw new Error(`${label} must be an object`);
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(source.url);
  } catch {
    throw new Error(`${label}.url must be a valid URL`);
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${label}.url must use https`);
  }
  if (FORBIDDEN_DYNAMIC_URL_RE.test(source.url)) {
    throw new Error(`${label}.url must not use latest or index.json`);
  }
  if (!source.url.includes(version)) {
    throw new Error(`${label}.url must contain the pinned version ${version}`);
  }
  if (!SHA256_RE.test(source.sha256 || "")) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256 digest`);
  }

  if (archive) {
    if (!["tar.gz", "zip"].includes(source.archive_type)) {
      throw new Error(`${label}.archive_type must be tar.gz or zip`);
    }
    if (
      typeof source.archive !== "string" ||
      path.posix.basename(parsedUrl.pathname) !== source.archive
    ) {
      throw new Error(`${label}.archive must match the URL filename`);
    }
    assertRelativeManifestPath(source.archive_root, `${label}.archive_root`);
  }
}

function validatePostStageRules(postStage, label) {
  if (postStage === undefined) return;
  if (!isPlainObject(postStage)) {
    throw new Error(`${label} must be an object`);
  }
  for (const ruleName of ["copy_files", "copy_directories"]) {
    const rules = postStage[ruleName] || [];
    if (!Array.isArray(rules)) {
      throw new Error(`${label}.${ruleName} must be an array`);
    }
    rules.forEach((rule, index) => {
      if (!isPlainObject(rule)) {
        throw new Error(`${label}.${ruleName}[${index}] must be an object`);
      }
      assertRelativeManifestPath(
        rule.from,
        `${label}.${ruleName}[${index}].from`
      );
      assertRelativeManifestPath(
        rule.to,
        `${label}.${ruleName}[${index}].to`
      );
    });
  }
  if (postStage.provenance_file !== undefined) {
    assertRelativeManifestPath(
      postStage.provenance_file,
      `${label}.provenance_file`
    );
  }
}

function validatePinsManifest(pins) {
  if (!isPlainObject(pins) || pins.schema_version !== 1) {
    throw new Error("MCP runtime pins must use schema_version 1");
  }
  if (
    !Array.isArray(pins.targets) ||
    JSON.stringify([...pins.targets].sort()) !==
      JSON.stringify([...SUPPORTED_TARGETS].sort())
  ) {
    throw new Error(
      `MCP runtime pins must cover exactly: ${SUPPORTED_TARGETS.join(", ")}`
    );
  }
  if (!isPlainObject(pins.runtimes)) {
    throw new Error("MCP runtime pins must define runtimes");
  }

  for (const runtimeName of REQUIRED_RUNTIMES) {
    const runtime = pins.runtimes[runtimeName];
    if (!isPlainObject(runtime)) {
      throw new Error(`Missing pinned runtime: ${runtimeName}`);
    }
    if (
      typeof runtime.version !== "string" ||
      !runtime.version ||
      runtime.version.toLowerCase() === "latest"
    ) {
      throw new Error(`${runtimeName}.version must be fixed`);
    }
    if (!isPlainObject(runtime.targets)) {
      throw new Error(`${runtimeName}.targets must be an object`);
    }
    if (
      runtime.default_env !== undefined &&
      (!isPlainObject(runtime.default_env) ||
        Object.values(runtime.default_env).some(
          (value) => typeof value !== "string"
        ))
    ) {
      throw new Error(`${runtimeName}.default_env must contain string values`);
    }
    if (runtime.runtime_env !== undefined) {
      if (!isPlainObject(runtime.runtime_env)) {
        throw new Error(`${runtimeName}.runtime_env must be an object`);
      }
      for (const [envName, reference] of Object.entries(runtime.runtime_env)) {
        if (
          !envName ||
          !isPlainObject(reference) ||
          !REQUIRED_RUNTIMES.includes(reference.runtime) ||
          reference.field !== "command"
        ) {
          throw new Error(
            `${runtimeName}.runtime_env.${envName} must reference a runtime command`
          );
        }
      }
    }

    for (const target of SUPPORTED_TARGETS) {
      const targetPin = runtime.targets[target];
      const label = `${runtimeName}.targets.${target}`;
      validatePinnedSource(targetPin, label, runtime.version, {
        archive: true,
      });
      assertRelativeManifestPath(targetPin.command, `${label}.command`);
      assertRelativeManifestPath(targetPin.bin_dir, `${label}.bin_dir`);
      if (
        !Array.isArray(targetPin.args_prefix) ||
        targetPin.args_prefix.some((value) => typeof value !== "string")
      ) {
        throw new Error(`${label}.args_prefix must be an array of strings`);
      }
      if (
        !Array.isArray(targetPin.required_files) ||
        targetPin.required_files.length === 0
      ) {
        throw new Error(`${label}.required_files must not be empty`);
      }
      targetPin.required_files.forEach((value, index) =>
        assertRelativeManifestPath(
          value,
          `${label}.required_files[${index}]`
        )
      );
      if (!Array.isArray(targetPin.required_directories || [])) {
        throw new Error(`${label}.required_directories must be an array`);
      }
      (targetPin.required_directories || []).forEach((value, index) =>
        assertRelativeManifestPath(
          value,
          `${label}.required_directories[${index}]`
        )
      );
      if (!Array.isArray(targetPin.executable_files)) {
        throw new Error(`${label}.executable_files must be an array`);
      }
      targetPin.executable_files.forEach((value, index) =>
        assertRelativeManifestPath(
          value,
          `${label}.executable_files[${index}]`
        )
      );
      validatePostStageRules(targetPin.post_stage, `${label}.post_stage`);
    }

    for (const [index, extraFile] of (
      runtime.additional_files || []
    ).entries()) {
      const label = `${runtimeName}.additional_files[${index}]`;
      validatePinnedSource(extraFile, label, runtime.version);
      assertRelativeManifestPath(extraFile.output, `${label}.output`);
    }
    validatePostStageRules(
      runtime.post_stage,
      `${runtimeName}.post_stage`
    );
    if (runtime.bootstrap !== undefined) {
      const bootstrap = runtime.bootstrap;
      if (!isPlainObject(bootstrap)) {
        throw new Error(`${runtimeName}.bootstrap must be an object`);
      }
      assertRelativeManifestPath(
        bootstrap.directory,
        `${runtimeName}.bootstrap.directory`
      );
      assertRelativeManifestPath(
        bootstrap.sitecustomize,
        `${runtimeName}.bootstrap.sitecustomize`
      );
      if (!Array.isArray(bootstrap.packages) || bootstrap.packages.length === 0) {
        throw new Error(`${runtimeName}.bootstrap.packages must not be empty`);
      }
      for (const [index, packagePin] of bootstrap.packages.entries()) {
        const label = `${runtimeName}.bootstrap.packages[${index}]`;
        if (
          !isPlainObject(packagePin) ||
          !/^[a-z0-9_-]+$/.test(packagePin.name || "") ||
          typeof packagePin.version !== "string" ||
          !packagePin.version
        ) {
          throw new Error(`${label} must pin a named package version`);
        }
        validatePinnedSource(packagePin, label, packagePin.version);
        if (
          typeof packagePin.archive !== "string" ||
          path.posix.basename(new URL(packagePin.url).pathname) !==
            packagePin.archive
        ) {
          throw new Error(`${label}.archive must match the URL filename`);
        }
      }
      if (
        !Array.isArray(bootstrap.required_files) ||
        bootstrap.required_files.length === 0
      ) {
        throw new Error(
          `${runtimeName}.bootstrap.required_files must not be empty`
        );
      }
      bootstrap.required_files.forEach((value, index) =>
        assertRelativeManifestPath(
          value,
          `${runtimeName}.bootstrap.required_files[${index}]`
        )
      );
    }
  }
  return pins;
}

async function readPinsManifest(pinsPath = DEFAULT_PINS_PATH) {
  const raw = await fsp.readFile(pinsPath);
  const pins = validatePinsManifest(JSON.parse(raw.toString("utf8")));
  return {
    pins,
    sha256: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function cacheFilename(runtimeName, source) {
  const sourceName =
    source.archive ||
    path.posix.basename(new URL(source.url).pathname) ||
    source.output;
  const safeName = sourceName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${runtimeName}-${source.sha256.slice(0, 12)}-${safeName}`;
}

async function downloadFile(url, destination) {
  const tempPath = `${destination}.part-${process.pid}-${crypto.randomUUID()}`;
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "PuPu-MCP-Runtime-Builder",
      },
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(tempPath, { flags: "wx" })
    );
    await fsp.rename(tempPath, destination);
  } catch (error) {
    await fsp.rm(tempPath, { force: true });
    throw new Error(`Unable to download ${url}: ${error.message}`, {
      cause: error,
    });
  }
}

async function ensureCachedSource(
  runtimeName,
  source,
  cacheDir,
  downloader = downloadFile
) {
  const destination = path.join(cacheDir, cacheFilename(runtimeName, source));
  await fsp.mkdir(cacheDir, { recursive: true });

  try {
    if ((await sha256File(destination)) === source.sha256) {
      return destination;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fsp.rm(destination, { force: true });
  await downloader(source.url, destination);
  const actual = await sha256File(destination);
  if (actual !== source.sha256) {
    await fsp.rm(destination, { force: true });
    throw new Error(
      `Checksum mismatch for ${runtimeName}/${path.basename(destination)}: ` +
        `expected ${source.sha256}, got ${actual}`
    );
  }
  return destination;
}

async function extractArchive(archivePath, destination, archiveType) {
  await fsp.mkdir(destination, { recursive: true });
  if (archiveType === "tar.gz") {
    await tar.x({
      cwd: destination,
      file: archivePath,
      preservePaths: false,
      strict: true,
    });
    return;
  }
  if (archiveType === "zip") {
    await extractZip(archivePath, { dir: path.resolve(destination) });
    return;
  }
  throw new Error(`Unsupported archive type: ${archiveType}`);
}

async function extractWheel(wheelPath, destination) {
  await fsp.mkdir(destination, { recursive: true });
  await extractZip(wheelPath, { dir: path.resolve(destination) });
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function resolveStagedPath(root, manifestPath, label) {
  assertRelativeManifestPath(manifestPath, label);
  const resolved = path.resolve(root, ...manifestPath.split("/"));
  if (!isPathInside(path.resolve(root), resolved)) {
    throw new Error(`${label} escapes the staged runtime`);
  }
  return resolved;
}

async function walkTree(root, visit, relativeDir = "") {
  const currentDir = relativeDir
    ? path.join(root, ...relativeDir.split("/"))
    : root;
  const entries = await fsp.readdir(currentDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const entry of entries) {
    const relativePath = relativeDir
      ? `${relativeDir}/${entry.name}`
      : entry.name;
    const absolutePath = path.join(currentDir, entry.name);
    const stat = await fsp.lstat(absolutePath);
    await visit({ absolutePath, relativePath, stat });
    if (stat.isDirectory()) {
      await walkTree(root, visit, relativePath);
    }
  }
}

async function validateTreeLinks(root) {
  const resolvedRoot = path.resolve(root);
  await walkTree(root, async ({ absolutePath, relativePath, stat }) => {
    if (!stat.isSymbolicLink()) return;
    const linkTarget = await fsp.readlink(absolutePath);
    const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
    if (!isPathInside(resolvedRoot, resolvedTarget)) {
      throw new Error(
        `Staged runtime contains an unsafe symlink: ${relativePath} -> ${linkTarget}`
      );
    }
  });
}

async function sha256Tree(root) {
  const hash = crypto.createHash("sha256");
  await walkTree(root, async ({ absolutePath, relativePath, stat }) => {
    if (stat.isDirectory()) {
      hash.update(`D\0${relativePath}\0`);
      return;
    }
    if (stat.isSymbolicLink()) {
      hash.update(`L\0${relativePath}\0${await fsp.readlink(absolutePath)}\0`);
      return;
    }
    if (!stat.isFile()) {
      throw new Error(`Unsupported staged runtime entry: ${relativePath}`);
    }
    hash.update(`F\0${relativePath}\0${stat.size}\0`);
    for await (const chunk of fs.createReadStream(absolutePath)) {
      hash.update(chunk);
    }
    hash.update("\0");
  });
  return hash.digest("hex");
}

async function applyPostStageRules({
  runtimeRoot,
  runtimeName,
  runtime,
  target,
  targetPin,
}) {
  const postStage = targetPin.post_stage || runtime.post_stage;
  if (!postStage) return;

  for (const rule of postStage.copy_files || []) {
    const source = resolveStagedPath(
      runtimeRoot,
      rule.from,
      `${runtimeName}.post_stage.copy_files.from`
    );
    const destination = resolveStagedPath(
      runtimeRoot,
      rule.to,
      `${runtimeName}.post_stage.copy_files.to`
    );
    if (!(await fsp.stat(source).catch(() => null))?.isFile()) {
      throw new Error(
        `Staged ${runtimeName} metadata source is missing: ${rule.from}`
      );
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(source, destination);
  }

  for (const rule of postStage.copy_directories || []) {
    const source = resolveStagedPath(
      runtimeRoot,
      rule.from,
      `${runtimeName}.post_stage.copy_directories.from`
    );
    const destination = resolveStagedPath(
      runtimeRoot,
      rule.to,
      `${runtimeName}.post_stage.copy_directories.to`
    );
    if (!(await fsp.stat(source).catch(() => null))?.isDirectory()) {
      throw new Error(
        `Staged ${runtimeName} metadata directory is missing: ${rule.from}`
      );
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.cp(source, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }

  if (postStage.provenance_file) {
    const destination = resolveStagedPath(
      runtimeRoot,
      postStage.provenance_file,
      `${runtimeName}.post_stage.provenance_file`
    );
    const provenance = {
      schema_version: 1,
      provenance_kind: "pupu-generated-from-pinned-stripped-archive",
      runtime: runtimeName,
      version: runtime.version,
      target,
      source_url: targetPin.url,
      archive_sha256: targetPin.sha256,
      note:
        "The pinned install_only_stripped archive omits the full distribution " +
        "metadata. PuPu preserves the embedded CPython and pip licenses and " +
        "records immutable archive provenance here.",
    };
    await fsp.writeFile(
      destination,
      `${JSON.stringify(provenance, null, 2)}\n`,
      "utf8"
    );
  }
}

async function stagePythonBootstrap({
  stageRoot,
  cacheDir,
  runtimeName,
  runtime,
  downloader,
  wheelExtractor,
}) {
  const bootstrap = runtime.bootstrap;
  if (!bootstrap) return {};

  const bootstrapRoot = resolveStagedPath(
    stageRoot,
    bootstrap.directory,
    `${runtimeName}.bootstrap.directory`
  );
  await fsp.mkdir(bootstrapRoot, { recursive: true });
  for (const packagePin of bootstrap.packages) {
    const wheelPath = await ensureCachedSource(
      `${runtimeName}-bootstrap-${packagePin.name}`,
      packagePin,
      cacheDir,
      downloader
    );
    await wheelExtractor(wheelPath, bootstrapRoot, {
      runtimeName,
      packagePin,
    });
  }

  const sitecustomizePath = resolveStagedPath(
    bootstrapRoot,
    bootstrap.sitecustomize,
    `${runtimeName}.bootstrap.sitecustomize`
  );
  await fsp.writeFile(sitecustomizePath, PYTHON_SITECUSTOMIZE, "utf8");

  for (const requiredFile of bootstrap.required_files) {
    const requiredPath = resolveStagedPath(
      bootstrapRoot,
      requiredFile,
      `${runtimeName}.bootstrap.required_files`
    );
    if (!(await fsp.stat(requiredPath).catch(() => null))?.isFile()) {
      throw new Error(
        `Staged ${runtimeName} bootstrap is missing ${requiredFile}`
      );
    }
  }
  await validateTreeLinks(bootstrapRoot);
  return {
    bootstrap_dir: bootstrap.directory,
    bootstrap_tree_sha256: await sha256Tree(bootstrapRoot),
  };
}

async function assertRuntimeLayout(
  stageRoot,
  runtimeName,
  target,
  targetPin
) {
  const runtimeRoot = path.join(stageRoot, runtimeName);
  for (const requiredFile of targetPin.required_files) {
    const requiredPath = resolveStagedPath(
      runtimeRoot,
      requiredFile,
      `${runtimeName}.required_files`
    );
    const stat = await fsp.stat(requiredPath).catch(() => null);
    if (!stat?.isFile()) {
      throw new Error(
        `Staged ${runtimeName} runtime is missing ${requiredFile}`
      );
    }
  }
  for (const requiredDirectory of targetPin.required_directories || []) {
    const requiredPath = resolveStagedPath(
      runtimeRoot,
      requiredDirectory,
      `${runtimeName}.required_directories`
    );
    const stat = await fsp.stat(requiredPath).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(
        `Staged ${runtimeName} runtime is missing directory ${requiredDirectory}`
      );
    }
  }

  const commandPath = resolveStagedPath(
    stageRoot,
    targetPin.command,
    `${runtimeName}.command`
  );
  if (!(await fsp.stat(commandPath).catch(() => null))?.isFile()) {
    throw new Error(`Staged ${runtimeName} command is missing`);
  }

  const binDir = resolveStagedPath(
    stageRoot,
    targetPin.bin_dir,
    `${runtimeName}.bin_dir`
  );
  if (!(await fsp.stat(binDir).catch(() => null))?.isDirectory()) {
    throw new Error(`Staged ${runtimeName} bin_dir is missing`);
  }

  for (const arg of targetPin.args_prefix) {
    if (!arg.includes("/")) continue;
    const argPath = resolveStagedPath(
      stageRoot,
      arg,
      `${runtimeName}.args_prefix`
    );
    if (!(await fsp.stat(argPath).catch(() => null))?.isFile()) {
      throw new Error(`Staged ${runtimeName} argument path is missing: ${arg}`);
    }
  }

  if (!target.startsWith("win32-")) {
    for (const executable of targetPin.executable_files) {
      const executablePath = resolveStagedPath(
        runtimeRoot,
        executable,
        `${runtimeName}.executable_files`
      );
      const stat = await fsp.stat(executablePath);
      if ((stat.mode & 0o111) === 0) {
        throw new Error(
          `Staged ${runtimeName} executable bit is missing: ${executable}`
        );
      }
    }
  }
}

async function stageRuntime({
  stageRoot,
  cacheDir,
  runtimeName,
  runtime,
  target,
  downloader,
  extractor,
  wheelExtractor,
}) {
  const targetPin = runtime.targets[target];
  const archivePath = await ensureCachedSource(
    runtimeName,
    targetPin,
    cacheDir,
    downloader
  );
  const extractionRoot = path.join(stageRoot, `.extract-${runtimeName}`);
  await extractor(
    archivePath,
    extractionRoot,
    targetPin.archive_type,
    { runtimeName, target, pin: targetPin }
  );

  const extractedRuntimeRoot = resolveStagedPath(
    extractionRoot,
    targetPin.archive_root,
    `${runtimeName}.archive_root`
  );
  if (!(await fsp.stat(extractedRuntimeRoot).catch(() => null))?.isDirectory()) {
    throw new Error(
      `${targetPin.archive} did not contain ${targetPin.archive_root}`
    );
  }

  const runtimeRoot = path.join(stageRoot, runtimeName);
  await fsp.rename(extractedRuntimeRoot, runtimeRoot);
  await fsp.rm(extractionRoot, { recursive: true, force: true });

  for (const extraFile of runtime.additional_files || []) {
    const sourcePath = await ensureCachedSource(
      runtimeName,
      extraFile,
      cacheDir,
      downloader
    );
    const destination = resolveStagedPath(
      runtimeRoot,
      extraFile.output,
      `${runtimeName}.additional_files.output`
    );
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(sourcePath, destination);
  }

  await applyPostStageRules({
    runtimeRoot,
    runtimeName,
    runtime,
    target,
    targetPin,
  });

  if (!target.startsWith("win32-")) {
    for (const executable of targetPin.executable_files) {
      const executablePath = resolveStagedPath(
        runtimeRoot,
        executable,
        `${runtimeName}.executable_files`
      );
      const stat = await fsp.stat(executablePath);
      await fsp.chmod(executablePath, stat.mode | 0o111);
    }
  }

  await validateTreeLinks(runtimeRoot);
  await assertRuntimeLayout(stageRoot, runtimeName, target, targetPin);
  const bootstrapRecord = await stagePythonBootstrap({
    stageRoot,
    cacheDir,
    runtimeName,
    runtime,
    downloader,
    wheelExtractor,
  });
  return {
    version: runtime.version,
    command: targetPin.command,
    args_prefix: targetPin.args_prefix,
    bin_dir: targetPin.bin_dir,
    source_url: targetPin.url,
    archive_sha256: targetPin.sha256,
    staged_tree_sha256: await sha256Tree(runtimeRoot),
    ...bootstrapRecord,
  };
}

function assertSafeOutputDir(outputDir) {
  const resolved = path.resolve(outputDir);
  if (path.basename(resolved) !== "mcp_runtime") {
    throw new Error("MCP runtime output basename must be mcp_runtime");
  }
  if (
    resolved === path.parse(resolved).root ||
    resolved === path.resolve(process.cwd()) ||
    resolved === path.resolve(os.homedir())
  ) {
    throw new Error(`Refusing unsafe MCP runtime output path: ${resolved}`);
  }
  return resolved;
}

async function replaceDirectoryAtomically(tempDir, outputDir) {
  const backupDir = path.join(
    path.dirname(outputDir),
    `.mcp_runtime.previous-${process.pid}-${crypto.randomUUID()}`
  );
  let hadPrevious = false;
  try {
    await fsp.rename(outputDir, backupDir);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    await fsp.rename(tempDir, outputDir);
  } catch (error) {
    if (hadPrevious) {
      await fsp.rename(backupDir, outputDir);
    }
    throw error;
  }
  if (hadPrevious) {
    await fsp.rm(backupDir, { recursive: true, force: true });
  }
}

async function prepareMcpRuntime({
  target = detectHostTarget(),
  pinsPath = DEFAULT_PINS_PATH,
  outputDir = DEFAULT_OUTPUT_DIR,
  cacheDir = DEFAULT_CACHE_DIR,
  downloader = downloadFile,
  extractor = extractArchive,
  wheelExtractor = extractWheel,
} = {}) {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new Error(`Unsupported MCP runtime target: ${target}`);
  }
  const safeOutputDir = assertSafeOutputDir(outputDir);
  const { pins, sha256: pinsSha256 } = await readPinsManifest(pinsPath);
  const tempDir = path.join(
    path.dirname(safeOutputDir),
    `.mcp_runtime.tmp-${process.pid}-${crypto.randomUUID()}`
  );
  await fsp.mkdir(path.dirname(safeOutputDir), { recursive: true });
  await fsp.mkdir(tempDir);

  try {
    const runtimeResults = await Promise.allSettled(
      REQUIRED_RUNTIMES.map(async (runtimeName) => [
        runtimeName,
        await stageRuntime({
          stageRoot: tempDir,
          cacheDir,
          runtimeName,
          runtime: pins.runtimes[runtimeName],
          target,
          downloader,
          extractor,
          wheelExtractor,
        }),
      ])
    );
    const failedRuntime = runtimeResults.find(
      (result) => result.status === "rejected"
    );
    if (failedRuntime) {
      throw failedRuntime.reason;
    }
    const runtimeEntries = runtimeResults.map((result) => result.value);
    const stagedManifest = {
      schema_version: 1,
      target,
      pins_sha256: pinsSha256,
      runtimes: Object.fromEntries(runtimeEntries),
    };
    await fsp.writeFile(
      path.join(tempDir, "manifest.json"),
      `${JSON.stringify(stagedManifest, null, 2)}\n`,
      "utf8"
    );
    await replaceDirectoryAtomically(tempDir, safeOutputDir);
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  return verifyMcpRuntime({
    target,
    pinsPath,
    outputDir: safeOutputDir,
  });
}

async function verifyMcpRuntime({
  target = detectHostTarget(),
  pinsPath = DEFAULT_PINS_PATH,
  outputDir = DEFAULT_OUTPUT_DIR,
  verifyTreeChecksum = true,
} = {}) {
  const safeOutputDir = assertSafeOutputDir(outputDir);
  const { pins, sha256: pinsSha256 } = await readPinsManifest(pinsPath);
  const stagedManifest = JSON.parse(
    await fsp.readFile(path.join(safeOutputDir, "manifest.json"), "utf8")
  );
  if (
    stagedManifest.schema_version !== 1 ||
    stagedManifest.target !== target ||
    stagedManifest.pins_sha256 !== pinsSha256
  ) {
    throw new Error(
      `Staged MCP runtime manifest does not match pins for ${target}`
    );
  }

  for (const runtimeName of REQUIRED_RUNTIMES) {
    const runtime = pins.runtimes[runtimeName];
    const targetPin = runtime.targets[target];
    const staged = stagedManifest.runtimes?.[runtimeName];
    const expectedRecord = {
      version: runtime.version,
      command: targetPin.command,
      args_prefix: targetPin.args_prefix,
      bin_dir: targetPin.bin_dir,
      source_url: targetPin.url,
      archive_sha256: targetPin.sha256,
    };
    if (runtime.bootstrap) {
      expectedRecord.bootstrap_dir = runtime.bootstrap.directory;
    }
    if (!isPlainObject(staged)) {
      throw new Error(`Staged MCP runtime is missing ${runtimeName}`);
    }
    for (const [key, value] of Object.entries(expectedRecord)) {
      if (JSON.stringify(staged[key]) !== JSON.stringify(value)) {
        throw new Error(
          `Staged ${runtimeName}.${key} does not match the pinned runtime`
        );
      }
    }
    await validateTreeLinks(path.join(safeOutputDir, runtimeName));
    await assertRuntimeLayout(
      safeOutputDir,
      runtimeName,
      target,
      targetPin
    );
    if (!SHA256_RE.test(staged.staged_tree_sha256 || "")) {
      throw new Error(
        `Staged ${runtimeName}.staged_tree_sha256 is invalid`
      );
    }
    if (verifyTreeChecksum) {
      const treeSha256 = await sha256Tree(
        path.join(safeOutputDir, runtimeName)
      );
      if (treeSha256 !== staged.staged_tree_sha256) {
        throw new Error(
          `Staged ${runtimeName} tree checksum mismatch: ` +
            `expected ${staged.staged_tree_sha256}, got ${treeSha256}`
        );
      }
    }
    if (runtime.bootstrap) {
      const bootstrapRoot = resolveStagedPath(
        safeOutputDir,
        runtime.bootstrap.directory,
        `${runtimeName}.bootstrap.directory`
      );
      for (const requiredFile of runtime.bootstrap.required_files) {
        const requiredPath = resolveStagedPath(
          bootstrapRoot,
          requiredFile,
          `${runtimeName}.bootstrap.required_files`
        );
        if (!(await fsp.stat(requiredPath).catch(() => null))?.isFile()) {
          throw new Error(
            `Staged ${runtimeName} bootstrap is missing ${requiredFile}`
          );
        }
      }
      await validateTreeLinks(bootstrapRoot);
      const bootstrapTreeSha256 = await sha256Tree(bootstrapRoot);
      if (bootstrapTreeSha256 !== staged.bootstrap_tree_sha256) {
        throw new Error(
          `Staged ${runtimeName} bootstrap tree checksum mismatch: ` +
            `expected ${staged.bootstrap_tree_sha256}, got ${bootstrapTreeSha256}`
        );
      }
    }
  }
  return stagedManifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const target = options.target || detectHostTarget();
  const action = options.verifyOnly ? verifyMcpRuntime : prepareMcpRuntime;
  const manifest = await action({
    target,
    pinsPath: options.pinsPath,
    outputDir: options.outputDir,
    cacheDir: options.cacheDir,
  });
  process.stdout.write(
    `MCP runtime ${options.verifyOnly ? "verified" : "staged"}: ` +
      `${target} (${Object.entries(manifest.runtimes)
        .map(([name, runtime]) => `${name} ${runtime.version}`)
        .join(", ")})\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`MCP runtime preparation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_CACHE_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PINS_PATH,
  PYTHON_SITECUSTOMIZE,
  REQUIRED_RUNTIMES,
  SUPPORTED_TARGETS,
  detectHostTarget,
  downloadFile,
  ensureCachedSource,
  extractArchive,
  extractWheel,
  parseArgs,
  prepareMcpRuntime,
  readPinsManifest,
  sha256File,
  sha256Tree,
  usage,
  validatePinsManifest,
  verifyMcpRuntime,
};
