const path = require("path");
const { createRuntimeService } = require("../../main/services/runtime/service");

const createService = ({ app, getMainWindow } = {}) =>
  createRuntimeService({
    app: {
      isPackaged: false,
      getPath: jest.fn(() => "/tmp"),
      getAppPath: jest.fn(() => "/tmp/app"),
      ...(app || {}),
    },
    dialog: {
      showOpenDialog: jest.fn(),
    },
    shell: {
      openPath: jest.fn(),
    },
    fs: {
      existsSync: jest.fn(() => false),
      statSync: jest.fn(),
      readdirSync: jest.fn(() => []),
      rmSync: jest.fn(),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    },
    path,
    getMainWindow: getMainWindow || jest.fn(() => null),
  });

describe("runtime service chrome terminal control", () => {
  test("allows opening and closing devtools when app is not packaged", () => {
    const webContents = {
      isDestroyed: jest.fn(() => false),
      openDevTools: jest.fn(),
      closeDevTools: jest.fn(),
      isDevToolsOpened: jest
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
    };
    const getMainWindow = jest.fn(() => ({
      isDestroyed: jest.fn(() => false),
      webContents,
    }));

    const service = createService({ getMainWindow });

    const openResult = service.setChromeTerminalOpen({ open: true });
    const closeResult = service.setChromeTerminalOpen({ open: false });

    expect(openResult).toEqual({ ok: true, open: true });
    expect(closeResult).toEqual({ ok: true, open: false });
    expect(webContents.openDevTools).toHaveBeenCalledWith({ mode: "detach" });
    expect(webContents.closeDevTools).toHaveBeenCalledTimes(1);
  });

  test("rejects chrome terminal control in packaged runtime", () => {
    const service = createService({
      app: {
        isPackaged: true,
        getPath: jest.fn(() => "/tmp"),
      },
    });

    expect(service.setChromeTerminalOpen({ open: true })).toEqual({
      ok: false,
      open: false,
      error: "dev_only",
    });
  });

  test("returns explicit error when main window is unavailable", () => {
    const service = createService({
      getMainWindow: jest.fn(() => null),
    });

    expect(service.setChromeTerminalOpen({ open: true })).toEqual({
      ok: false,
      open: true,
      error: "main_window_unavailable",
    });
  });

  test("syncBuildFeatureFlagsSnapshot writes the current snapshot under app root", () => {
    const appPath = "/tmp/pupu-app";
    const fs = {
      existsSync: jest.fn(() => false),
      statSync: jest.fn(),
      readdirSync: jest.fn(() => []),
      rmSync: jest.fn(),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
    };

    const service = createRuntimeService({
      app: {
        isPackaged: false,
        getPath: jest.fn(() => "/tmp"),
        getAppPath: jest.fn(() => appPath),
      },
      dialog: {
        showOpenDialog: jest.fn(),
      },
      shell: {
        openPath: jest.fn(),
      },
      fs,
      path,
      getMainWindow: jest.fn(() => null),
    });

    expect(
      service.syncBuildFeatureFlagsSnapshot({
        featureFlags: {
          enable_user_access_to_agent_modal: true,
        },
      }),
    ).toEqual({
      ok: true,
      path: path.join(appPath, ".local", "build_feature_flags.snapshot.json"),
      error: "",
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.join(appPath, ".local"),
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(appPath, ".local", "build_feature_flags.snapshot.json"),
      '{\n  "enable_user_access_to_agent_modal": true\n}\n',
      "utf-8",
    );
  });

  test("getCharacterStorageSize aggregates registry, avatars, sessions, and profiles", () => {
    const userDataPath = "/tmp/pupu";
    const registryPath = path.join(userDataPath, "characters", "registry.json");
    const avatarsDir = path.join(userDataPath, "characters", "avatars");
    const avatarFile = path.join(avatarsDir, "nico.png");
    const sessionsDir = path.join(userDataPath, "memory", "sessions");
    const sessionFile = path.join(sessionsDir, "character_nico__self.json");
    const profilesDir = path.join(
      userDataPath,
      "memory",
      "long_term_profiles",
    );
    const profileFile = path.join(
      profilesDir,
      "character_nico__rel__local_user.json",
    );

    const fs = {
      existsSync: jest.fn((targetPath) =>
        [
          registryPath,
          avatarsDir,
          avatarFile,
          sessionsDir,
          sessionFile,
          profilesDir,
          profileFile,
        ].includes(targetPath),
      ),
      statSync: jest.fn((targetPath) => {
        if (targetPath === registryPath) {
          return { isDirectory: () => false, size: 100 };
        }
        if (targetPath === avatarsDir) {
          return { isDirectory: () => true };
        }
        if (targetPath === avatarFile) {
          return { isDirectory: () => false, size: 400 };
        }
        if (targetPath === sessionFile) {
          return { isDirectory: () => false, size: 300 };
        }
        if (targetPath === profileFile) {
          return { isDirectory: () => false, size: 200 };
        }
        return { isDirectory: () => true };
      }),
      readdirSync: jest.fn((targetPath) => {
        if (targetPath === avatarsDir) {
          return ["nico.png"];
        }
        if (targetPath === sessionsDir) {
          return ["character_nico__self.json", "ignore.json"];
        }
        if (targetPath === profilesDir) {
          return ["character_nico__rel__local_user.json", "other.json"];
        }
        return [];
      }),
      rmSync: jest.fn(),
    };

    const service = createRuntimeService({
      app: {
        isPackaged: false,
        getPath: jest.fn((key) => (key === "userData" ? userDataPath : "/tmp")),
        getAppPath: jest.fn(() => "/tmp/app"),
      },
      dialog: {
        showOpenDialog: jest.fn(),
      },
      shell: {
        openPath: jest.fn(),
      },
      fs,
      path,
      getMainWindow: jest.fn(() => null),
    });

    expect(service.getCharacterStorageSize()).toEqual({
      entries: [
        { name: "avatars", size: 400, isDir: true },
        { name: "sessions", size: 300, isDir: true },
        { name: "profiles", size: 200, isDir: true },
        { name: "registry.json", size: 100, isDir: false },
      ],
      total: 1000,
      registryTotal: 100,
      avatarTotal: 400,
      sessionTotal: 300,
      profileTotal: 200,
      error: "",
    });
  });

  test("deleteCharacterStorageEntry deletes only character-prefixed sessions", () => {
    const userDataPath = "/tmp/pupu";
    const sessionsDir = path.join(userDataPath, "memory", "sessions");
    const fs = {
      existsSync: jest.fn((targetPath) => targetPath === sessionsDir),
      statSync: jest.fn(),
      readdirSync: jest.fn((targetPath) =>
        targetPath === sessionsDir
          ? ["character_nico__self.json", "main_chat.json"]
          : [],
      ),
      rmSync: jest.fn(),
    };

    const service = createRuntimeService({
      app: {
        isPackaged: false,
        getPath: jest.fn((key) => (key === "userData" ? userDataPath : "/tmp")),
        getAppPath: jest.fn(() => "/tmp/app"),
      },
      dialog: {
        showOpenDialog: jest.fn(),
      },
      shell: {
        openPath: jest.fn(),
      },
      fs,
      path,
      getMainWindow: jest.fn(() => null),
    });

    expect(service.deleteCharacterStorageEntry({ entryName: "sessions" })).toEqual({
      ok: true,
    });
    expect(fs.rmSync).toHaveBeenCalledTimes(1);
    expect(fs.rmSync).toHaveBeenCalledWith(
      path.join(sessionsDir, "character_nico__self.json"),
      { recursive: true, force: true },
    );
  });
});
