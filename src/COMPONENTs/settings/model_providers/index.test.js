import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  ConfigContext,
  LocaleContext,
} from "../../../CONTAINERs/config/context";
import { ModelProvidersSettings, OllamaLibraryBrowser } from "./index";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);
jest.mock("./hooks/use_ollama_library", () => ({
  useOllamaLibrary: () => ({
    category: "",
    setCategory: jest.fn(),
    rawQuery: "",
    setRawQuery: jest.fn(),
    models: [],
    loading: false,
    error: null,
    installedNames: new Set(),
    pullingMap: {},
    handlePull: jest.fn(),
    handleCancel: jest.fn(),
    retrySearch: jest.fn(),
  }),
}));

/* ── collaborators the accordion reads (#204 R5) ───────────────────────────
   Same buildProviderRailEntries() the wide layer's rail uses, so these are
   mocked the way model_providers_modal.test.js mocks them — the two
   surfaces must never disagree about which row is lit. */
jest.mock("../../../SERVICEs/provider_secret_status", () => ({
  __esModule: true,
  providerSecretConfigured: jest.fn(() => false),
}));

jest.mock("../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  customProviderKey: (slug) => `custom.${slug}`,
  hasCustomProviderSecret: jest.fn(() => false),
  readCustomProviders: jest.fn(() => []),
  findCustomProvider: jest.fn(() => null),
  setCustomProviderSecret: jest.fn(() => Promise.resolve({ ok: true })),
  removeCustomProviderSecret: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../../SERVICEs/feature_flags", () => ({
  __esModule: true,
  isFeatureFlagEnabled: jest.fn(() => false),
}));

jest.mock("../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  emitModelCatalogRefresh: jest.fn(),
  subscribeModelCatalogRefresh: () => () => {},
}));

jest.mock("./storage", () => ({
  __esModule: true,
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(() => Promise.resolve([{ ok: true }])),
}));

const mockOllamaState = { status: "offline" };
jest.mock("../local_storage/hooks/use_ollama_installed", () => ({
  __esModule: true,
  useOllamaInstalled: () => ({
    status: mockOllamaState.status,
    models: [],
    hasOllamaBridge: false,
    load: jest.fn(),
    restart: jest.fn(),
    removeLocally: jest.fn(),
  }),
}));

/* Custom-provider building blocks: presentation-only stand-ins, the same
   contract custom_panes.test.js gives them for the wide layer's panes — the
   accordion's WIRING to them is under test here, not their own internals. */
jest.mock("./custom-providers/custom_provider_list", () => ({
  __esModule: true,
  CustomProviderRow: ({ provider }) => (
    <div data-testid={`custom-provider-row-${provider.id}`}>
      {provider.display_name || provider.id}
    </div>
  ),
}));
jest.mock("./custom-providers/custom_provider_editor", () => ({
  __esModule: true,
  default: ({ open, slug }) =>
    open ? (
      <div data-testid="custom-provider-editor" data-slug={slug || ""} />
    ) : null,
}));
jest.mock("./custom-providers/custom_provider_import_modal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./custom-providers/preset_picker", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./custom-providers/export_provider", () => ({
  __esModule: true,
  exportCustomProvider: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

const {
  providerSecretConfigured,
} = require("../../../SERVICEs/provider_secret_status");
const {
  readCustomProviders,
} = require("../../../SERVICEs/custom_provider_store");
const { isFeatureFlagEnabled } = require("../../../SERVICEs/feature_flags");

const renderWithProviders = (ui) =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{
          onThemeMode: "light_mode",
          theme: { font: {} },
        }}
      >
        {ui}
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

const renderBrowser = () =>
  renderWithProviders(<OllamaLibraryBrowser isDark={false} />);

const renderSettings = (props = {}) =>
  renderWithProviders(<ModelProvidersSettings {...props} />);

/* Retirement of ModelProvidersSettings (#204 S2): the settings-page surface
   is gone (the model providers page now lives behind ModelProvidersModal),
   but OllamaLibraryBrowser stays exported from here — ollama_pane.js still
   imports it. This just confirms the browser still renders on its own.

   #204 R5 brought ModelProvidersSettings back as the N1 accordion below —
   it shares this file only because it shares the export, not the surface. */
