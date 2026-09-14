import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import ProviderKeySection from "./provider_key_section";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { writeModelProviders } from "../storage";
import { providerSecretConfigured } from "../../../../SERVICEs/provider_secret_status";
import {
  setCustomProviderSecret,
  removeCustomProviderSecret,
} from "../../../../SERVICEs/custom_provider_store";
import { SHIPPED_PROVIDERS } from "../../../../SERVICEs/shipped_provider_registry";

jest.mock("../storage", () => ({
  __esModule: true,
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(() => Promise.resolve([{ ok: true }])),
}));

jest.mock("../../../../SERVICEs/provider_secret_status", () => ({
  __esModule: true,
  providerSecretConfigured: jest.fn(() => false),
}));

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  customProviderKey: (slug) => `custom.${slug}`,
  setCustomProviderSecret: jest.fn(() => Promise.resolve({ ok: true })),
  removeCustomProviderSecret: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  emitModelCatalogRefresh: jest.fn(),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderSection = (props) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <ProviderKeySection {...props} />
    </ConfigContext.Provider>,
  );

const nativeProps = {
  title: "OpenAI",
  icon: "open_ai",
  storage_key: "openai_api_key",
  credential_id: "openai",
  placeholder: "sk-...",
};

const kimi = SHIPPED_PROVIDERS.find((p) => p.id === "kimi");
const shippedProps = {
  title: kimi.title,
  icon: kimi.icon,
  sites: kimi.sites,
  placeholder: kimi.placeholder,
};

beforeEach(() => {
  jest.clearAllMocks();
  writeModelProviders.mockResolvedValue([{ ok: true }]);
  setCustomProviderSecret.mockResolvedValue({ ok: true });
  removeCustomProviderSecret.mockResolvedValue({ ok: true });
  providerSecretConfigured.mockReturnValue(false);
});

describe("empty state", () => {
  test("shows the key field, no saved row", () => {
    const { container } = renderSection(nativeProps);

    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.queryByTestId("provider-key-saved-row")).toBeNull();
  });

  test("Save is disabled until something is typed", () => {
    const { container } = renderSection(nativeProps);

    expect(
      screen.getByRole("button", { name: "model_providers.save" }),
    ).toBeDisabled();

    fireEvent.change(container.querySelector('input[type="password"]'), {
      target: { value: "sk-live" },
    });

    expect(
      screen.getByRole("button", { name: "model_providers.save" }),
    ).not.toBeDisabled();
  });
});

/* Design pick A3: at rest a configured key is a flat settings row, not a field. */
describe("saved state (A3)", () => {
  test("renders the flat row with Replace and Clear", () => {
    providerSecretConfigured.mockImplementation((id) => id === "openai");

    const { container } = renderSection(nativeProps);

    expect(screen.getByTestId("provider-key-saved-row")).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "model_providers.replace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "model_providers.clear" }),
    ).toBeInTheDocument();
  });

  /* In the Phase 4 steady state the secret is encrypted in SQL and is not
     readable here at all, so the mask is fixed rather than derived from the key
     — a mask that is sometimes real is worse than one that never is. */
  test("the mask is fixed and no key material is rendered", () => {
    providerSecretConfigured.mockImplementation((id) => id === "openai");

    const { container } = renderSection(nativeProps);

    expect(screen.getByText("••••••••")).toBeInTheDocument();
    expect(container.textContent).not.toContain("sk-");
  });

  test("Replace reveals the field and Cancel returns to the row", () => {
    providerSecretConfigured.mockImplementation((id) => id === "openai");

    const { container } = renderSection(nativeProps);

    fireEvent.click(
      screen.getByRole("button", { name: "model_providers.replace" }),
    );
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.queryByTestId("provider-key-saved-row")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.getByTestId("provider-key-saved-row")).toBeInTheDocument();
  });
});

describe("native credential backend", () => {
  test("Save writes through writeModelProviders and shows the saved row", async () => {
    const { container } = renderSection(nativeProps);

    fireEvent.change(container.querySelector('input[type="password"]'), {
      target: { value: "  sk-live  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "model_providers.save" }));

    await waitFor(() =>
      expect(writeModelProviders).toHaveBeenCalledWith({
        openai_api_key: "sk-live",
      }),
    );
    await screen.findByTestId("provider-key-saved-row");
    expect(setCustomProviderSecret).not.toHaveBeenCalled();
  });

  test("a write that is not durably acknowledged does not claim success", async () => {
    writeModelProviders.mockResolvedValue([{ ok: false }]);

    const { container } = renderSection(nativeProps);

    fireEvent.change(container.querySelector('input[type="password"]'), {
      target: { value: "sk-live" },
    });
    fireEvent.click(screen.getByRole("button", { name: "model_providers.save" }));

    await waitFor(() => expect(writeModelProviders).toHaveBeenCalled());
    expect(screen.queryByTestId("provider-key-saved-row")).toBeNull();
  });
});

describe("shipped credential backend", () => {
  test("Save writes the secret for the selected site only", async () => {
    const { container } = renderSection(shippedProps);

    fireEvent.change(container.querySelector('input[type="password"]'), {
      target: { value: "sk-kimi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "model_providers.save" }));

    await waitFor(() =>
      expect(setCustomProviderSecret).toHaveBeenCalledWith("kimi", "sk-kimi"),
    );
    // No definition is written: the app owns a shipped provider's definition.
    expect(writeModelProviders).not.toHaveBeenCalled();
  });

  test("Clear removes only the secret", async () => {
    providerSecretConfigured.mockImplementation((id) => id === "custom.kimi");

    renderSection(shippedProps);

    fireEvent.click(
      screen.getByRole("button", { name: "model_providers.clear" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));

    await waitFor(() =>
      expect(removeCustomProviderSecret).toHaveBeenCalledWith("kimi"),
    );
  });
});

/* Design pick B2: Kimi's two platforms are a labelled Select row. */
describe("platform select (B2)", () => {
  test("a multi-site provider renders the Platform row", () => {
    renderSection(shippedProps);

    expect(screen.getByText("model_providers.platform")).toBeInTheDocument();
    expect(
      screen.getByTestId("provider-key-platform-select"),
    ).toBeInTheDocument();
  });

  test("a single-site provider renders no switcher", () => {
    const deepseek = SHIPPED_PROVIDERS.find((p) => p.id === "deepseek");

    renderSection({
      title: deepseek.title,
      icon: deepseek.icon,
      sites: deepseek.sites,
      placeholder: deepseek.placeholder,
    });

    expect(screen.queryByText("model_providers.platform")).toBeNull();
    expect(screen.queryByTestId("provider-key-platform-select")).toBeNull();
  });

  test("a native provider renders no switcher", () => {
    renderSection(nativeProps);

    expect(screen.queryByTestId("provider-key-platform-select")).toBeNull();
  });

  test("the trigger shows the human label and the derived host", () => {
    renderSection(shippedProps);

    expect(
      screen.getByTestId("provider-key-platform-select").textContent,
    ).toContain("api.moonshot.ai");
  });

  /* Each site has its own key: switching must never carry the other site's
     state — or a typed value — across. */
  test("each site keeps its own saved state", () => {
    providerSecretConfigured.mockImplementation((id) => id === "custom.kimi");

    renderSection(shippedProps);
    expect(screen.getByTestId("provider-key-saved-row")).toBeInTheDocument();

    providerSecretConfigured.mockImplementation((id) => id === "custom.kimi-cn");
    renderSection({ ...shippedProps, sites: [kimi.sites[1], kimi.sites[0]] });

    expect(screen.getAllByTestId("provider-key-saved-row")).toHaveLength(2);
  });
});
