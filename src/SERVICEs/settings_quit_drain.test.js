import {
  createSettingsQuitDrainController,
} from "./settings_quit_drain";
import {
  beginSettingsQuitDrain,
  endSettingsQuitDrain,
  readNamespace,
  replaceNamespace,
  resetSettingsRepositoryForTests,
} from "./settings_repository";
import {
  beginProviderCredentialQuitDrain,
  endProviderCredentialQuitDrain,
  persistCustomProviderSecret,
  persistOfficialProviderSecret,
  resetProviderCredentialPersistenceForTests,
} from "./provider_credential_persistence";
import {
  beginDefaultToolkitQuitDrain,
  endDefaultToolkitQuitDrain,
  resetDefaultToolkitStoreForTests,
  setDefaultToolkitEnabled,
} from "./default_toolkit_store";
import {
  beginToolkitAutoApproveQuitDrain,
  endToolkitAutoApproveQuitDrain,
  resetToolkitAutoApproveStoreForTests,
  setToolkitAutoApprove,
} from "./toolkit_auto_approve_store";
import {
  beginComputerUsePreferencesQuitDrain,
  endComputerUsePreferencesQuitDrain,
  resetComputerUsePreferencesForTests,
  writeComputerUsePreferenceRecord,
} from "./computer_use_preferences_sql";

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const makeBridge = () => {
  let requestListener = null;
  let abortListener = null;
  return {
    bridge: {
      onQuitDrainRequest: jest.fn((listener) => {
        requestListener = listener;
        return () => {
          requestListener = null;
        };
      }),
      onQuitDrainAbort: jest.fn((listener) => {
        abortListener = listener;
        return () => {
          abortListener = null;
        };
      }),
      sendQuitDrainResult: jest.fn(),
    },
    request: (payload) => requestListener(payload),
    abort: (payload) => abortListener(payload),
  };
};

