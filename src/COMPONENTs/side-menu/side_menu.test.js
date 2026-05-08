import { fireEvent, render, screen, within } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";

jest.mock("../settings/settings_modal_content", () => ({
  SettingsModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../toolkit/toolkit_modal_content", () => ({
  ToolkitModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../workspace/workspace_modal_content", () => ({
  WorkspaceModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock(
  "../agents/agents_modal_content",
  () => ({
    AgentsModalContent: () => {
      throw new Promise(() => {});
    },
  }),
  { virtual: true },
);

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

describe("SideMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("hides the Agents entry when both feature flags are disabled", () => {
    renderSideMenu();

    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
  });

  test("shows the Agents entry when only the agents flag is enabled", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_agents: true,
        },
      }),
    );

    renderSideMenu();

    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  test("shows the Agents entry when only the characters flag is enabled", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_characters: true,
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

  test.each([
    ["Settings", null],
    ["Tools", null],
    ["Workspaces", null],
    [
      "Agents",
      {
        feature_flags: {
          enable_user_access_to_agents: true,
        },
      },
    ],
  ])(
    "renders %s lazy loading spinner inside a single modal shell",
    async (label, settings) => {
      if (settings) {
        window.localStorage.setItem("settings", JSON.stringify(settings));
      }

      renderSideMenu();

      fireEvent.click(screen.getByText(label));

      const dialog = await screen.findByRole("dialog");
      const spinner = within(dialog).getByRole("status", { name: "Loading" });
      expect(spinner).toBeInTheDocument();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getAllByRole("status", { name: "Loading" })).toEqual([
        spinner,
      ]);
    },
  );
});
