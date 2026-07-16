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

  test("hides Custom Model Providers by default", () => {
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
});
