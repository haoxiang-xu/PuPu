// Vault sink worker entrypoint resolver (owned by the unchain service).
//
// These assertions are the security contract, not style checks:
//   * packaged launches ONLY the absolute onefile unchain-server binary,
//   * dev launches ONLY an absolute, validated Python + absolute main.py,
//   * both carry --vault-sink-worker, an absolute cwd, and an absolute dataDir,
//   * the resolver takes no arguments and never searches PATH,
//   * it resolves once per app run and the result is frozen.

const path = require("path");
const {
  createUnchainService,
} = require("../../main/services/unchain/service");

const createAvailableNet = () => ({
  createServer() {
    const listeners = new Map();
    return {
      unref() {},
      once(event, callback) {
        listeners.set(event, callback);
      },
      listen() {
        const onListening = listeners.get("listening");
        if (typeof onListening === "function") onListening();
      },
      close(callback) {
        if (typeof callback === "function") callback();
      },
    };
  },
});

const APP_PATH = "/app";
const USER_DATA = "/tmp/pupu-userdata";
const RESOURCES = "/tmp/pupu-resources";
const WORKER_FLAG = "--vault-sink-worker";

const packagedBinaryPath = () => {
  if (process.platform === "darwin") {
    return path.join(
      RESOURCES,
      "unchain_runtime",
      "dist",
      "macos",
      "unchain-server",
    );
  }
  if (process.platform === "win32") {
    return path.join(
      RESOURCES,
      "unchain_runtime",
      "dist",
      "windows",
      "unchain-server.exe",
    );
  }
  return path.join(
    RESOURCES,
    "unchain_runtime",
    "dist",
    "linux",
    "unchain-server",
  );
};

const devPythonPath = () =>
  process.platform === "win32"
    ? path.join(APP_PATH, ".venv", "Scripts", "python.exe")
    : path.join(APP_PATH, ".venv", "bin", "python");

const devScriptPath = () =>
  path.join(APP_PATH, "unchain_runtime", "server", "main.py");

const okProbe = () => ({
  status: 0,
  stdout: JSON.stringify({
    version: "3.12.2",
    major: 3,
    minor: 12,
    missing: [],
  }),
});

const makeService = ({
  isPackaged = false,
  existsSync = () => true,
  spawnSync,
} = {}) =>
  createUnchainService({
    app: {
      isPackaged,
      getAppPath: jest.fn(() => APP_PATH),
      getPath: jest.fn((key) =>
        key === "userData" ? USER_DATA : "/tmp/other",
      ),
      getVersion: jest.fn(() => "0.1.1"),
    },
    fs: { existsSync: jest.fn(existsSync) },
    path,
    spawn: jest.fn(),
    spawnSync: spawnSync || jest.fn(okProbe),
    crypto: { randomBytes: jest.fn(() => ({ toString: () => "token" })) },
    net: createAvailableNet(),
    webContents: {
      fromId: jest.fn(() => null),
      getAllWebContents: jest.fn(() => []),
    },
    runtimeService: {},
    getAppIsQuitting: () => false,
  });

