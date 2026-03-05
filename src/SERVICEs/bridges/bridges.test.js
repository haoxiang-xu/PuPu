import fs from "fs";
import path from "path";

import { FrontendApiError } from "../api.shared";
import { runtimeBridge } from "./miso_bridge";
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
  const originalMisoAPI = window.misoAPI;
  const originalOllamaAPI = window.ollamaAPI;
  const originalThemeAPI = window.themeAPI;
  const originalWindowStateAPI = window.windowStateAPI;

  afterEach(() => {
    window.misoAPI = originalMisoAPI;
    window.ollamaAPI = originalOllamaAPI;
    window.themeAPI = originalThemeAPI;
    window.windowStateAPI = originalWindowStateAPI;
    jest.clearAllMocks();
  });

  test("runtimeBridge.validateWorkspaceRoot returns normalized payload", async () => {
    window.misoAPI = {
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
    window.misoAPI = {};

    await expect(runtimeBridge.validateWorkspaceRoot("/tmp/demo")).rejects.toMatchObject(
      {
        code: "bridge_unavailable",
      },
    );
  });

  test("runtimeBridge.getRuntimeDirSize normalizes invalid response", async () => {
    window.misoAPI = {
      getRuntimeDirSize: jest.fn(async () => ({ entries: null, total: "x" })),
    };

    await expect(runtimeBridge.getRuntimeDirSize("/tmp/demo")).resolves.toEqual({
      entries: [],
      total: 0,
      error: "",
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
    window.misoAPI = {
      getRuntimeDirSize: jest.fn(async () => {
        throw new Error("failed");
      }),
    };

    await expect(runtimeBridge.getRuntimeDirSize("/tmp/demo")).rejects.toBeInstanceOf(
      FrontendApiError,
    );
  });
});

describe("window API boundary guard", () => {
  test("direct window API usage is restricted to SERVICEs/bridges and tests", () => {
    const disallowedPattern = /window\.(misoAPI|ollamaAPI|themeAPI|windowStateAPI)/;

    const offenders = collectJsFiles(SRC_ROOT)
      .filter((filePath) => !filePath.includes(`${path.sep}SERVICEs${path.sep}bridges${path.sep}`))
      .filter((filePath) => !filePath.endsWith(".test.js"))
      .filter((filePath) => disallowedPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(SRC_ROOT, filePath));

    expect(offenders).toEqual([]);
  });
});