describe("OllamaLibraryBrowser", () => {
  test("renders its model search input", () => {
    renderBrowser();

    expect(
      screen.getByPlaceholderText("Search models…"),
    ).toBeInTheDocument();
  });
});

describe("ModelProvidersSettings (N1 accordion, #204 R5)", () => {
  beforeEach(() => {
    mockOllamaState.status = "offline";
    providerSecretConfigured.mockReset().mockReturnValue(false);
    readCustomProviders.mockReset().mockReturnValue([]);
    isFeatureFlagEnabled.mockReset().mockReturnValue(false);
  });

  test("renders one row per rail entry, in rail order", () => {
    renderSettings();

    const rows = screen.getAllByTestId(/^model-providers-settings-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "model-providers-settings-row-openai",
      "model-providers-settings-row-anthropic",
      "model-providers-settings-row-gemini",
      "model-providers-settings-row-deepseek",
      "model-providers-settings-row-kimi",
      "model-providers-settings-row-ollama",
    ]);
  });

  test("expanding a native row shows its key control; only one row is open at a time", () => {
    renderSettings();
    expect(
      screen.queryByTestId("provider-key-section-openai_api_key"),
    ).toBeNull();

    fireEvent.click(screen.getByTestId("model-providers-settings-row-openai"));
    expect(
      screen.getByTestId("provider-key-section-openai_api_key"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("model-providers-settings-row-anthropic"),
    );
    expect(
      screen.queryByTestId("provider-key-section-openai_api_key"),
    ).toBeNull();
    expect(
      screen.getByTestId("provider-key-section-anthropic_api_key"),
    ).toBeInTheDocument();

    // Clicking the already-open row closes it instead of leaving it open.
    fireEvent.click(
      screen.getByTestId("model-providers-settings-row-anthropic"),
    );
    expect(
      screen.queryByTestId("provider-key-section-anthropic_api_key"),
    ).toBeNull();
  });

  test("a configured native provider reads Ready, an unconfigured one reads No key", () => {
    providerSecretConfigured.mockImplementation((id) => id === "anthropic");
    renderSettings();

    expect(
      within(
        screen.getByTestId("model-providers-settings-row-anthropic"),
      ).getByText("Ready"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByTestId("model-providers-settings-row-openai"),
      ).getByText("No key"),
    ).toBeInTheDocument();
  });

  test('Ollama row shows its status and "Open in Models" calls onOpenModelProviders("ollama")', () => {
    mockOllamaState.status = "ready";
    const onOpenModelProviders = jest.fn();
    renderSettings({ onOpenModelProviders });

    expect(
      within(
        screen.getByTestId("model-providers-settings-row-ollama"),
      ).getByText("running"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("model-providers-settings-row-ollama"));
    fireEvent.click(screen.getByText("Open in Models"));
    expect(onOpenModelProviders).toHaveBeenCalledWith("ollama");
  });

  test("flag off (AC-12 negative): no Custom caption and no custom/Add rows, even with stored definitions", () => {
    readCustomProviders.mockReturnValue([
      {
        id: "hyperspace",
        display_name: "Hyperspace",
        enabled: true,
        auth: { mode: "none" },
      },
    ]);
    renderSettings();

    expect(screen.queryByText("Custom")).toBeNull();
    expect(
      screen.queryByTestId("model-providers-settings-row-custom:hyperspace"),
    ).toBeNull();
    expect(
      screen.queryByTestId("model-providers-settings-row-custom:add"),
    ).toBeNull();
  });

  test("flag on: Custom caption, one row per custom provider, and an Add provider row", () => {
    isFeatureFlagEnabled.mockImplementation(
      (f) => f === "enable_custom_model_providers",
    );
    readCustomProviders.mockReturnValue([
      {
        id: "hyperspace",
        display_name: "Hyperspace",
        enabled: true,
        auth: { mode: "none" },
      },
    ]);
    renderSettings();

    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(
      screen.getByTestId("model-providers-settings-row-custom:hyperspace"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("model-providers-settings-row-custom:add"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("model-providers-settings-row-custom:add"),
    );
    expect(
      screen.getByTestId("model-providers-settings-add-body"),
    ).toBeInTheDocument();
  });
});
