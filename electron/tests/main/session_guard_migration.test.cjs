const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
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

  test("rejects a symlink even when O_NOFOLLOW is unavailable", () => {
    const { controller, userData } = createController({
      platform: "win32",
      fs: {
        ...fs,
        constants: { ...fs.constants, O_NOFOLLOW: undefined },
      },
    });
    const intentPath = path.join(
      userData,
      ".pupu-main",
      "session_guard_migration_intent.json",
    );
    const targetPath = path.join(userData, "linked-intent.json");
    fs.mkdirSync(path.dirname(intentPath));
    fs.writeFileSync(targetPath, exactIntentText);
    fs.symlinkSync(targetPath, intentPath, "file");

    expect(() => controller.readPendingIntent()).toThrow(
      expect.objectContaining({
        code: "miso_session_guard_migration_intent_invalid",
      }),
    );
  });

  test("preserves the intent lifecycle without POSIX-only open flags", () => {
    const overrides = {
      platform: "win32",
      fs: {
        ...fs,
        constants: {
          ...fs.constants,
          O_NOFOLLOW: undefined,
          O_NONBLOCK: undefined,
        },
      },
    };
    const { controller, userData } = createController(overrides);

    expect(controller.readPendingIntent()).toBe(false);
    controller.persistPendingIntent();
    controller.persistPendingIntent();
    expect(controller.readPendingIntent()).toBe(true);
    const restarted = createController({ ...overrides, userData }).controller;
    expect(restarted.readPendingIntent()).toBe(true);
    restarted.consumePendingIntent();
    restarted.consumePendingIntent();
    expect(controller.readPendingIntent()).toBe(false);
  });

  test.each([
    { ...JSON.parse(exactIntentText), version: 2 },
    { ...JSON.parse(exactIntentText), protocol_version: 2 },
    { ...JSON.parse(exactIntentText), extra: true },
  ])("rejects an intent outside the exact schema: %j", (intent) => {
    const { controller, userData } = createController();
    const intentPath = path.join(
      userData,
      ".pupu-main",
      "session_guard_migration_intent.json",
    );
    fs.mkdirSync(path.dirname(intentPath));
    fs.writeFileSync(intentPath, JSON.stringify(intent));

    expect(() => controller.readPendingIntent()).toThrow(
      expect.objectContaining({
        code: "miso_session_guard_migration_intent_invalid",
      }),
    );
  });

  test("rejects a path replaced after opening and closes the descriptor", () => {
    let openedFd;
    const closeSync = jest.fn((fd) => fs.closeSync(fd));
    const { controller, userData } = createController({
      fs: {
        ...fs,
        openSync: (...args) => {
          openedFd = fs.openSync(...args);
          fs.renameSync(path.join(userData, "replacement.json"), args[0]);
          return openedFd;
        },
        closeSync,
      },
    });
    const intentPath = path.join(
      userData,
      ".pupu-main",
      "session_guard_migration_intent.json",
    );
    fs.mkdirSync(path.dirname(intentPath));
    fs.writeFileSync(intentPath, exactIntentText);
    fs.writeFileSync(path.join(userData, "replacement.json"), exactIntentText);

    expect(() => controller.readPendingIntent()).toThrow(
      expect.objectContaining({
        code: "miso_session_guard_migration_intent_invalid",
      }),
    );
    expect(closeSync).toHaveBeenCalledTimes(1);
    expect(closeSync).toHaveBeenCalledWith(openedFd);
  });

  if (process.platform !== "win32") {
    test.each(["existing", "swapped-in"])(
      "rejects a %s FIFO without blocking the process",
      (kind) => {
        const { userData } = createController();
        const intentPath = path.join(
          userData,
          ".pupu-main",
          "session_guard_migration_intent.json",
        );
        fs.mkdirSync(path.dirname(intentPath));
        if (kind === "existing") {
          execFileSync("mkfifo", [intentPath]);
        } else {
          fs.writeFileSync(intentPath, exactIntentText);
        }
        const result = spawnSync(
          process.execPath,
          [
            "-e",
            `const fs = require("fs");
           const path = require("path");
           const { execFileSync } = require("child_process");
           const { createSessionGuardMigrationController } = require(${JSON.stringify(
               require.resolve("../../main/services/unchain/session_guard_migration"),
             )});
           const intentFs = ${JSON.stringify(kind)} === "swapped-in" ? {
             ...fs,
             openSync: (...args) => {
               fs.unlinkSync(args[0]);
               execFileSync("mkfifo", [args[0]]);
               return fs.openSync(...args);
             },
           } : fs;
           const controller = createSessionGuardMigrationController({
             app: { getPath: () => ${JSON.stringify(userData)} }, fs: intentFs, path,
           });
           try {
             controller.readPendingIntent();
             process.exitCode = 1;
           } catch (error) {
             if (error.code !== "miso_session_guard_migration_intent_invalid") throw error;
             console.log(error.code);
           }`,
          ],
          {
            encoding: "utf8",
            timeout: 3000,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          },
        );

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(
          "miso_session_guard_migration_intent_invalid",
        );
      },
    );
  }

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
