import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { ModelProvidersModal, MODEL_PROVIDERS_MODAL_ID } from "./model_providers_modal";
import { getModalRegistry } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";

/* ── collaborators the rail/panes read ─────────────────────────────────── */

jest.mock("../../SERVICEs/provider_secret_status", () => ({
  __esModule: true,
  providerSecretConfigured: jest.fn(() => false),
}));

jest.mock("../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  customProviderKey: (slug) => `custom.${slug}`,
  hasCustomProviderSecret: jest.fn(() => false),
  readCustomProviders: jest.fn(() => []),
  findCustomProvider: jest.fn(() => null),
  setCustomProviderSecret: jest.fn(() => Promise.resolve({ ok: true })),
  removeCustomProviderSecret: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../SERVICEs/feature_flags", () => ({
  __esModule: true,
  isFeatureFlagEnabled: jest.fn(() => false),
}));

let mockRefreshListeners = [];
jest.mock("../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  emitModelCatalogRefresh: jest.fn(),
  subscribeModelCatalogRefresh: (fn) => {
    mockRefreshListeners.push(fn);
    return () => {
      mockRefreshListeners = mockRefreshListeners.filter((l) => l !== fn);
    };
  },
}));

jest.mock("../settings/model_providers/storage", () => ({
  __esModule: true,
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(() => Promise.resolve([{ ok: true }])),
}));

const mockOllamaState = { status: "offline", models: [] };
jest.mock("../settings/local_storage/hooks/use_ollama_installed", () => ({
  __esModule: true,
  useOllamaInstalled: () => ({
    status: mockOllamaState.status,
    models: mockOllamaState.models,
    hasOllamaBridge: false,
    load: jest.fn(),
    restart: jest.fn(),
    removeLocally: jest.fn(),
  }),
}));

/* Heavy panes are not under test here — the routing to them is. */
jest.mock("./panes/ollama_pane", () => ({
  __esModule: true,
  OllamaPane: () => <div data-testid="ollama-pane" />,
}));
jest.mock("./panes/custom_provider_pane", () => ({
  __esModule: true,
  CustomProviderPane: ({ entry }) => (
    <div data-testid={`custom-provider-pane-${entry.provider.id}`} />
  ),
}));
jest.mock("./panes/add_provider_pane", () => ({
  __esModule: true,
  AddProviderPane: () => <div data-testid="add-provider-pane" />,
}));

jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

/* The real Modal portals and animates; the shell's lifecycle registration is
   what we assert, so the Modal itself becomes a plain gate. */
jest.mock("../../BUILTIN_COMPONENTs/modal/modal", () => ({
  __esModule: true,
  default: ({ open, children }) => (open ? <div role="dialog">{children}</div> : null),
}));

const { providerSecretConfigured } = require("../../SERVICEs/provider_secret_status");
const {
  readCustomProviders,
  findCustomProvider,
} = require("../../SERVICEs/custom_provider_store");
const { isFeatureFlagEnabled } = require("../../SERVICEs/feature_flags");

const renderModal = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
      <ModelProvidersModal open onClose={() => {}} {...props} />
    </ConfigContext.Provider>,
  );

const flushLazy = async () => {
  await screen.findByTestId("provider-rail");
};

const clickRailRow = (id) =>
  fireEvent.click(within(screen.getByTestId(`provider-rail-row-${id}`)).getByRole("button"));

beforeEach(() => {
  mockRefreshListeners = [];
  mockOllamaState.status = "offline";
  mockOllamaState.models = [];
  providerSecretConfigured.mockReset().mockReturnValue(false);
  readCustomProviders.mockReset().mockReturnValue([]);
  findCustomProvider.mockReset().mockReturnValue(null);
  isFeatureFlagEnabled.mockReset().mockReturnValue(false);
});

