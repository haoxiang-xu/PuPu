const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Arch } = require("electron-builder");
const {
  DEFAULT_PINS_PATH,
  makeTreeDirectoriesWritable,
  makeTreeOwnerWritable,
  prepareMcpRuntime,
  verifyMcpRuntime,
} = require("./prepare-mcp-runtime.cjs");

const execFileAsync = promisify(execFile);
const NATIVE_SMOKE_TIMEOUT_MS = 15_000;

function targetFromAfterPackContext(context) {
  const platform =
    context?.electronPlatformName || context?.packager?.platform?.nodeName;
  const arch =
    typeof context?.arch === "number" ? Arch[context.arch] : context?.arch;
  const target = `${platform}-${arch}`;
  if (
    !["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"].includes(target)
  ) {
    throw new Error(
      `Unsupported packaged MCP runtime target: ${platform}/${arch}`,
    );
  }
  return target;
}

function currentHostTarget() {
  return `${process.platform}-${process.arch}`;
}

function resolveRuntimePath(runtimeDir, rawPath, label) {
  const text = String(rawPath || "").trim();
  if (!text || path.isAbsolute(text)) {
    throw new Error(`Packaged MCP runtime has invalid ${label}`);
  }
  const resolvedRoot = path.resolve(runtimeDir);
  const resolved = path.resolve(runtimeDir, text);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Packaged MCP runtime ${label} escapes its resource directory`,
    );
  }
  return resolved;
}

async function runRuntimeCommand(
  executeFile,
  label,
  command,
  args,
  { env = process.env, expectedOutput } = {},
) {
  let result;
  try {
    result = await executeFile(command, args, {
      env,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: NATIVE_SMOKE_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch (error) {
    const stderr = String(error?.stderr || "")
      .trim()
      .slice(0, 500);
    throw new Error(
      `Packaged MCP runtime ${label} failed to execute` +
        (stderr ? `: ${stderr}` : ""),
    );
  }
  const output = `${String(result?.stdout || "")}\n${String(
    result?.stderr || "",
  )}`.trim();
  if (expectedOutput && !expectedOutput.test(output)) {
    throw new Error(
      `Packaged MCP runtime ${label} returned an unexpected version: ` +
        `${output.slice(0, 500) || "(no output)"}`,
    );
  }
}

async function smokePackagedMcpRuntime(
  runtimeDir,
  manifest,
  { executeFile = execFileAsync } = {},
) {
  const runtimes = manifest?.runtimes || {};
  const node = runtimes.node || {};
  const uv = runtimes.uv || {};
  const python = runtimes.python || {};
  const nodeCommand = resolveRuntimePath(
    runtimeDir,
    node.command,
    "node command",
  );
  const npxArgs = (node.args_prefix || []).map((arg, index) =>
    String(arg).startsWith("-")
      ? String(arg)
      : resolveRuntimePath(runtimeDir, arg, `node args_prefix[${index}]`),
  );
  const uvCommand = resolveRuntimePath(runtimeDir, uv.command, "uv command");
  const pythonCommand = resolveRuntimePath(
    runtimeDir,
    python.command,
    "python command",
  );
  const pythonBootstrap = resolveRuntimePath(
    runtimeDir,
    python.bootstrap_dir,
    "python bootstrap directory",
  );
  const smokeRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "pupu-mcp-runtime-smoke-"),
  );

  try {
    const nodeEnv = {
      ...process.env,
      NODE_USE_SYSTEM_CA: "1",
      NODE_USE_ENV_PROXY: "1",
      NPM_CONFIG_CACHE: path.join(smokeRoot, "npm"),
      npm_config_cache: path.join(smokeRoot, "npm"),
    };
    const pythonEnv = {
      ...process.env,
      PYTHONPATH: pythonBootstrap,
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONNOUSERSITE: "1",
      PYTHONUTF8: "1",
    };
    delete pythonEnv.PYTHONHOME;
    delete pythonEnv.SSL_CERT_FILE;
    delete pythonEnv.SSL_CERT_DIR;

    await runRuntimeCommand(executeFile, "Node", nodeCommand, ["--version"], {
      env: nodeEnv,
      expectedOutput: new RegExp(
        `^${String(node.version || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "m",
      ),
    });
    await runRuntimeCommand(
      executeFile,
      "npx",
      nodeCommand,
      [...npxArgs, "--version"],
      {
        env: nodeEnv,
        expectedOutput: /^\d+\.\d+\.\d+(?:[-+].*)?$/m,
      },
    );
    await runRuntimeCommand(executeFile, "uvx", uvCommand, ["--version"], {
      expectedOutput: new RegExp(
        `\\b${String(uv.version || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ),
    });
    await runRuntimeCommand(
      executeFile,
      "Python",
      pythonCommand,
      ["--version"],
      {
        env: pythonEnv,
        expectedOutput: new RegExp(
          `\\b${String(python.version || "")
            .split("+", 1)[0]
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        ),
      },
    );
    await runRuntimeCommand(
      executeFile,
      "Python truststore bootstrap",
      pythonCommand,
      [
        "-c",
        [
          "import ssl",
          'assert ssl.SSLContext.__module__ == "truststore._api", ssl.SSLContext.__module__',
          'print("truststore._api")',
        ].join("; "),
      ],
      {
        env: pythonEnv,
        expectedOutput: /^truststore\._api$/m,
      },
    );
  } finally {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  }
}

