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
});
