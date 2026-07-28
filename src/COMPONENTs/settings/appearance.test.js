import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { AppearanceSettings } from "./appearance";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderAppearanceSettings = () => {
  const setOnThemeMode = jest.fn();
  const setSyncWithSystemTheme = jest.fn();
  const setLocale = jest.fn();
  const result = render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{
          onThemeMode: "light_mode",
          setOnThemeMode,
          syncWithSystemTheme: false,
          setSyncWithSystemTheme,
          locale: "en",
          setLocale,
          theme: { font: {} },
        }}
      >
        <AppearanceSettings />
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );
  return { ...result, setOnThemeMode, setSyncWithSystemTheme, setLocale };
};

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

// Both appearance selectors ride the Select palette variant — the same code
// path as the attach panel's menus — so panel look (frosted radius-22
// surface, sliding row highlight) and the search bar come from the shared
// variant, not from local styling. These tests lock the behavior half:
// the panel search filters options and selection still applies.
describe("AppearanceSettings palette-variant selectors", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("theme mode dropdown: no search bar (3 options), selection applies", () => {
    const { setOnThemeMode, setSyncWithSystemTheme } =
      renderAppearanceSettings();

    // First combobox in the section is the theme-mode selector.
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    const listbox = screen.getByRole("listbox", { hidden: true });

    // 3-option list deliberately carries no search field.
    expect(screen.queryByPlaceholderText("Search...")).toBeNull();

    fireEvent.click(within(listbox).getByText("Dark"));
    expect(setSyncWithSystemTheme).toHaveBeenCalledWith(false);
    expect(setOnThemeMode).toHaveBeenCalledWith("dark_mode");
  });

  test("theme mode dropdown: selecting System enables sync instead of a mode", () => {
    const { setOnThemeMode, setSyncWithSystemTheme } =
      renderAppearanceSettings();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(
      within(screen.getByRole("listbox", { hidden: true })).getByText("System"),
    );
    expect(setSyncWithSystemTheme).toHaveBeenCalledWith(true);
    expect(setOnThemeMode).not.toHaveBeenCalled();
  });

  test("language dropdown: panel search filters and selection applies", () => {
    const { setLocale } = renderAppearanceSettings();

    fireEvent.click(screen.getAllByRole("combobox")[1]);
    const listbox = screen.getByRole("listbox", { hidden: true });

    const search = screen.getByPlaceholderText("Search...");
    fireEvent.change(search, { target: { value: "deu" } });
    expect(within(listbox).getByText("Deutsch")).toBeInTheDocument();
    expect(within(listbox).queryByText("English")).toBeNull();

    fireEvent.click(within(listbox).getByText("Deutsch"));
    // Select's set_value passes (value, option) — locale only needs the value.
    expect(setLocale).toHaveBeenCalledWith(
      "de",
      expect.objectContaining({ value: "de" }),
    );
  });
});