async function verifyPackagedMcpRuntime(
  context,
  {
    pinsPath = DEFAULT_PINS_PATH,
    executeFile = execFileAsync,
    stageMcpRuntime = prepareMcpRuntime,
    requireNativeSmoke = process.env.PUPU_REQUIRE_NATIVE_MCP_SMOKE === "1",
  } = {},
) {
  if (typeof context?.packager?.getResourcesDir !== "function") {
    throw new Error("afterPack context is missing packager.getResourcesDir");
  }
  const target = targetFromAfterPackContext(context);
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
  const runtimeDir = path.join(resourcesDir, "mcp_runtime");
  const manifest = await stageMcpRuntime({
    target,
    pinsPath,
    outputDir: runtimeDir,
  });
  const hostTarget = currentHostTarget();
  if (hostTarget === target) {
    await smokePackagedMcpRuntime(runtimeDir, manifest, { executeFile });
    // The smoke must not write bytecode or any other cache into the app bundle.
    await verifyMcpRuntime({
      target,
      pinsPath,
      outputDir: runtimeDir,
    });
  } else if (requireNativeSmoke) {
    throw new Error(
      `Native MCP runtime smoke is required, but build host ${hostTarget} ` +
        `cannot execute target ${target}`,
    );
  } else {
    process.stderr.write(
      `Packaged MCP runtime native smoke skipped: host ${hostTarget}, ` +
        `target ${target}\n`,
    );
  }
  if (target.startsWith("darwin-")) {
    // electron-osx-sign may classify non-ASCII runtime data as binary. codesign
    // needs owner write access for every classified file, while the verified
    // source runtime remains sealed outside the packaged app.
    await makeTreeOwnerWritable(runtimeDir);
  } else {
    // FPM recreates source directory modes before writing its staged copy.
    await makeTreeDirectoriesWritable(runtimeDir);
  }
  process.stdout.write(
    `Packaged MCP runtime staged and verified: ${target} (${Object.entries(
      manifest.runtimes,
    )
      .map(([name, runtime]) => `${name} ${runtime.version}`)
      .join(", ")})\n`,
  );
}

module.exports = verifyPackagedMcpRuntime;
module.exports.currentHostTarget = currentHostTarget;
module.exports.resolveRuntimePath = resolveRuntimePath;
module.exports.runRuntimeCommand = runRuntimeCommand;
module.exports.smokePackagedMcpRuntime = smokePackagedMcpRuntime;
module.exports.targetFromAfterPackContext = targetFromAfterPackContext;
module.exports.verifyPackagedMcpRuntime = verifyPackagedMcpRuntime;
