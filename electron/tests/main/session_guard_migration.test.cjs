const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createSessionGuardMigrationController,
  validateSessionGuardMigrationReceipt,
} = require("../../main/services/unchain/session_guard_migration");

const exactReceipt = (status = "ready") => ({
  schema: "pupu.session-guard-migration",
  version: 1,
  status,
  protocol_version: 1,
});

const exactIntentText = JSON.stringify({
  schema: "pupu.session-guard-migration-intent",
  version: 1,
  state: "pending",
  protocol_version: 1,
});

describe("session guard migration boundary", () => {
  const tempDirectories = [];

  const createController = (overrides = {}) => {
    const userData =
      overrides.userData ||
      fs.mkdtempSync(path.join(os.tmpdir(), "pupu-guard-unit-"));
    if (!overrides.userData) {
      tempDirectories.push(userData);
    }
    return {
      controller: createSessionGuardMigrationController({
        app: { getPath: jest.fn(() => userData) },
        fs,
        path,
        spawnSync: jest.fn(() => ({ status: 0, stdout: "" })),
        ...overrides,
      }),
      userData,
    };
  };

  afterEach(() => {
    while (tempDirectories.length > 0) {
      fs.rmSync(tempDirectories.pop(), { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  test("accepts only the exact four-field ready receipt", () => {
    expect(validateSessionGuardMigrationReceipt(exactReceipt())).toEqual(
      exactReceipt(),
    );

    for (const invalid of [
      null,
      { ...exactReceipt(), extra: true },
      { ...exactReceipt(), schema: "private" },
      { ...exactReceipt(), version: 2 },
      { ...exactReceipt(), status: "READY" },
      { ...exactReceipt(), protocol_version: 2 },
    ]) {
      expect(() => validateSessionGuardMigrationReceipt(invalid)).toThrow(
        expect.objectContaining({
          code: "miso_session_guard_migration_receipt_invalid",
        }),
      );
    }
  });

  test.each([
    ["migration_required", "miso_session_guard_migration_required"],
    ["unavailable", "miso_session_guard_migration_unavailable"],
  ])("projects exact non-ready status %s without details", (status, code) => {
    expect(() => validateSessionGuardMigrationReceipt(exactReceipt(status))).toThrow(
      expect.objectContaining({ code, status, retryable: false }),
    );
  });

  test("persists one exact main-only intent and consumes it only explicitly", () => {
    const { controller, userData } = createController();
    const intentPath = path.join(
      userData,
      ".pupu-main",
      "session_guard_migration_intent.json",
    );

    expect(controller.readPendingIntent()).toBe(false);
    controller.persistPendingIntent();
    expect(controller.readPendingIntent()).toBe(true);
    expect(fs.readFileSync(intentPath, "utf8")).toBe(exactIntentText);
    const intentMode = fs.statSync(intentPath).mode & 0o777;
    expect(process.platform === "win32" || intentMode === 0o600).toBe(true);

    controller.persistPendingIntent();
    expect(fs.readFileSync(intentPath, "utf8")).toBe(exactIntentText);
    controller.consumePendingIntent();
    expect(fs.existsSync(intentPath)).toBe(false);
  });

  test("malformed persistent state never authorizes a flagged start", () => {
    const { controller, userData } = createController();
    const intentPath = path.join(
      userData,
      ".pupu-main",
      "session_guard_migration_intent.json",
    );
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, '{"state":"pending","extra":"private"}');

    expect(() => controller.readPendingIntent()).toThrow(
      expect.objectContaining({
        code: "miso_session_guard_migration_intent_invalid",
      }),
    );
    expect(() => controller.persistPendingIntent()).toThrow(
      expect.objectContaining({
        code: "miso_session_guard_migration_intent_invalid",
      }),
    );
    expect(fs.existsSync(intentPath)).toBe(true);
  });

  test("strict orphan cleanup escalates TERM to KILL and proves absence", async () => {
    let clock = 0;
    let killed = false;
    const packagedBinary = "/Applications/PuPu.app/unchain-server";
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: killed
        ? ""
        : [
            `41001 1 ${packagedBinary}`,
            `41002 1 ${packagedBinary} --durable-job-worker --job-id keep`,
          ].join("\n"),
    }));
    const killProcess = jest.fn((pid, signal) => {
      expect(pid).toBe(41001);
      if (signal === "SIGKILL") {
        killed = true;
      }
      return true;
    });
    const { controller } = createController({
      spawnSync,
      killProcess,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      termTimeoutMs: 20,
      killTimeoutMs: 20,
      pollMs: 10,
    });

    await expect(
      controller.terminateStaleMisoProcessesAndWait({
        command: packagedBinary,
        args: [],
      }),
    ).resolves.toBe(true);
    expect(killProcess).toHaveBeenNthCalledWith(1, 41001, "SIGTERM");
    expect(killProcess).toHaveBeenNthCalledWith(2, 41001, "SIGKILL");
    expect(killProcess).not.toHaveBeenCalledWith(41002, expect.anything());
  });

  test("strict orphan cleanup times out without a flagged spawn authority", async () => {
    let clock = 0;
    const packagedBinary = "/Applications/PuPu.app/unchain-server";
    const killProcess = jest.fn(() => true);
    const { controller } = createController({
      spawnSync: jest.fn(() => ({
        status: 0,
        stdout: `41001 1 ${packagedBinary}`,
      })),
      killProcess,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      termTimeoutMs: 20,
      killTimeoutMs: 20,
      pollMs: 10,
    });

    await expect(
      controller.terminateStaleMisoProcessesAndWait({
        command: packagedBinary,
        args: [],
      }),
    ).resolves.toBe(false);
    expect(killProcess).toHaveBeenCalledWith(41001, "SIGTERM");
    expect(killProcess).toHaveBeenCalledWith(41001, "SIGKILL");
  });

  test("a failed process inventory is not mistaken for proven absence", async () => {
    const killProcess = jest.fn();
    const { controller } = createController({
      spawnSync: jest.fn(() => ({ status: 1, stdout: "", error: null })),
      killProcess,
    });

    await expect(
      controller.terminateStaleMisoProcessesAndWait({
        command: "/Applications/PuPu.app/unchain-server",
        args: [],
      }),
    ).resolves.toBe(false);
    expect(killProcess).not.toHaveBeenCalled();
  });

  test("Windows packaged inventory verifies an orphan without leaking command data", async () => {
    let running = true;
    const packagedBinary = "C:\\Program Files\\PuPu\\unchain-server.exe";
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify(
        running
          ? [
              {
                ProcessId: 41001,
                ParentProcessId: 99999,
                CommandLine: `"${packagedBinary}"`,
              },
            ]
          : [],
      ),
    }));
    const killProcess = jest.fn(() => {
      running = false;
      return true;
    });
    const { controller } = createController({
      platform: "win32",
      spawnSync,
      killProcess,
      sleep: async () => {},
    });

    await expect(
      controller.terminateStaleMisoProcessesAndWait({
        command: packagedBinary,
        args: [],
      }),
    ).resolves.toBe(true);
    expect(spawnSync.mock.calls[0][0]).toBe("powershell.exe");
    expect(killProcess).toHaveBeenCalledWith(41001, "SIGTERM");
  });
});
