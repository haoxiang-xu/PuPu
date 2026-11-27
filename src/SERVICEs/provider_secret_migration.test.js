import { maybeMigrateProviderSecrets, resetProviderSecretMigrationForTests } from "./provider_secret_migration";
import { resetProviderCredentialPersistenceForTests, flushProviderCredentialWrites } from "./provider_credential_persistence";
import { getBootstrapConfiguredCredentials, resetSessionBootstrapSnapshotForTests } from "./bridges/settings_storage_bridge";
import { readProviderSecret, readCustomProviderSecrets, resetProviderSecretSessionForTests } from "./settings_secret_adapter";
import { writeModelProviders } from "../COMPONENTs/settings/model_providers/storage";

const seed = (providers) => localStorage.setItem("settings", JSON.stringify({ appearance: { theme: "dark" }, model_providers: providers }));
const install = ({ configured = [], available = true, set } = {}) => {
  const api = {
    bootstrap: () => ({ available: true, migration: { state: "complete" }, namespaces: {}, revisions: {},
      secretStorageStatus: available ? "available" : "unavailable", configuredCredentials: configured,
      storeMigrations: { providerCredentials: { state: "complete", version: 1 } } }),
    migrateLegacy: jest.fn(), setNamespace: jest.fn(), deleteNamespace: jest.fn(),
    setProviderCredential: set || jest.fn().mockResolvedValue({ ok: true, status: "stored" }),
    deleteProviderCredential: jest.fn().mockResolvedValue({ ok: true }),
  };
  api.migrateProviderCredentials = jest.fn(async (payload) => {
    expect(payload.migrationVersion).toBe(2);
    const key = Object.keys(payload.credentials)[0];
    const ownerId = key === "custom" ? `custom.${Object.keys(payload.credentials.custom)[0]}` : key;
    if (configured.includes(ownerId)) return { ok: true, status: "stored" };
    return api.setProviderCredential(key === "custom" ? "custom_provider" : "provider", ownerId,
      key === "custom" ? Object.values(payload.credentials.custom)[0] : payload.credentials[key]);
  });
  window.settingsStorageAPI = api;
  return api;
};
beforeEach(() => { localStorage.clear(); resetProviderSecretMigrationForTests(); resetProviderCredentialPersistenceForTests(); });
afterEach(async () => { await flushProviderCredentialWrites(); delete window.settingsStorageAPI; resetSessionBootstrapSnapshotForTests(); });

test("completed old migration metadata does not hide missing SQL owners", async () => {
  seed({ openai_api_key: "SENTINEL-o", gemini_api_key: "SENTINEL-g", custom_provider_secrets: { p: "SENTINEL-p" } });
  const api = install();
  const spy = jest.spyOn(Storage.prototype, "setItem");
  await maybeMigrateProviderSecrets();
  expect(api.setProviderCredential.mock.calls).toEqual([
    ["provider", "openai", "SENTINEL-o"], ["provider", "gemini", "SENTINEL-g"],
    ["custom_provider", "custom.p", "SENTINEL-p"],
  ]);
  expect(getBootstrapConfiguredCredentials().sort()).toEqual(["custom.p", "gemini", "openai"]);
  expect(localStorage.getItem("settings")).not.toContain("SENTINEL");
  expect(readProviderSecret("openai_api_key")).toBe("SENTINEL-o");
  expect(readCustomProviderSecrets()).toEqual({ p: "SENTINEL-p" });
  for (const [, bytes] of spy.mock.calls) expect(bytes).not.toContain("SENTINEL");
  spy.mockRestore();
  await maybeMigrateProviderSecrets();
  expect(api.setProviderCredential).toHaveBeenCalledTimes(3);
});

test("confirmed encrypted owners win over stale disk mirrors without reencrypting", async () => {
  seed({ openai_api_key: "stale" });
  const api = install({ configured: ["openai"] });
  await maybeMigrateProviderSecrets();
  expect(api.setProviderCredential).not.toHaveBeenCalled();
  expect(localStorage.getItem("settings")).not.toContain("stale");
});

test.each(["no-bridge", "unavailable", "failed-save"])("unacknowledged legacy data survives: %s", async (mode) => {
  seed({ openai_api_key: "SENTINEL" });
  const before = localStorage.getItem("settings");
  if (mode !== "no-bridge") install({ available: mode !== "unavailable",
    set: jest.fn().mockRejectedValue(new Error("[secret_storage_unavailable] test")) });
  await expect(maybeMigrateProviderSecrets()).resolves.toBeUndefined();
  expect(localStorage.getItem("settings")).toBe(before);
  expect(readProviderSecret("openai_api_key")).toBe("SENTINEL");
});

test("rotation during boot migration retains FIFO order and the newest session value", async () => {
  seed({ openai_api_key: "old" });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const set = jest.fn().mockImplementationOnce(() => gate).mockResolvedValue({ ok: true, status: "stored" });
  install({ set });
  const migration = maybeMigrateProviderSecrets();
  const rotation = writeModelProviders({ openai_api_key: "new" });
  release({ ok: true, status: "stored" });
  await Promise.all([migration, rotation]);
  expect(set.mock.calls.map((args) => args[2])).toEqual(["old", "new"]);
  expect(readProviderSecret("openai_api_key")).toBe("new");
  // A pending newest write may defer scrub; a later healthy launch retries.
  expect(localStorage.getItem("settings")).not.toContain("new");
});

test("browser keys remain usable for this session but are never reported as durable", async () => {
  const results = await writeModelProviders({ openai_api_key: "SENTINEL" });
  expect(results[0]).toMatchObject({ ok: false, status: "session-only" });
  expect(readProviderSecret("openai_api_key")).toBe("SENTINEL");
  expect(localStorage.getItem("settings")).toBeNull();
});

test("browser clear removes a lone historical key before acknowledging durable deletion", async () => {
  seed({ openai_api_key: "OLD-SENTINEL" });
  const results = await writeModelProviders({ openai_api_key: "" });
  expect(results[0]).toMatchObject({ ok: true, status: "deleted" });
  expect(localStorage.getItem("settings")).not.toContain("SENTINEL");
  resetProviderSecretSessionForTests();
  expect(readProviderSecret("openai_api_key")).toBe("");
});

test("browser clear does not claim durability when other unacknowledged plaintext prevents scrub", async () => {
  seed({ openai_api_key: "OLD-SENTINEL", gemini_api_key: "OTHER-SENTINEL" });
  const before = localStorage.getItem("settings");
  const results = await writeModelProviders({ openai_api_key: "" });
  expect(results[0].ok).toBe(false);
  expect(localStorage.getItem("settings")).toBe(before);
  expect(readProviderSecret("openai_api_key")).toBe("OLD-SENTINEL");
});
