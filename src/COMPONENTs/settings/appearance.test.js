import { render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { AppearanceSettings } from "./appearance";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderAppearanceSettings = () =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{
          onThemeMode: "light_mode",
          setOnThemeMode: jest.fn(),
          syncWithSystemTheme: false,
          setSyncWithSystemTheme: jest.fn(),
          locale: "en",
          setLocale: jest.fn(),
          theme: { font: {} },
        }}
      >
        <AppearanceSettings />
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

describe("AppearanceSettings theme color feature flag", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("hides Theme colors when color customization is disabled", () => {
    renderAppearanceSettings();

    expect(screen.queryByText("Theme colors")).not.toBeInTheDocument();
  });

  test("shows Theme colors when color customization is enabled", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: true,
        },
      }),
    );

    renderAppearanceSettings();

    expect(screen.getByText("Theme colors")).toBeInTheDocument();
  });
});
