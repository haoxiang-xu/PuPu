import { useContext } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfigContainer from "./container";
import { ConfigContext } from "./context";

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

  test("provides the global theme highlight color", async () => {
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

describe("ConfigContainer semantic palette", () => {
  beforeEach(() => window.localStorage.clear());

  test("injects theme.semantic with 8 default keys", async () => {
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
});
