/* #204 S2: the side menu's top group gained a Model Providers entry beside
   Plugins / Agents / Workspaces. Mirrors the harness in side_menu.test.js —
   the lazy-content-throws-a-pending-promise trick forces Suspense to render
   its fallback so we can assert the modal opened without needing the full
   (lazily loaded) model-providers page to resolve. */
import { fireEvent, render, screen, within } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";

jest.mock("../model-providers/model_providers_modal_content", () => ({
  ModelProvidersModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => (
  <span data-testid="icon" />
));

jest.mock("../../BUILTIN_COMPONENTs/explorer/explorer", () => () => (
  <div data-testid="explorer" />
));

const renderSideMenu = () =>
  render(
    <ConfigContext.Provider
      value={{
        theme: {},
        onFragment: "side_menu",
        setOnFragment: jest.fn(),
        onThemeMode: "light_mode",
      }}
    >
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <SideMenu />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("SideMenu Model Providers entry", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("renders a Models entry in the top group", () => {
    renderSideMenu();

    expect(screen.getByText("Models")).toBeInTheDocument();
  });

  test("clicking Models opens the ModelProvidersModal lazy shell in a single dialog", async () => {
    renderSideMenu();

    fireEvent.click(screen.getByText("Models"));

    const dialog = await screen.findByRole("dialog");
    const spinner = within(dialog).getByRole("status", { name: "Loading" });
    expect(spinner).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
