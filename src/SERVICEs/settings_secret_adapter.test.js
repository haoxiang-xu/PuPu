import {
  PROVIDER_SECRET_FIELDS, SENSITIVE_MODEL_PROVIDER_FIELDS,
  readProviderSecret, writeProviderSecret,
  readCustomProviderSecrets, writeCustomProviderSecrets,
  settingsRootWithoutProviderSecrets, removeMigratedLegacyProviderSecrets,
  resetProviderSecretSessionForTests,
} from "./settings_secret_adapter";

const seed = (root) => localStorage.setItem("settings", JSON.stringify(root));
const root = () => JSON.parse(localStorage.getItem("settings") || "{}");
beforeEach(() => localStorage.clear());

test("official and custom writes are volatile, detached and never serialized", () => {
  seed({ appearance: { theme: "dark" }, model_providers: { custom_providers: [{ id: "p" }] } });
  const before = localStorage.getItem("settings");
  const spy = jest.spyOn(Storage.prototype, "setItem");
  for (const field of PROVIDER_SECRET_FIELDS) {
    expect(writeProviderSecret(field, "SENTINEL-" + field)).toBe(true);
    expect(readProviderSecret(field)).toBe("SENTINEL-" + field);
  }
  expect(writeCustomProviderSecrets({ p: "SENTINEL-custom" })).toBe(true);
  const custom = readCustomProviderSecrets();
  custom.p = "changed";
  expect(readCustomProviderSecrets()).toEqual({ p: "SENTINEL-custom" });
  expect(localStorage.getItem("settings")).toBe(before);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  resetProviderSecretSessionForTests();
  expect(readProviderSecret("openai_api_key")).toBe("");
  expect(readCustomProviderSecrets()).toEqual({});
});

test("legacy import survives verified scrub, preserving other settings and synchronous reads", () => {
  seed({ appearance: { theme: "dark" }, model_providers: {
    openai_api_key: "SENTINEL-o", gemini_api_key: "SENTINEL-g",
    anthropic_api_key: "SENTINEL-a", custom_provider_secrets: { p: "SENTINEL-p" },
    custom_providers: [{ id: "p" }],
  } });
  expect(removeMigratedLegacyProviderSecrets(["openai", "gemini", "anthropic", "custom.p"])).toBe(true);
  expect(root()).toEqual({ appearance: { theme: "dark" }, model_providers: { custom_providers: [{ id: "p" }] } });
  expect(readProviderSecret("gemini_api_key")).toBe("SENTINEL-g");
  expect(readCustomProviderSecrets()).toEqual({ p: "SENTINEL-p" });
  resetProviderSecretSessionForTests();
  expect(readProviderSecret("gemini_api_key")).toBe("");
});

test("incomplete migration never reserializes plaintext or loses the last recoverable copy", () => {
  seed({ model_providers: { openai_api_key: "SENTINEL-o", custom_provider_secrets: { p: "SENTINEL-p" } } });
  const before = localStorage.getItem("settings");
  const spy = jest.spyOn(Storage.prototype, "setItem");
  expect(removeMigratedLegacyProviderSecrets(["openai"])).toBe(false);
  expect(() => settingsRootWithoutProviderSecrets({ app: { setup: true } })).toThrow(/migration_pending/);
  expect(localStorage.getItem("settings")).toBe(before);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  expect(readCustomProviderSecrets()).toEqual({ p: "SENTINEL-p" });
});

test("a newer session rotation or clear cannot be overwritten by legacy re-import", () => {
  seed({ model_providers: { openai_api_key: "old", custom_provider_secrets: { p: "old-custom" } } });
  writeProviderSecret("openai_api_key", "new");
  writeCustomProviderSecrets({});
  expect(removeMigratedLegacyProviderSecrets(["openai", "custom.p"])).toBe(true);
  expect(readProviderSecret("openai_api_key")).toBe("new");
  expect(readCustomProviderSecrets()).toEqual({});
  writeProviderSecret("openai_api_key", "");
  expect(readProviderSecret("openai_api_key")).toBe("");
});

test("serializer rejects all four injected fields, preserving safe namespaces", () => {
  const unsafe = { ui: { open: true }, model_providers: { label: "p" } };
  for (const field of SENSITIVE_MODEL_PROVIDER_FIELDS) unsafe.model_providers[field] = "SENTINEL";
  expect(settingsRootWithoutProviderSecrets(unsafe)).toEqual({ ui: { open: true }, model_providers: { label: "p" } });
  expect(unsafe.model_providers.openai_api_key).toBe("SENTINEL");
});

test.each([null, 123, {}, undefined])("non-string official values stay inert: %p", (value) => {
  expect(writeProviderSecret("openai_api_key", value)).toBe(true);
  expect(readProviderSecret("openai_api_key")).toBe("");
  expect(localStorage.getItem("settings")).toBeNull();
});

test.each(["{invalid", "[1,2]", "42"])("corrupt/non-object roots are never clobbered: %s", (raw) => {
  localStorage.setItem("settings", raw);
  expect(readProviderSecret("openai_api_key")).toBe("");
  expect(writeProviderSecret("openai_api_key", "SENTINEL")).toBe(false);
  expect(removeMigratedLegacyProviderSecrets(["openai"])).toBe(false);
  expect(writeCustomProviderSecrets({ p: "SENTINEL" }, { repairCorruptRoot: true })).toBe(true);
  expect(readCustomProviderSecrets()).toEqual({ p: "SENTINEL" });
  expect(localStorage.getItem("settings")).toBe(raw);
});

test("a failed scrub retains old bytes and session values for retry", () => {
  seed({ model_providers: { openai_api_key: "SENTINEL" } });
  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(removeMigratedLegacyProviderSecrets(["openai"])).toBe(false);
  expect(readProviderSecret("openai_api_key")).toBe("SENTINEL");
  spy.mockRestore();
  expect(removeMigratedLegacyProviderSecrets(["openai"])).toBe(true);
});

test("unknown official fields are rejected and circular custom inputs are refused", () => {
  expect(() => writeProviderSecret("other", "SENTINEL")).toThrow(/unknown/);
  expect(() => readProviderSecret("custom_provider_secrets")).toThrow(/unknown/);
  const circular = {}; circular.self = circular;
  expect(writeCustomProviderSecrets(circular)).toBe(false);
});
