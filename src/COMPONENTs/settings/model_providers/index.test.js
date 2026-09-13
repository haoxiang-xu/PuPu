import { render, screen } from "@testing-library/react";
import {
  ConfigContext,
  LocaleContext,
} from "../../../CONTAINERs/config/context";
import { ModelProvidersSettings } from "./index";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";
import { SHIPPED_PROVIDERS } from "../../../SERVICEs/shipped_provider_registry";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);
jest.mock("./custom-providers", () => () => (
  <div>Custom Model Providers Feature</div>
));
/* One mock for the one section component — native and shipped providers render
   the same component now (#202), so the mock records which kind it was handed. */
jest.mock("./components/provider_key_section", () => ({ title, sites }) => (
  <div>{`${sites ? "Shipped" : "Native"} Section: ${title}`}</div>
));
jest.mock("./components/active_downloads", () => () => null);
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

const renderSettings = () =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{
          onThemeMode: "light_mode",
          theme: { font: {} },
        }}
      >
        <ModelProvidersSettings />
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

describe("ModelProvidersSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("enable_custom_model_providers gates only user-authored providers", () => {
    test("hides Custom Model Providers when disabled", () => {
      writeFeatureFlags({ enable_custom_model_providers: false });

      renderSettings();

      expect(
        screen.queryByText("Custom Model Providers Feature"),
      ).not.toBeInTheDocument();
    });

    test("shows Custom Model Providers when enabled", () => {
      writeFeatureFlags({ enable_custom_model_providers: true });

      renderSettings();

      expect(
        screen.getByText("Custom Model Providers Feature"),
      ).toBeInTheDocument();
    });

    /* AC-01: the whole point of the ticket — a shipped provider is not an
       experimental custom provider and the flag must not reach it. */
    test.each([false, true])(
      "shipped sections are visible with the flag %s",
      (enabled) => {
        writeFeatureFlags({ enable_custom_model_providers: enabled });

        renderSettings();

        expect(
          screen.getByText("Shipped Section: DeepSeek"),
        ).toBeInTheDocument();
        expect(screen.getByText("Shipped Section: Kimi")).toBeInTheDocument();
      },
    );
  });

  /* AC-08: the surface is rendered FROM the registry. A new shipped provider is
     a registry entry, a preset and an icon — this test fails if someone adds an
     entry that the surface does not render, or hand-writes a section instead. */
  test("renders one section per registry entry, driven by the registry", () => {
    writeFeatureFlags({ enable_custom_model_providers: false });

    renderSettings();

    SHIPPED_PROVIDERS.forEach((provider) => {
      expect(
        screen.getByText(`Shipped Section: ${provider.title}`),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText(/^Shipped Section: /)).toHaveLength(
      SHIPPED_PROVIDERS.length,
    );
  });

  test("native and shipped sections use the same component", () => {
    renderSettings();

    ["OpenAI", "Anthropic", "Gemini"].forEach((title) => {
      expect(screen.getByText(`Native Section: ${title}`)).toBeInTheDocument();
    });
  });

  test("keeps the shipped sections between Gemini and Ollama", () => {
    writeFeatureFlags({ enable_custom_model_providers: false });

    const { container } = renderSettings();

    const html = container.innerHTML;
    const geminiIndex = html.indexOf("Native Section: Gemini");
    const deepseekIndex = html.indexOf("Shipped Section: DeepSeek");
    const kimiIndex = html.indexOf("Shipped Section: Kimi");
    const ollamaIndex = html.indexOf(">Ollama<");

    expect(geminiIndex).toBeGreaterThan(-1);
    expect(deepseekIndex).toBeGreaterThan(geminiIndex);
    expect(kimiIndex).toBeGreaterThan(deepseekIndex);
    expect(ollamaIndex).toBeGreaterThan(kimiIndex);
  });
});
