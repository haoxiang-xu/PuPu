import {
  maybeMigrateProviderSecrets,
  resetProviderSecretMigrationForTests,
} from "./provider_secret_migration";
import {
  settingsStorageBridge,
  isProviderCredentialsMigrationBridgeAvailable,
  getBootstrapSecretStorageStatus,
  getSqlStoreMigrationMeta,
  parseSettingsStorageErrorCode,
} from "./bridges/settings_storage_bridge";
import {
  readProviderSecret,
  readCustomProviderSecrets,
} from "./settings_secret_adapter";

jest.mock("./bridges/settings_storage_bridge", () => ({
  settingsStorageBridge: { migrateProviderCredentials: jest.fn() },
  isProviderCredentialsMigrationBridgeAvailable: jest.fn(),
  getBootstrapSecretStorageStatus: jest.fn(),
  getSqlStoreMigrationMeta: jest.fn(),
  parseSettingsStorageErrorCode: jest.fn(),
  resetSessionBootstrapSnapshotForTests: jest.fn(),
}));

jest.mock("./settings_secret_adapter", () => ({
  readProviderSecret: jest.fn(),
  readCustomProviderSecrets: jest.fn(),
}));

// CRA's jest preset runs with resetMocks:true, which clears every jest.fn
// implementation before each test. Re-install the "steady, everything-present"
// baseline in beforeEach; individual tests override a single lever.
beforeEach(() => {
  resetProviderSecretMigrationForTests();
  isProviderCredentialsMigrationBridgeAvailable.mockReturnValue(true);
  getBootstrapSecretStorageStatus.mockReturnValue("available");
  getSqlStoreMigrationMeta.mockReturnValue(null);
  readProviderSecret.mockReturnValue("");
  readCustomProviderSecrets.mockReturnValue({});
  parseSettingsStorageErrorCode.mockReturnValue(null);
  settingsStorageBridge.migrateProviderCredentials.mockResolvedValue({
    status: "complete",
    migratedCount: 1,
    failedCount: 0,
  });
});

const setLegacy = ({ openai, anthropic, custom } = {}) => {
  readProviderSecret.mockImplementation((field) => {
    if (field === "openai_api_key") return openai || "";
    if (field === "anthropic_api_key") return anthropic || "";
    return "";
  });
  readCustomProviderSecrets.mockReturnValue(custom || {});
};

describe("maybeMigrateProviderSecrets — no-op guards", () => {
  test("bridge unavailable (browser/Jest/pre-Phase-4 preload) → no migrate", async () => {
    isProviderCredentialsMigrationBridgeAvailable.mockReturnValue(false);
    setLegacy({ openai: "sk-SENTINEL" });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).not.toHaveBeenCalled();
  });

  test("safeStorage not available (degraded) → no migrate", async () => {
    getBootstrapSecretStorageStatus.mockReturnValue("unavailable");
    setLegacy({ openai: "sk-SENTINEL" });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).not.toHaveBeenCalled();
  });

  test("SQL migration meta already complete → no migrate (idempotent)", async () => {
    getSqlStoreMigrationMeta.mockReturnValue({
      state: "complete",
      version: 1,
      digest: "abc",
      migratedAt: 123,
    });
    setLegacy({ openai: "sk-SENTINEL" });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).not.toHaveBeenCalled();
    // the meta is read from the "providerCredentials" store key
    expect(getSqlStoreMigrationMeta).toHaveBeenCalledWith("providerCredentials");
  });

  test("no legacy secret present → no migrate", async () => {
    // all empty (baseline)
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).not.toHaveBeenCalled();
  });

  test("meta present but not complete (in_progress) → still migrates", async () => {
    getSqlStoreMigrationMeta.mockReturnValue({
      state: "in_progress",
      version: null,
      digest: null,
      migratedAt: null,
    });
    setLegacy({ openai: "sk-SENTINEL" });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).toHaveBeenCalledTimes(1);
  });
});

describe("maybeMigrateProviderSecrets — migration payload", () => {
  test("ships openai + anthropic + custom in the frozen envelope shape", async () => {
    setLegacy({
      openai: "sk-SENTINEL-openai",
      anthropic: "sk-ant-SENTINEL",
      custom: { "slug-a": "SENTINEL-a", "slug-b": "SENTINEL-b" },
    });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).toHaveBeenCalledTimes(1);
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).toHaveBeenCalledWith({
      migrationVersion: 1,
      credentials: {
        openai: "sk-SENTINEL-openai",
        anthropic: "sk-ant-SENTINEL",
        custom: { "slug-a": "SENTINEL-a", "slug-b": "SENTINEL-b" },
      },
    });
  });

  test("only-openai omits the absent anthropic and custom fields", async () => {
    setLegacy({ openai: "sk-SENTINEL-openai" });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).toHaveBeenCalledWith({
      migrationVersion: 1,
      credentials: { openai: "sk-SENTINEL-openai" },
    });
  });

  test("custom-only: empty-string values dropped, __proto__ skipped", async () => {
    setLegacy({
      custom: {
        keep: "SENTINEL-keep",
        blank: "",
        // eslint-disable-next-line no-proto
        __proto__: "SENTINEL-proto",
      },
    });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).toHaveBeenCalledTimes(1);
    const payload =
      settingsStorageBridge.migrateProviderCredentials.mock.calls[0][0];
    expect(payload.credentials.custom).toEqual({ keep: "SENTINEL-keep" });
    expect(payload.credentials.custom).not.toHaveProperty("blank");
    expect(
      Object.prototype.hasOwnProperty.call(payload.credentials.custom, "__proto__"),
    ).toBe(false);
  });

  test("custom present but all values empty → treated as nothing to migrate", async () => {
    setLegacy({ custom: { a: "", b: "" } });
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).not.toHaveBeenCalled();
  });
});

describe("maybeMigrateProviderSecrets — session guard + failure handling", () => {
  test("fires at most once per session across repeated calls", async () => {
    setLegacy({ openai: "sk-SENTINEL" });
    await maybeMigrateProviderSecrets();
    await maybeMigrateProviderSecrets();
    await maybeMigrateProviderSecrets();
    expect(
      settingsStorageBridge.migrateProviderCredentials,
    ).toHaveBeenCalledTimes(1);
  });

  test("a rejected migrate is caught (never throws) and logged by code only", async () => {
    const error = Object.assign(
      new Error("[provider_missing_api_key] boom"),
      { code: "provider_missing_api_key" },
    );
    settingsStorageBridge.migrateProviderCredentials.mockRejectedValue(error);
    parseSettingsStorageErrorCode.mockReturnValue("provider_missing_api_key");
    setLegacy({ openai: "sk-SENTINEL-should-not-log" });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(maybeMigrateProviderSecrets()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).toContain("provider_missing_api_key");
      // the secret VALUE must never reach the logs
      expect(logged).not.toContain("SENTINEL");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("resolves undefined (no secret returned to the caller) on success", async () => {
    setLegacy({ openai: "sk-SENTINEL" });
    const result = await maybeMigrateProviderSecrets();
    expect(result).toBeUndefined();
  });
});
