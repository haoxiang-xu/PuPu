import { render, screen } from "@testing-library/react";
import {
  ConfigContext,
  LocaleContext,
} from "../../../CONTAINERs/config/context";
import { ModelProvidersSettings } from "./index";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);
jest.mock("./custom-providers", () => () => (
  <div>Custom Model Providers Feature</div>
));
jest.mock("./components/api_key_input", () => () => null);
jest.mock("./components/preset_provider_section", () => ({ title }) => (
  <div>{`Preset Provider Section: ${title}`}</div>
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

describe("ModelProvidersSettings custom provider feature flag", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  test("hides DeepSeek and Kimi preset sections when disabled", () => {
    writeFeatureFlags({ enable_custom_model_providers: false });

    renderSettings();

    expect(
      screen.queryByText("Preset Provider Section: DeepSeek"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preset Provider Section: Kimi"),
    ).not.toBeInTheDocument();
  });

  test("shows DeepSeek and Kimi preset sections, positioned between Anthropic and Ollama", () => {
    writeFeatureFlags({ enable_custom_model_providers: true });

    const { container } = renderSettings();

    expect(
      screen.getByText("Preset Provider Section: DeepSeek"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preset Provider Section: Kimi"),
    ).toBeInTheDocument();

    const html = container.innerHTML;
    const anthropicIndex = html.indexOf("Anthropic");
    const deepseekIndex = html.indexOf("Preset Provider Section: DeepSeek");
    const kimiIndex = html.indexOf("Preset Provider Section: Kimi");
    const ollamaIndex = html.indexOf(">Ollama<");

    expect(anthropicIndex).toBeGreaterThan(-1);
    expect(deepseekIndex).toBeGreaterThan(anthropicIndex);
    expect(kimiIndex).toBeGreaterThan(deepseekIndex);
    expect(ollamaIndex).toBeGreaterThan(kimiIndex);
  });
});
