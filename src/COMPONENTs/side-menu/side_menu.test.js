import { fireEvent, render, screen } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext } from "../../CONTAINERs/config/context";

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
      <SideMenu />
    </ConfigContext.Provider>,
  );

describe("SideMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("hides the Agents entry when the agent modal feature flag is disabled", () => {
    renderSideMenu();

    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
  });

  test("shows the Agents entry when the agent modal feature flag is enabled", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_agent_modal: true,
        },
      }),
    );

    renderSideMenu();

    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  test("right-clicking the chats title opens the root context menu", () => {
    renderSideMenu();

    fireEvent.contextMenu(screen.getByText("Chats"), {
      clientX: 48,
      clientY: 64,
    });

    expect(screen.getByText("New Folder")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
  });
});
