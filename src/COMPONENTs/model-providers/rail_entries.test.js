import {
  ADD_CUSTOM_RAIL_ID,
  OLLAMA_RAIL_ID,
  RAIL_KIND,
  buildProviderRailEntries,
  customRailId,
  defaultRailSelection,
  hasConfiguredProvider,
} from "./rail_entries";

jest.mock("../../SERVICEs/provider_secret_status", () => ({
  providerSecretConfigured: jest.fn(() => false),
}));

jest.mock("../../SERVICEs/custom_provider_store", () => ({
  customProviderKey: (slug) => `custom.${slug}`,
  hasCustomProviderSecret: jest.fn(() => false),
  readCustomProviders: jest.fn(() => []),
}));

jest.mock("../../SERVICEs/feature_flags", () => ({
  isFeatureFlagEnabled: jest.fn(() => false),
}));

const { providerSecretConfigured } = require("../../SERVICEs/provider_secret_status");
const {
  hasCustomProviderSecret,
  readCustomProviders,
} = require("../../SERVICEs/custom_provider_store");
const { isFeatureFlagEnabled } = require("../../SERVICEs/feature_flags");

const ids = (entries) => entries.map((e) => e.id);

beforeEach(() => {
  providerSecretConfigured.mockReset().mockReturnValue(false);
  hasCustomProviderSecret.mockReset().mockReturnValue(false);
  readCustomProviders.mockReset().mockReturnValue([]);
  isFeatureFlagEnabled.mockReset().mockReturnValue(false);
});

describe("buildProviderRailEntries", () => {
  test("orders native → shipped → ollama, no custom group while the flag is off", () => {
    const entries = buildProviderRailEntries();
    expect(ids(entries)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "deepseek",
      "kimi",
      OLLAMA_RAIL_ID,
    ]);
    expect(entries.map((e) => e.kind)).toEqual([
      RAIL_KIND.NATIVE,
      RAIL_KIND.NATIVE,
      RAIL_KIND.NATIVE,
      RAIL_KIND.SHIPPED,
      RAIL_KIND.SHIPPED,
      RAIL_KIND.OLLAMA,
    ]);
    expect(entries.some((e) => e.kind === RAIL_KIND.ADD_CUSTOM)).toBe(false);
  });

  test("native dot follows providerSecretConfigured for that credential id", () => {
    providerSecretConfigured.mockImplementation((id) => id === "anthropic");
    const entries = buildProviderRailEntries();
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    expect(byId.openai.configured).toBe(false);
    expect(byId.anthropic.configured).toBe(true);
    expect(byId.gemini.configured).toBe(false);
  });

  test("shipped dot is lit when ANY of its sites has a key (Kimi global or China)", () => {
    providerSecretConfigured.mockImplementation((id) => id === "custom.kimi-cn");
    const entries = buildProviderRailEntries();
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    expect(byId.kimi.configured).toBe(true);
    expect(byId.deepseek.configured).toBe(false);
  });

  test("ollama dot is the passed-in service state", () => {
    expect(
      buildProviderRailEntries({ ollamaReady: true }).find((e) => e.id === OLLAMA_RAIL_ID)
        .configured,
    ).toBe(true);
    expect(
      buildProviderRailEntries({ ollamaReady: false }).find((e) => e.id === OLLAMA_RAIL_ID)
        .configured,
    ).toBe(false);
  });

  test("custom group: one entry per user-authored provider plus Add, gated by the flag", () => {
    isFeatureFlagEnabled.mockImplementation((flag) => flag === "enable_custom_model_providers");
    readCustomProviders.mockReturnValue([
      { id: "hyperspace", display_name: "Hyperspace", enabled: true, auth: { mode: "x-api-key" } },
      { id: "local-gw", display_name: "", enabled: true, auth: { mode: "none" } },
      { id: "off", display_name: "Off", enabled: false, auth: { mode: "none" } },
    ]);
    hasCustomProviderSecret.mockImplementation((slug) => slug === "hyperspace");

    const entries = buildProviderRailEntries();
    const tail = entries.slice(entries.findIndex((e) => e.id === OLLAMA_RAIL_ID) + 1);
    expect(ids(tail)).toEqual([
      customRailId("hyperspace"),
      customRailId("local-gw"),
      customRailId("off"),
      ADD_CUSTOM_RAIL_ID,
    ]);
    expect(tail[0].title).toBe("Hyperspace");
    expect(tail[0].configured).toBe(true);
    // auth none needs no secret
    expect(tail[1].title).toBe("local-gw");
    expect(tail[1].configured).toBe(true);
    // disabled is never lit even with auth none
    expect(tail[2].configured).toBe(false);
    expect(tail[3].kind).toBe(RAIL_KIND.ADD_CUSTOM);
    expect(tail[3].configured).toBeNull();
  });

  test("customEnabled option overrides the flag without touching the flag reader", () => {
    const entries = buildProviderRailEntries({ customEnabled: true });
    expect(entries[entries.length - 1].id).toBe(ADD_CUSTOM_RAIL_ID);
    expect(isFeatureFlagEnabled).not.toHaveBeenCalled();
  });

  test("a registry fixture with one more shipped provider renders one more entry — no code branch (#202 AC-08)", () => {
    const fixture = [
      {
        id: "acme",
        title: "Acme",
        icon: "server",
        placeholder: "ak-...",
        sites: [{ slug: "acme" }],
      },
      {
        id: "duo",
        title: "Duo",
        icon: "server",
        placeholder: "dk-...",
        sites: [{ slug: "duo-a" }, { slug: "duo-b" }],
      },
    ];
    providerSecretConfigured.mockImplementation((id) => id === "custom.duo-b");
    const entries = buildProviderRailEntries({ shippedProviders: fixture });
    const shipped = entries.filter((e) => e.kind === RAIL_KIND.SHIPPED);
    expect(shipped.map((e) => [e.id, e.title, e.configured])).toEqual([
      ["acme", "Acme", false],
      ["duo", "Duo", true],
    ]);
    expect(shipped[1].provider).toBe(fixture[1]);
  });

  test("a native fixture is honoured the same way", () => {
    const entries = buildProviderRailEntries({
      nativeProviders: [{ id: "x", title: "X", icon: "server", credential_id: "x" }],
      shippedProviders: [],
    });
    expect(ids(entries)).toEqual(["x", OLLAMA_RAIL_ID]);
  });
});

describe("hasConfiguredProvider / defaultRailSelection", () => {
  test("welcome condition: nothing lit, including Ollama", () => {
    const entries = buildProviderRailEntries({ ollamaReady: false });
    expect(hasConfiguredProvider(entries)).toBe(false);
    expect(defaultRailSelection(entries)).toBe("openai");
  });

  test("opens on the first configured entry", () => {
    providerSecretConfigured.mockImplementation((id) => id === "custom.deepseek");
    const entries = buildProviderRailEntries({ ollamaReady: true });
    expect(hasConfiguredProvider(entries)).toBe(true);
    expect(defaultRailSelection(entries)).toBe("deepseek");
  });

  test("an Add entry (configured null) never counts as configured", () => {
    const entries = buildProviderRailEntries({ customEnabled: true });
    expect(hasConfiguredProvider(entries)).toBe(false);
  });
});
