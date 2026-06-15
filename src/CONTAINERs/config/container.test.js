import { useContext } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfigContainer from "./container";
import { ConfigContext } from "./context";
import { themeBridge } from "../../SERVICEs/bridges/theme_bridge";

jest.mock("../../BUILTIN_COMPONENTs/mini_react/mini_use", () => ({
  useSystemTheme: () => "light_mode",
  useWindowSize: () => ({ width: 1440, height: 900 }),
  useWebBrowser: () => "Chrome",
  useDeviceType: () => "desktop",
}));

jest.mock("../../BUILTIN_COMPONENTs/class/scrollable", () => () => null);
jest.mock("../../BUILTIN_COMPONENTs/electron/title_bar", () => () => null);
jest.mock("../../COMPONENTs/side-menu/side_menu", () => () => null);
jest.mock("../../COMPONENTs/init-setup/init_setup_modal", () => () => null);
jest.mock("../../COMPONENTs/init-setup/init_setup_storage", () => ({
  isSetupComplete: () => true,
}));
jest.mock("../../SERVICEs/bridges/theme_bridge", () => ({
  themeBridge: {
    setBackgroundColor: jest.fn(),
    isThemeModeAvailable: jest.fn(() => false),
    setThemeMode: jest.fn(),
  },
}));
jest.mock("../../SERVICEs/bridges/unchain_bridge", () => ({
  runtimeBridge: {
    isChromeTerminalControlAvailable: jest.fn(() => false),
    setChromeTerminalOpen: jest.fn(),
  },
}));

const FragmentProbe = () => {
  const { onFragment, setOnFragment } = useContext(ConfigContext);

  return (
    <>
      <div data-testid="fragment">{onFragment}</div>
      <button
        type="button"
        onClick={() =>
          setOnFragment(onFragment === "side_menu" ? "main" : "side_menu")
        }
      >
        Toggle
      </button>
    </>
  );
};

const HighlightProbe = () => {
  const { theme } = useContext(ConfigContext);

  return <div data-testid="highlight-color">{theme?.highlightColor}</div>;
};

describe("ConfigContainer side menu persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  test("hydrates side menu state from settings.ui.side_menu_open", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        ui: {
          side_menu_open: true,
        },
      }),
    );

    render(
      <ConfigContainer>
        <FragmentProbe />
      </ConfigContainer>,
    );

    expect(screen.getByTestId("fragment")).toHaveTextContent("side_menu");
  });

  test("persists side menu state into settings.ui.side_menu_open", async () => {
    render(
      <ConfigContainer>
        <FragmentProbe />
      </ConfigContainer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => {
      const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(root?.ui?.side_menu_open).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => {
      const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(root?.ui?.side_menu_open).toBe(false);
    });
  });

  test("provides the semantic highlight color when theme customization is enabled", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: true,
        },
      }),
    );

    render(
      <ConfigContainer>
        <HighlightProbe />
      </ConfigContainer>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("highlight-color")).toHaveTextContent(
        "#65c466",
      );
    });
  });
});

const SEMANTIC_KEYS = [
  "accent",
  "background",
  "surface",
  "text",
  "textMuted",
  "border",
  "success",
  "danger",
];

const SemanticProbe = () => {
  const { theme } = useContext(ConfigContext);
  return (
    <>
      <div data-testid="sem-accent">{theme?.semantic?.accent}</div>
      <div data-testid="sem-bg">{theme?.semantic?.background}</div>
      <div data-testid="sem-keys">
        {theme?.semantic ? Object.keys(theme.semantic).join(",") : ""}
      </div>
    </>
  );
};

const LegacyThemeProbe = () => {
  const { theme } = useContext(ConfigContext);
  return (
    <>
      <div data-testid="legacy-bg">{theme?.backgroundColor}</div>
      <div data-testid="legacy-color">{theme?.color}</div>
      <div data-testid="legacy-highlight">{theme?.highlightColor}</div>
      <div data-testid="legacy-modal-bg">{theme?.modal?.backgroundColor}</div>
    </>
  );
};

describe("ConfigContainer semantic palette", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    themeBridge.setBackgroundColor.mockClear();
  });

  test("injects theme.semantic with 8 default keys", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: true,
        },
      }),
    );

    render(
      <ConfigContainer>
        <SemanticProbe />
      </ConfigContainer>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("sem-accent")).toHaveTextContent("#65c466");
      expect(screen.getByTestId("sem-bg")).toHaveTextContent("#ffffff");
    });
    expect(screen.getByTestId("sem-keys")).toHaveTextContent(
      SEMANTIC_KEYS.join(","),
    );
  });

  test("applies user custom accent from settings", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: true,
        },
        appearance: {
          theme: { preset: "default", custom: { light_mode: { accent: "#abcdef" } } },
        },
      }),
    );
    render(
      <ConfigContainer>
        <SemanticProbe />
      </ConfigContainer>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("sem-accent")).toHaveTextContent("#abcdef");
    });
  });

  test("writes --pupu-accent CSS variable to documentElement", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: true,
        },
      }),
    );

    render(
      <ConfigContainer>
        <SemanticProbe />
      </ConfigContainer>,
    );
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue("--pupu-accent"),
      ).toBe("#65c466");
    });
  });

  test("maps user custom semantic colors onto legacy theme fields", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: true,
        },
        appearance: {
          theme: {
            preset: "default",
            custom: {
              light_mode: {
                accent: "#112233",
                background: "#abcdef",
                surface: "#fedcba",
                text: "#010203",
              },
            },
          },
        },
      }),
    );

    const { container } = render(
      <ConfigContainer>
        <LegacyThemeProbe />
      </ConfigContainer>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-bg")).toHaveTextContent("#abcdef");
      expect(screen.getByTestId("legacy-color")).toHaveTextContent("#010203");
      expect(screen.getByTestId("legacy-highlight")).toHaveTextContent(
        "#112233",
      );
      expect(screen.getByTestId("legacy-modal-bg")).toHaveTextContent(
        "#fedcba",
      );
      expect(themeBridge.setBackgroundColor).toHaveBeenLastCalledWith(
        "#abcdef",
      );
      expect(
        document.documentElement.style.getPropertyValue("--pupu-background"),
      ).toBe("#abcdef");
      expect(container.firstChild.style.getPropertyValue("background-color")).toBe(
        "rgb(171, 205, 239)",
      );
    });
  });

  test("ignores persisted semantic colors when theme customization is disabled", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_theme_color_customization: false,
        },
        appearance: {
          theme: {
            preset: "default",
            custom: {
              light_mode: {
                accent: "#112233",
                background: "#abcdef",
                surface: "#fedcba",
                text: "#010203",
              },
            },
          },
        },
      }),
    );

    render(
      <ConfigContainer>
        <LegacyThemeProbe />
        <SemanticProbe />
      </ConfigContainer>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sem-keys")).toHaveTextContent(
        SEMANTIC_KEYS.join(","),
      );
      expect(screen.getByTestId("sem-accent")).toHaveTextContent("#65c466");
      expect(screen.getByTestId("sem-bg")).toHaveTextContent("#ffffff");
      expect(screen.getByTestId("legacy-bg")).toHaveTextContent("#ffffff");
      expect(screen.getByTestId("legacy-color")).toHaveTextContent("#222222");
      expect(screen.getByTestId("legacy-highlight")).toHaveTextContent(
        "#65c466",
      );
      expect(
        document.documentElement.style.getPropertyValue("--pupu-background"),
      ).toBe("#ffffff");
      expect(themeBridge.setBackgroundColor).toHaveBeenLastCalledWith(
        "#ffffff",
      );
    });
  });
});