describe("vault sink worker entrypoint resolver", () => {
  let originalResourcesPath;
  let originalPythonBin;
  let originalMcpRuntimeDir;

  beforeEach(() => {
    originalResourcesPath = process.resourcesPath;
    originalPythonBin = process.env.UNCHAIN_PYTHON_BIN;
    originalMcpRuntimeDir = process.env.PUPU_MCP_RUNTIME_DIR;
    process.resourcesPath = RESOURCES;
    delete process.env.UNCHAIN_PYTHON_BIN;
    delete process.env.PUPU_MCP_RUNTIME_DIR;
  });

  afterEach(() => {
    process.resourcesPath = originalResourcesPath;
    if (originalPythonBin === undefined) {
      delete process.env.UNCHAIN_PYTHON_BIN;
    } else {
      process.env.UNCHAIN_PYTHON_BIN = originalPythonBin;
    }
    if (originalMcpRuntimeDir === undefined) {
      delete process.env.PUPU_MCP_RUNTIME_DIR;
    } else {
      process.env.PUPU_MCP_RUNTIME_DIR = originalMcpRuntimeDir;
    }
  });

  test("packaged resolves ONLY the absolute onefile binary with the worker flag", () => {
    const entrypoint = makeService({
      isPackaged: true,
    }).resolveVaultSinkWorkerEntrypoint();

    expect(entrypoint.command).toBe(packagedBinaryPath());
    expect(path.isAbsolute(entrypoint.command)).toBe(true);
    expect([...entrypoint.args]).toEqual([WORKER_FLAG]);
    expect(entrypoint.cwd).toBe(path.dirname(packagedBinaryPath()));
    expect(path.isAbsolute(entrypoint.cwd)).toBe(true);
    expect(entrypoint.dataDir).toBe(USER_DATA);
    expect(path.isAbsolute(entrypoint.dataDir)).toBe(true);
    expect(entrypoint.mcpRuntimeDir).toBe(path.join(RESOURCES, "mcp_runtime"));
    expect(path.isAbsolute(entrypoint.mcpRuntimeDir)).toBe(true);
    expect(Object.isFrozen(entrypoint)).toBe(true);
    // No interpreter and no script anywhere in a packaged worker launch.
    expect(entrypoint.command).not.toMatch(/python/i);
    expect(entrypoint.args.join(" ")).not.toMatch(/\.py\b/);
  });

  test("packaged never falls back to a Python interpreter when the binary is missing", () => {
    const spawnSync = jest.fn(okProbe);
    const service = makeService({
      isPackaged: true,
      existsSync: () => false,
      spawnSync,
    });

    expect(() => service.resolveVaultSinkWorkerEntrypoint()).toThrow(
      expect.objectContaining({ code: "vault_worker_unavailable" }),
    );
    // Fail closed: it did not even probe for an interpreter.
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test("dev resolves an absolute python command plus absolute main.py and the worker flag", () => {
    const entrypoint = makeService().resolveVaultSinkWorkerEntrypoint();

    expect(entrypoint.command).toBe(devPythonPath());
    expect(path.isAbsolute(entrypoint.command)).toBe(true);
    expect([...entrypoint.args]).toEqual([devScriptPath(), WORKER_FLAG]);
    expect(path.isAbsolute(entrypoint.args[0])).toBe(true);
    expect(entrypoint.cwd).toBe(path.dirname(devScriptPath()));
    expect(path.isAbsolute(entrypoint.cwd)).toBe(true);
    expect(entrypoint.dataDir).toBe(USER_DATA);
    expect(entrypoint.mcpRuntimeDir).toBeNull();
    expect(Object.isFrozen(entrypoint)).toBe(true);
  });

  test("dev refuses when main.py is missing", () => {
    const service = makeService({
      existsSync: (candidate) => !String(candidate).endsWith("main.py"),
    });
    expect(() => service.resolveVaultSinkWorkerEntrypoint()).toThrow(
      expect.objectContaining({ code: "vault_worker_unavailable" }),
    );
  });

  test("dev forwards PUPU_MCP_RUNTIME_DIR only when it is absolute", () => {
    process.env.PUPU_MCP_RUNTIME_DIR = "relative/runtime";
    expect(
      makeService().resolveVaultSinkWorkerEntrypoint().mcpRuntimeDir,
    ).toBeNull();

    process.env.PUPU_MCP_RUNTIME_DIR = "/tmp/pupu-mcp-runtime";
    expect(
      makeService().resolveVaultSinkWorkerEntrypoint().mcpRuntimeDir,
    ).toBe("/tmp/pupu-mcp-runtime");
  });

  test("dev refuses a relative or missing interpreter instead of searching PATH", () => {
    process.env.UNCHAIN_PYTHON_BIN = "python3";
    expect(() => makeService().resolveVaultSinkWorkerEntrypoint()).toThrow(
      expect.objectContaining({ code: "vault_worker_unavailable" }),
    );

    process.env.UNCHAIN_PYTHON_BIN = "/nowhere/python3";
    const missing = makeService({
      existsSync: (candidate) => !String(candidate).startsWith("/nowhere"),
    });
    expect(() => missing.resolveVaultSinkWorkerEntrypoint()).toThrow(
      expect.objectContaining({ code: "vault_worker_unavailable" }),
    );
  });

  test("dev collapses the interpreter probe failure to the static code (no path leak)", () => {
    const service = makeService({
      spawnSync: jest.fn(() => ({
        status: 0,
        stdout: JSON.stringify({
          version: "3.11.9",
          major: 3,
          minor: 11,
          missing: [],
        }),
      })),
    });

    let caught = null;
    try {
      service.resolveVaultSinkWorkerEntrypoint();
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).toBe("vault_worker_unavailable");
    expect(caught.message).toBe(
      "[vault_worker_unavailable] vault sink worker entrypoint is unavailable",
    );
    expect(caught.message).not.toMatch(/3\.11|\.venv|\/app/);
  });

  test("resolves exactly once per service and returns the same frozen value", () => {
    const spawnSync = jest.fn(okProbe);
    const service = makeService({ spawnSync });

    const first = service.resolveVaultSinkWorkerEntrypoint();
    const probeCalls = spawnSync.mock.calls.length;
    const second = service.resolveVaultSinkWorkerEntrypoint();

    expect(probeCalls).toBeGreaterThan(0);
    expect(second).toBe(first);
    // Memoized: the Python probe (a spawnSync) never runs a second time.
    expect(spawnSync).toHaveBeenCalledTimes(probeCalls);
  });

  test("takes no arguments — nothing renderer-supplied can steer it", () => {
    const service = makeService();
    expect(service.resolveVaultSinkWorkerEntrypoint.length).toBe(0);

    const hostile = service.resolveVaultSinkWorkerEntrypoint({
      command: "/bin/sh",
      args: ["-c", "echo pwned"],
      cwd: "/",
      dataDir: "/",
    });
    expect(hostile.command).toBe(devPythonPath());
    expect([...hostile.args]).toEqual([devScriptPath(), WORKER_FLAG]);
    expect(hostile.dataDir).toBe(USER_DATA);
  });

  test("the resolved entrypoint is accepted verbatim by the sink executor", () => {
    const {
      createVaultSinkExecutors,
    } = require("../../main/services/memory_vault/vault_sink_executor");
    process.env.PUPU_MCP_RUNTIME_DIR = "/tmp/pupu-mcp-runtime";
    const entrypoint = makeService({
      isPackaged: true,
    }).resolveVaultSinkWorkerEntrypoint();

    // normalizeEntrypoint() throws vault_worker_unavailable on any non-absolute
    // or NUL-bearing field, so constructing here proves shape compatibility.
    const registry = createVaultSinkExecutors({
      command: entrypoint.command,
      args: entrypoint.args,
      cwd: entrypoint.cwd,
      dataDir: entrypoint.dataDir,
      mcpRuntimeDir: entrypoint.mcpRuntimeDir,
      environmentSource: {},
    });
    expect(typeof registry.close).toBe("function");
    expect(registry.activeChildCount()).toBe(0);
    registry.close();
  });
});
