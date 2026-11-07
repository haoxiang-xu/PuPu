const path = require("path");
const { EventEmitter } = require("events");
const { createUnchainService } = require("../../main/services/unchain/service");
const originalFetch = global.fetch;
const originalResources = process.resourcesPath;
const originalEnv = Object.fromEntries(["UNCHAIN_SOURCE_PATH", "UNCHAIN_PYTHON_BIN", "PUPU_MEMORY_V2_MODE"].map((key) => [key, process.env[key]]));
afterEach(() => {
  global.fetch = originalFetch;
  if (originalResources === undefined) delete process.resourcesPath;
  else process.resourcesPath = originalResources;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function startup({ configured, installed = false, source = false, packaged = false } = {}) {
  process.env.PUPU_MEMORY_V2_MODE = "off";
  process.env.UNCHAIN_PYTHON_BIN = "/qa/fixed-venv/bin/python";
  if (configured) process.env.UNCHAIN_SOURCE_PATH = configured;
  else delete process.env.UNCHAIN_SOURCE_PATH;
  process.resourcesPath = "/qa/resources";
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ status: "ok", contract: {
    schema: "pupu.runtime-capabilities", version: 1, capabilities: {
      runtime_events_v4: true, execution_fencing: true, durable_interactions: true,
      exact_cancellation: true, durable_jobs: { version: "D4.1", available: true, reason: "" },
      automatic_wake_resume: false,
    }, reasons: {},
  }, session_guard_migration: { schema: "pupu.session-guard-migration", version: 1, status: "ready", protocol_version: 1 } }) }));
  const spawn = jest.fn(() => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.pid = 4321; child.kill = jest.fn(); return child;
  });
  const service = createUnchainService({
    app: { isPackaged: packaged, getAppPath: () => "/qa-app", getPath: () => "/qa/data", getVersion: () => "0.1.12" },
    fs: { existsSync: jest.fn((candidate) => {
      if (configured && candidate.startsWith(configured)) {
        return (installed && candidate === path.join(configured, "unchain", "__init__.py")) ||
          (source && [path.join(configured, "pyproject.toml"), path.join(configured, "src", "unchain", "__init__.py")].includes(candidate));
      }
      return true; // a sibling src checkout exists in every dev case
    }) },
    path, spawn,
    spawnSync: jest.fn(() => ({ status: 0, stdout: JSON.stringify({ version: "3.12.10", major: 3, minor: 12, missing: [] }) })),
    crypto: { randomBytes: () => ({ toString: () => "qa-no-real-auth-token" }) },
    net: { createServer: () => {
      const listeners = new Map(); return { unref() {}, once: (event, fn) => listeners.set(event, fn),
        listen: () => listeners.get("listening")?.(), close: (fn) => fn?.() };
    } },
    webContents: { fromId: () => null, getAllWebContents: () => [] }, runtimeService: {}, getAppIsQuitting: () => false,
  });
  try { await service.startMiso(); expect(spawn).toHaveBeenCalledTimes(1); return spawn.mock.calls[0]; }
  finally { service.stopMiso(); }
}

test("an explicit installed package root wins over the sibling checkout", async () => {
  const root = "/qa/fixed-venv/lib/python3.12/site-packages";
  const [command, args, options] = await startup({ configured: root, installed: true });
  expect(command).toBe("/qa/fixed-venv/bin/python");
  expect(args).toEqual(["/qa-app/unchain_runtime/server/main.py"]);
  expect(options.env.UNCHAIN_SOURCE_PATH).toBe(root);
});

test("an explicit src-layout checkout retains priority", async () => {
  const root = "/qa/authored-source";
  const [, , options] = await startup({ configured: root, source: true });
  expect(options.env.UNCHAIN_SOURCE_PATH).toBe(root);
});

test("without an explicit path the existing sibling source default remains", async () => {
  const [, , options] = await startup();
  expect(options.env.UNCHAIN_SOURCE_PATH).toBe("/unchain");
});

test("packaged startup still chooses its bundled binary", async () => {
  const root = "/qa/fixed-venv/lib/python3.12/site-packages";
  const [command, args] = await startup({ configured: root, installed: true, packaged: true });
  expect(command).toBe(path.join("/qa/resources/unchain_runtime/dist", process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux", process.platform === "win32" ? "unchain-server.exe" : "unchain-server"));
  expect(args).toEqual([]);
});