const installProviderWriteBridge = (overrides = {}) => {
  const bridgeApi = {
    bootstrap: jest.fn(() => ({
      available: true,
      degraded: false,
      configuredCredentials: [],
    })),
    migrateLegacy: jest.fn(() =>
      Promise.resolve({ status: "already-complete" }),
    ),
    setNamespace: jest.fn(() =>
      Promise.resolve({ ok: true, revision: 1, updatedAt: 1 }),
    ),
    deleteNamespace: jest.fn(() =>
      Promise.resolve({ ok: true, deleted: true }),
    ),
    setProviderCredential: jest.fn(() =>
      Promise.resolve({ ok: true, status: "stored" }),
    ),
    deleteProviderCredential: jest.fn(() =>
      Promise.resolve({ ok: true, deleted: true }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = bridgeApi;
  return bridgeApi;
};

describe("settings quit drain renderer controller", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
  });

  afterEach(() => {
    delete window.settingsStorageAPI;
    endDefaultToolkitQuitDrain();
    endToolkitAutoApproveQuitDrain();
    endComputerUsePreferencesQuitDrain();
    resetDefaultToolkitStoreForTests();
    resetToolkitAutoApproveStoreForTests();
    resetComputerUsePreferencesForTests();
    endProviderCredentialQuitDrain();
    resetProviderCredentialPersistenceForTests();
    resetSettingsRepositoryForTests();
  });

  test("successful ack followed by quit veto abort restores settings writes", async () => {
    const harness = makeBridge();
    const controller = createSettingsQuitDrainController({
      bridge: harness.bridge,
      beginDrains: [
        beginSettingsQuitDrain,
        async () => {},
        async () => {},
        async () => {},
        async () => {},
      ],
      endDrains: [
        endSettingsQuitDrain,
        () => {},
        () => {},
        () => {},
        () => {},
      ],
    });

    harness.request({ requestId: "request-1" });
    await flushPromises();
    expect(harness.bridge.sendQuitDrainResult).toHaveBeenCalledWith({
      requestId: "request-1",
      ok: true,
    });

    await expect(
      replaceNamespace("ui", { compact: true }),
    ).rejects.toMatchObject({ code: "settings_quit_in_progress" });

    // Main sends this when chat's beforeunload keeps the app alive.
    harness.abort({ requestId: "request-1" });
    await expect(
      replaceNamespace("ui", { compact: true }),
    ).resolves.toBeDefined();
    expect(readNamespace("ui", null)).toEqual({ compact: true });

    controller.dispose();
  });

  test("closes all admissions synchronously and waits for every FIFO", async () => {
    const harness = makeBridge();
    let finishFirstDrain;
    const firstDrain = new Promise((resolve) => {
      finishFirstDrain = resolve;
    });
    const beginDrains = [
      jest.fn(() => firstDrain),
      jest.fn(() => Promise.resolve()),
      jest.fn(() => Promise.resolve()),
    ];
    const endDrains = [jest.fn(), jest.fn(), jest.fn()];
    const controller = createSettingsQuitDrainController({
      bridge: harness.bridge,
      beginDrains,
      endDrains,
    });

    harness.request({ requestId: "request-2" });
    beginDrains.forEach((beginDrain) => {
      expect(beginDrain).toHaveBeenCalledTimes(1);
    });
    expect(harness.bridge.sendQuitDrainResult).not.toHaveBeenCalled();

    finishFirstDrain();
    await flushPromises();
    expect(harness.bridge.sendQuitDrainResult).toHaveBeenCalledWith({
      requestId: "request-2",
      ok: true,
    });

    harness.abort({ requestId: "request-2" });
    endDrains.forEach((endDrain) => {
      expect(endDrain).toHaveBeenCalledTimes(1);
    });
    controller.dispose();
  });

  test("provider quit barrier never invokes official or custom lazy legacy writers", async () => {
    const officialLegacyWrite = jest.fn(() => true);
    const customLegacyWrite = jest.fn(() => true);
    const officialRestore = jest.fn(() => false);
    const customRestore = jest.fn(() => false);
    await beginProviderCredentialQuitDrain();

    const [officialResult, customResult] = await Promise.all([
      persistOfficialProviderSecret(
        "openai_api_key",
        "never-crosses-quit",
        officialLegacyWrite,
        { restorePrevious: officialRestore },
      ),
      persistCustomProviderSecret(
        "custom-provider",
        "never-crosses-quit",
        customLegacyWrite,
        { restorePrevious: customRestore },
      ),
    ]);
    expect(officialResult).toMatchObject({
      ok: false,
      status: "not-synced",
      errorCode: "settings_quit_in_progress",
    });
    expect(customResult).toMatchObject({
      ok: false,
      status: "not-synced",
      errorCode: "settings_quit_in_progress",
    });
    expect(officialLegacyWrite).not.toHaveBeenCalled();
    expect(customLegacyWrite).not.toHaveBeenCalled();
    expect(officialRestore).not.toHaveBeenCalled();
    expect(customRestore).not.toHaveBeenCalled();

    endProviderCredentialQuitDrain();
    // Boolean legacy write results remain accepted for older callers.
    await expect(
      persistOfficialProviderSecret(
        "openai_api_key",
        "legacy-fallback-value",
        true,
        {
          restorePrevious: jest.fn(() => true),
          restoreCurrent: jest.fn(() => true),
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      status: "legacy-only",
    });
  });

  test("provider drain waits for an admitted FIFO tail and blocks the next lazy writer", async () => {
    let finishSqlWrite;
    const bridgeApi = installProviderWriteBridge({
      setProviderCredential: jest.fn(
        () =>
          new Promise((resolve) => {
            finishSqlWrite = resolve;
          }),
      ),
    });
    const admittedLegacyWrite = jest.fn(() => true);
    const blockedLegacyWrite = jest.fn(() => true);

    const admitted = persistOfficialProviderSecret(
      "openai_api_key",
      "admitted-before-drain",
      admittedLegacyWrite,
      { restorePrevious: jest.fn(() => true) },
    );
    const drain = beginProviderCredentialQuitDrain();
    const blocked = await persistOfficialProviderSecret(
      "openai_api_key",
      "blocked-after-drain",
      blockedLegacyWrite,
      { restorePrevious: jest.fn(() => true) },
    );

    expect(admittedLegacyWrite).toHaveBeenCalledTimes(1);
    expect(blockedLegacyWrite).not.toHaveBeenCalled();
    expect(blocked).toMatchObject({
      ok: false,
      status: "not-synced",
      errorCode: "settings_quit_in_progress",
    });

    let drainSettled = false;
    drain.then(() => {
      drainSettled = true;
    });
    await flushPromises();
    expect(bridgeApi.setProviderCredential).toHaveBeenCalledWith(
      "provider",
      "openai",
      "admitted-before-drain",
    );
    expect(drainSettled).toBe(false);

    finishSqlWrite({ ok: true, status: "stored" });
    await expect(admitted).resolves.toMatchObject({
      ok: true,
      status: "stored",
    });
    await drain;
    expect(drainSettled).toBe(true);
  });

  test("an admitted SQL failure still reports a real legacy rollback failure", async () => {
    installProviderWriteBridge({
      setProviderCredential: jest.fn(() =>
        Promise.reject(new Error("[storage_io_error] disk full")),
      ),
    });
    const legacyWrite = jest.fn(() => true);
    const restorePrevious = jest.fn(() => false);

    await expect(
      persistOfficialProviderSecret(
        "openai_api_key",
        "accepted-before-sql-failure",
        legacyWrite,
        { restorePrevious },
      ),
    ).resolves.toMatchObject({
      ok: false,
      status: "not-synced",
      errorCode: "legacy_rollback_failed",
    });
    expect(legacyWrite).toHaveBeenCalledTimes(1);
    expect(restorePrevious).toHaveBeenCalledTimes(1);
  });

  test("toolkit and computer-use stores resume admission after abort", async () => {
    await Promise.all([
      beginDefaultToolkitQuitDrain(),
      beginToolkitAutoApproveQuitDrain(),
      beginComputerUsePreferencesQuitDrain(),
    ]);

    const blockedDefault = setDefaultToolkitEnabled(
      "global",
      "mcp.test",
      true,
    );
    await expect(blockedDefault.persistence).rejects.toMatchObject({
      code: "settings_quit_in_progress",
    });
    const blockedAutoApprove = setToolkitAutoApprove(
      "mcp.test",
      true,
      ["run"],
    );
    await expect(blockedAutoApprove.persistence).rejects.toMatchObject({
      code: "settings_quit_in_progress",
    });
    await expect(
      writeComputerUsePreferenceRecord("enabled", {
        version: 1,
        enabled: true,
        updatedAt: "2026-07-26T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "settings_quit_in_progress" });

    endDefaultToolkitQuitDrain();
    endToolkitAutoApproveQuitDrain();
    endComputerUsePreferencesQuitDrain();

    expect(
      setDefaultToolkitEnabled("global", "mcp.test", true),
    ).toContain("mcp.test");
    expect(
      setToolkitAutoApprove("mcp.test", true, ["run"]).toolkits,
    ).toContain("mcp.test");
    await expect(
      writeComputerUsePreferenceRecord("enabled", {
        version: 1,
        enabled: true,
        updatedAt: "2026-07-26T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });
});