describe("ModelProvidersModal shell", () => {
  test("registers in the modal registry while open (Test API modal_open)", async () => {
    const { rerender } = renderModal();
    await flushLazy();
    expect(getModalRegistry().openIds()).toContain(MODEL_PROVIDERS_MODAL_ID);

    rerender(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
        <ModelProvidersModal open={false} onClose={() => {}} />
      </ConfigContext.Provider>,
    );
    expect(getModalRegistry().openIds()).not.toContain(MODEL_PROVIDERS_MODAL_ID);
  });

  test("renders the rail in registry order with B1 dots", async () => {
    providerSecretConfigured.mockImplementation((id) => id === "anthropic" || id === "custom.deepseek");
    renderModal();
    await flushLazy();

    const rows = screen.getAllByTestId(/^provider-rail-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "provider-rail-row-openai",
      "provider-rail-row-anthropic",
      "provider-rail-row-gemini",
      "provider-rail-row-deepseek",
      "provider-rail-row-kimi",
      "provider-rail-row-ollama",
    ]);
    expect(screen.getByTestId("provider-rail-row-anthropic").dataset.configured).toBe("true");
    expect(screen.getByTestId("provider-rail-row-deepseek").dataset.configured).toBe("true");
    expect(screen.getByTestId("provider-rail-row-openai").dataset.configured).toBe("false");
    expect(screen.getByTestId("provider-rail-row-ollama").dataset.configured).toBe("false");
    expect(screen.queryByText("model_providers.page.rail_custom")).toBeNull();
  });

  test("nothing configured → welcome pane (G3), and its path lands on a key provider", async () => {
    renderModal();
    await flushLazy();
    expect(screen.getByTestId("model-providers-welcome")).toBeInTheDocument();
    expect(screen.queryByTestId("provider-key-section-openai_api_key")).toBeNull();

    fireEvent.click(screen.getByText("model_providers.page.path_key_action"));
    expect(screen.queryByTestId("model-providers-welcome")).toBeNull();
    expect(screen.getByTestId("provider-key-section-openai_api_key")).toBeInTheDocument();
    expect(screen.getByTestId("provider-rail-row-openai").dataset.selected).toBe("true");
  });

  test("welcome's local path opens the Ollama pane", async () => {
    renderModal();
    await flushLazy();
    fireEvent.click(screen.getByText("model_providers.page.path_local_open"));
    expect(screen.getByTestId("ollama-pane")).toBeInTheDocument();
  });

  test("opens on the first configured provider and never on welcome once one is lit", async () => {
    providerSecretConfigured.mockImplementation((id) => id === "custom.kimi-cn");
    renderModal();
    await flushLazy();
    expect(screen.queryByTestId("model-providers-welcome")).toBeNull();
    expect(screen.getByTestId("provider-rail-row-kimi").dataset.selected).toBe("true");
    expect(screen.getByTestId("provider-key-section-kimi")).toBeInTheDocument();
  });

  test("initialEntryId wins over the default selection", async () => {
    providerSecretConfigured.mockImplementation((id) => id === "anthropic");
    renderModal({ initialEntryId: "gemini" });
    await flushLazy();
    expect(screen.getByTestId("provider-rail-row-gemini").dataset.selected).toBe("true");
    expect(screen.getByTestId("provider-key-section-gemini_api_key")).toBeInTheDocument();
  });

  test("clicking a rail row swaps the pane; key panes carry the get-key link", async () => {
    providerSecretConfigured.mockImplementation((id) => id === "openai");
    renderModal();
    await flushLazy();
    clickRailRow("anthropic");
    expect(screen.getByTestId("provider-key-section-anthropic_api_key")).toBeInTheDocument();
    expect(screen.getByTestId("provider-key-url").getAttribute("href")).toBe(
      "https://console.anthropic.com/settings/keys",
    );
  });

  test("a catalog refresh (key saved elsewhere) relights the rail without reopening (SEQ-001)", async () => {
    renderModal();
    await flushLazy();
    expect(screen.getByTestId("provider-rail-row-gemini").dataset.configured).toBe("false");

    providerSecretConfigured.mockImplementation((id) => id === "gemini");
    act(() => {
      mockRefreshListeners.forEach((fn) => fn());
    });
    expect(screen.getByTestId("provider-rail-row-gemini").dataset.configured).toBe("true");
  });

  test("welcome gives way when Ollama comes up after the first render (AC-06)", async () => {
    renderModal();
    await flushLazy();
    expect(screen.getByTestId("model-providers-welcome")).toBeInTheDocument();

    mockOllamaState.status = "ready";
    act(() => {
      mockRefreshListeners.forEach((fn) => fn());
    });
    expect(screen.queryByTestId("model-providers-welcome")).toBeNull();
    expect(screen.getByTestId("ollama-pane")).toBeInTheDocument();
    expect(screen.getByTestId("provider-rail-row-ollama").dataset.selected).toBe("true");
  });

  test("Ollama service ready lights the Ollama dot", async () => {
    mockOllamaState.status = "ready";
    renderModal();
    await flushLazy();
    expect(screen.getByTestId("provider-rail-row-ollama").dataset.configured).toBe("true");
    // Ollama ready counts as configured → no welcome, Ollama selected.
    expect(screen.queryByTestId("model-providers-welcome")).toBeNull();
    expect(screen.getByTestId("ollama-pane")).toBeInTheDocument();
  });

  test("flag on: custom group with one row per provider plus Add; routes to their panes", async () => {
    isFeatureFlagEnabled.mockImplementation((f) => f === "enable_custom_model_providers");
    readCustomProviders.mockReturnValue([
      { id: "hyperspace", display_name: "Hyperspace", enabled: true, auth: { mode: "none" } },
    ]);
    findCustomProvider.mockImplementation((slug) =>
      slug === "hyperspace"
        ? { id: "hyperspace", display_name: "Hyperspace", enabled: true, auth: { mode: "none" } }
        : null,
    );
    renderModal();
    await flushLazy();

    expect(screen.getByText("model_providers.page.rail_custom")).toBeInTheDocument();
    expect(screen.getByTestId("provider-rail-row-custom:hyperspace").dataset.configured).toBe("true");
    // auth none + enabled → configured → it is the default selection.
    expect(screen.getByTestId("custom-provider-pane-hyperspace")).toBeInTheDocument();

    clickRailRow("custom:add");
    expect(screen.getByTestId("add-provider-pane")).toBeInTheDocument();
  });

  test("flag off (AC-09 negative): no custom group, no Add entry, even with stored definitions", async () => {
    readCustomProviders.mockReturnValue([
      { id: "hyperspace", display_name: "Hyperspace", enabled: true, auth: { mode: "none" } },
    ]);
    renderModal();
    await flushLazy();
    expect(screen.queryByTestId("provider-rail-row-custom:hyperspace")).toBeNull();
    expect(screen.queryByTestId("provider-rail-row-custom:add")).toBeNull();
    expect(readCustomProviders).not.toHaveBeenCalled();
  });
});
