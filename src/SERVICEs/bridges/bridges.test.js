import fs from "fs";
import path from "path";

import { FrontendApiError } from "../api.shared";
import { runtimeBridge } from "./unchain_bridge";
import { ollamaBridge } from "./ollama_bridge";
import { themeBridge } from "./theme_bridge";
import { windowStateBridge } from "./window_state_bridge";

const SRC_ROOT = path.resolve(__dirname, "../../");

const collectJsFiles = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      return;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  });

  return files;
};

describe("bridge wrappers", () => {
  const originalUnchainAPI = window.unchainAPI;
  const originalOllamaAPI = window.ollamaAPI;
  const originalThemeAPI = window.themeAPI;
  const originalWindowStateAPI = window.windowStateAPI;

  afterEach(() => {
    window.unchainAPI = originalUnchainAPI;
    window.ollamaAPI = originalOllamaAPI;
    window.themeAPI = originalThemeAPI;
    window.windowStateAPI = originalWindowStateAPI;
    jest.clearAllMocks();
  });

  test("runtimeBridge.validateWorkspaceRoot returns normalized payload", async () => {
    window.unchainAPI = {
      validateWorkspaceRoot: jest.fn(async () => ({
        valid: true,
        resolvedPath: "  /tmp/demo ",
      })),
    };

    await expect(runtimeBridge.validateWorkspaceRoot("/tmp/demo")).resolves.toEqual(
      {
        valid: true,
        resolvedPath: "/tmp/demo",
        reason: "",
        message: "",
      },
    );
  });

  test("runtimeBridge throws bridge_unavailable when method is missing", async () => {
    window.unchainAPI = {};

    await expect(runtimeBridge.validateWorkspaceRoot("/tmp/demo")).rejects.toMatchObject(
      {
        code: "bridge_unavailable",
      },
    );
  });

  test("runtimeBridge.getRuntimeDirSize normalizes invalid response", async () => {
    window.unchainAPI = {
      getRuntimeDirSize: jest.fn(async () => ({ entries: null, total: "x" })),
    };

    await expect(runtimeBridge.getRuntimeDirSize("/tmp/demo")).resolves.toEqual({
      entries: [],
      total: 0,
      error: "",
    });
  });

  test("runtimeBridge.getMemorySize normalizes vector and profile totals", async () => {
    window.unchainAPI = {
      getMemorySize: jest.fn(async () => ({
        total: "42",
        vectorTotal: "24",
        profileTotal: "18",
      })),
    };

    await expect(runtimeBridge.getMemorySize()).resolves.toEqual({
      total: 42,
      vectorTotal: 24,
      profileTotal: 18,
      error: "",
    });
  });

  test("runtimeBridge.getCharacterStorageSize normalizes totals", async () => {
    window.unchainAPI = {
      getCharacterStorageSize: jest.fn(async () => ({
        total: "42",
        registryTotal: "10",
        avatarTotal: "20",
        sessionTotal: "7",
        profileTotal: "5",
        entries: null,
      })),
      deleteCharacterStorageEntry: jest.fn(),
    };

    await expect(runtimeBridge.getCharacterStorageSize()).resolves.toEqual({
      entries: [],
      total: 42,
      registryTotal: 10,
      avatarTotal: 20,
      sessionTotal: 7,
      profileTotal: 5,
      error: "",
    });
  });

  test("runtimeBridge.deleteCharacterStorageEntry forwards entry name", async () => {
    window.unchainAPI = {
      getCharacterStorageSize: jest.fn(),
      deleteCharacterStorageEntry: jest.fn(async () => ({ ok: true })),
    };

    await expect(
      runtimeBridge.deleteCharacterStorageEntry("avatars"),
    ).resolves.toEqual({ ok: true });
    expect(window.unchainAPI.deleteCharacterStorageEntry).toHaveBeenCalledWith(
      "avatars",
    );
  });

  test("runtimeBridge.listCharacters normalizes response", async () => {
    window.unchainAPI = {
      listCharacters: jest.fn(async () => ({
        characters: [{ id: "mina" }],
        count: "1",
      })),
      getCharacter: jest.fn(),
      saveCharacter: jest.fn(),
      deleteCharacter: jest.fn(),
    };

    await expect(runtimeBridge.listCharacters()).resolves.toEqual({
      characters: [{ id: "mina" }],
      count: 1,
    });
  });

  test("runtimeBridge.previewCharacterDecision throws when method is missing", async () => {
    window.unchainAPI = {};

    await expect(
      runtimeBridge.previewCharacterDecision({ characterId: "mina" }),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
  });

  test("runtimeBridge.setChromeTerminalOpen forwards open flag and normalizes payload", async () => {
    window.unchainAPI = {
      setChromeTerminalOpen: jest.fn(async (open) => ({
        ok: true,
        open,
      })),
    };

    await expect(runtimeBridge.setChromeTerminalOpen(true)).resolves.toEqual({
      ok: true,
      open: true,
      error: "",
    });
    expect(window.unchainAPI.setChromeTerminalOpen).toHaveBeenCalledWith(true);
  });

  test("runtimeBridge.setChromeTerminalOpen throws when bridge method is missing", async () => {
    window.unchainAPI = {};

    await expect(runtimeBridge.setChromeTerminalOpen(true)).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
  });

  test("runtimeBridge.syncBuildFeatureFlagsSnapshot forwards flags and normalizes payload", async () => {
    window.unchainAPI = {
      syncBuildFeatureFlagsSnapshot: jest.fn(async (featureFlags) => ({
        ok: true,
        path: " /tmp/app/.local/build_feature_flags.snapshot.json ",
        error: "",
        featureFlags,
      })),
    };

    await expect(
      runtimeBridge.syncBuildFeatureFlagsSnapshot({
        enable_user_access_to_agent_modal: true,
      }),
    ).resolves.toEqual({
      ok: true,
      path: "/tmp/app/.local/build_feature_flags.snapshot.json",
      error: "",
    });
    expect(window.unchainAPI.syncBuildFeatureFlagsSnapshot).toHaveBeenCalledWith({
      enable_user_access_to_agent_modal: true,
    });
  });

  test("ollamaBridge getStatus reports standardized error code", async () => {
    window.ollamaAPI = {
      getStatus: jest.fn(async () => {
        throw new Error("boom");
      }),
    };

    await expect(ollamaBridge.getStatus()).rejects.toMatchObject({
      code: "ollama_status_failed",
    });
  });

  test("ollamaBridge.onInstallProgress falls back to noop", () => {
    window.ollamaAPI = {};
    const cleanup = ollamaBridge.onInstallProgress(() => {});
    expect(typeof cleanup).toBe("function");
    expect(cleanup()).toBeUndefined();
  });

  test("themeBridge is no-op when unavailable", () => {
    window.themeAPI = {};
    expect(themeBridge.setThemeMode("dark_mode")).toBe(false);
    expect(themeBridge.setBackgroundColor("#fff")).toBe(false);
  });

  test("windowStateBridge wraps listener and action", () => {
    const actionSpy = jest.fn();
    const listenerSpy = jest.fn((cb) => {
      cb({ isMaximized: true });
      return () => {};
    });
    const onChange = jest.fn();

    window.windowStateAPI = {
      windowStateEventHandler: actionSpy,
      windowStateEventListener: listenerSpy,
    };

    const cleanup = windowStateBridge.onWindowStateChange(onChange);
    expect(typeof cleanup).toBe("function");
    expect(onChange).toHaveBeenCalledWith({ isMaximized: true });

    const sent = windowStateBridge.sendWindowAction("minimize");
    expect(sent).toBe(true);
    expect(actionSpy).toHaveBeenCalledWith("minimize");
  });

  test("runtimeBridge methods throw FrontendApiError on failure", async () => {
    window.unchainAPI = {
      getRuntimeDirSize: jest.fn(async () => {
        throw new Error("failed");
      }),
    };

    await expect(runtimeBridge.getRuntimeDirSize("/tmp/demo")).rejects.toBeInstanceOf(
      FrontendApiError,
    );
  });

  test("runtimeBridge.setChromeTerminalOpen wraps failures in FrontendApiError", async () => {
    window.unchainAPI = {
      setChromeTerminalOpen: jest.fn(async () => {
        throw new Error("failed");
      }),
    };

    await expect(runtimeBridge.setChromeTerminalOpen(true)).rejects.toMatchObject({
      code: "unchain_chrome_terminal_failed",
    });
  });
});

describe("window API boundary guard", () => {
  test("direct window API usage is restricted to SERVICEs/bridges and tests", () => {
    const disallowedPattern = /window\.(unchainAPI|ollamaAPI|themeAPI|windowStateAPI)/;

    const offenders = collectJsFiles(SRC_ROOT)
      .filter((filePath) => !filePath.includes(`${path.sep}SERVICEs${path.sep}bridges${path.sep}`))
      .filter((filePath) => !filePath.endsWith(".test.js"))
      .filter((filePath) => disallowedPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(SRC_ROOT, filePath));

    expect(offenders).toEqual([]);
  });
});
