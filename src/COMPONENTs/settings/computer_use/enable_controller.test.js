import fs from "fs";
import path from "path";

import {
  disableComputerUse,
  enableComputerUse,
  resyncComputerUseEnabledOnBoot,
} from "./enable_controller";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { hasValidComputerUseConsent } from "../../../SERVICEs/computer_use_consent_store";
import {
  isComputerUseEnabledPersisted,
  writeComputerUseEnabled,
} from "../../../SERVICEs/computer_use_enabled_store";

jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isComputerUseEnableAvailable: jest.fn(() => true),
    setComputerUseEnabled: jest.fn(() =>
      Promise.resolve({ ok: true, enabled: true }),
    ),
  },
}));

jest.mock("../../../SERVICEs/computer_use_consent_store", () => ({
  __esModule: true,
  hasValidComputerUseConsent: jest.fn(() => true),
}));

jest.mock("../../../SERVICEs/computer_use_enabled_store", () => ({
  __esModule: true,
  isComputerUseEnabledPersisted: jest.fn(() => false),
  writeComputerUseEnabled: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  runtimeBridge.isComputerUseEnableAvailable.mockReturnValue(true);
  runtimeBridge.setComputerUseEnabled.mockResolvedValue({
    ok: true,
    enabled: true,
  });
  hasValidComputerUseConsent.mockReturnValue(true);
  isComputerUseEnabledPersisted.mockReturnValue(false);
});

describe("enableComputerUse", () => {
  test("with valid consent: writes store=true and pushes true", async () => {
    const result = await enableComputerUse();
    expect(writeComputerUseEnabled).toHaveBeenCalledWith(true);
    expect(runtimeBridge.setComputerUseEnabled).toHaveBeenCalledWith(true);
    expect(result.pushed).toBe(true);
  });

  test("FAIL-CLOSED: without valid consent, NEVER pushes enable=true", async () => {
    hasValidComputerUseConsent.mockReturnValue(false);
    const result = await enableComputerUse();
    expect(runtimeBridge.setComputerUseEnabled).not.toHaveBeenCalled();
    expect(result.pushed).toBe(false);
    expect(result.blocked).toBe("no_consent");
  });

  test("bridge unavailable: persists desire, no push, no throw", async () => {
    runtimeBridge.isComputerUseEnableAvailable.mockReturnValue(false);
    const result = await enableComputerUse();
    expect(writeComputerUseEnabled).toHaveBeenCalledWith(true);
    expect(runtimeBridge.setComputerUseEnabled).not.toHaveBeenCalled();
    expect(result.pushed).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  test("push failure surfaces as a result, not a throw", async () => {
    runtimeBridge.setComputerUseEnabled.mockRejectedValue(
      new Error("boom"),
    );
    const result = await enableComputerUse();
    expect(result.pushed).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("disableComputerUse", () => {
  test("writes store=false and pushes false without needing consent", async () => {
    hasValidComputerUseConsent.mockReturnValue(false);
    const result = await disableComputerUse();
    expect(writeComputerUseEnabled).toHaveBeenCalledWith(false);
    expect(runtimeBridge.setComputerUseEnabled).toHaveBeenCalledWith(false);
    expect(result.pushed).toBe(true);
  });

  test("persistence failure is reported and never pushes a divergent sidecar state", async () => {
    writeComputerUseEnabled.mockReturnValue({
      persistence: Promise.reject(
        new Error("[settings_storage_unavailable] gone"),
      ),
    });

    const result = await disableComputerUse();

    expect(result.pushed).toBe(false);
    expect(result.persistenceFailed).toBe(true);
    expect(runtimeBridge.setComputerUseEnabled).not.toHaveBeenCalled();
  });
});

describe("resyncComputerUseEnabledOnBoot — three states", () => {
  test("enabled + valid consent → pushes true", async () => {
    isComputerUseEnabledPersisted.mockReturnValue(true);
    hasValidComputerUseConsent.mockReturnValue(true);
    const result = await resyncComputerUseEnabledOnBoot();
    expect(runtimeBridge.setComputerUseEnabled).toHaveBeenCalledWith(true);
    expect(result.pushed).toBe(true);
  });

  test("enabled + consent INVALID (e.g. version bump) → no push", async () => {
    isComputerUseEnabledPersisted.mockReturnValue(true);
    hasValidComputerUseConsent.mockReturnValue(false);
    const result = await resyncComputerUseEnabledOnBoot();
    expect(runtimeBridge.setComputerUseEnabled).not.toHaveBeenCalled();
    expect(result.pushed).toBe(false);
    expect(result.reason).toBe("no_valid_consent");
  });

  test("disabled → no push", async () => {
    isComputerUseEnabledPersisted.mockReturnValue(false);
    const result = await resyncComputerUseEnabledOnBoot();
    expect(runtimeBridge.setComputerUseEnabled).not.toHaveBeenCalled();
    expect(result.pushed).toBe(false);
    expect(result.reason).toBe("not_enabled");
  });

  test("never writes the store (resync only reads + pushes)", async () => {
    isComputerUseEnabledPersisted.mockReturnValue(true);
    hasValidComputerUseConsent.mockReturnValue(true);
    await resyncComputerUseEnabledOnBoot();
    expect(writeComputerUseEnabled).not.toHaveBeenCalled();
  });
});

describe("SECURITY INVARIANT: setComputerUseEnabled call site is unique", () => {
  test("only enable_controller.js references setComputerUseEnabled in src/ (excluding the bridge facade + tests)", () => {
    const srcRoot = path.resolve(__dirname, "../../../");
    const bridgeFacade = path.join(
      "SERVICEs",
      "bridges",
      "unchain_bridge.js",
    );

    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".js")) continue;
        if (entry.name.endsWith(".test.js")) continue;
        const rel = path.relative(srcRoot, full);
        // The facade DEFINES the method — that reference is expected.
        if (rel === bridgeFacade) continue;
        const text = fs.readFileSync(full, "utf8");
        if (text.includes("setComputerUseEnabled")) hits.push(rel);
      }
    };
    walk(srcRoot);

    expect(hits).toEqual([
      path.join("COMPONENTs", "settings", "computer_use", "enable_controller.js"),
    ]);
  });
});
