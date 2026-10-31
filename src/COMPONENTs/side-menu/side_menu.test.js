import { act, fireEvent, render, screen, within } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { writeFeatureFlags } from "../../SERVICEs/feature_flags";

const originalWindowStateAPI = window.windowStateAPI;
const originalRuntime = window.runtime;
const originalOsInfo = window.osInfo;

const installWindowStateAPI = (initialState = { isFullScreen: false }) => {
  let listener = null;
  const actions = [];
  window.windowStateAPI = {
    windowStateEventHandler: (action) => {
      actions.push(action);
      if (action === "get-state") listener?.(initialState);
    },
    windowStateEventListener: (callback) => {
      listener = callback;
      return () => {
        listener = null;
      };
    },
  };
  return {
    actions,
    emit: (state) => listener?.(state),
  };
};

jest.mock("../settings/settings_modal_content", () => ({
  SettingsModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../toolkit/plugins_shell", () => ({
  PluginsShell: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../workspace/workspace_modal_content", () => ({
  WorkspaceModalContent: () => {
    throw new Promise(() => {});
  },
}));

/* Not `{virtual: true}`: that option is for a module that does not exist, and
   this one does. Declared virtual, the mock outlived this file — a later suite
   in the same worker asking for the same real path got the real module instead
   of its own mock, and `agents_modal.test.js` rendered the whole Builder.
   Whether the two suites share a worker is luck, so the full run failed about
   one time in seven. Reproduce with
   `--runInBand --testPathPattern "(side_menu|agents_modal)"`. */
jest.mock("../agents/agents_modal_content", () => ({
  AgentsModalContent: () => {
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

describe("SideMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.windowStateAPI = originalWindowStateAPI;
    window.runtime = originalRuntime;
    window.osInfo = originalOsInfo;
  });

  test("reserves the native lights except during repeated macOS fullscreen transitions", () => {
    window.osInfo = { platform: "darwin" };
    const bridge = installWindowStateAPI({ isFullScreen: true });

    renderSideMenu();

    const toggle = screen.getByLabelText("Close sidebar");
    const newChat = screen.getByLabelText("New chat");
    expect(bridge.actions).toEqual(["get-state"]);
    expect(toggle.style.left).toBe("14px");
    expect(newChat.style.left).toBe("44px");

    act(() => bridge.emit({ isMaximized: true, isFullScreen: false }));
    expect(toggle.style.left).toBe("90px");
    expect(newChat.style.left).toBe("120px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggle.style.left).toBe("14px");
    expect(newChat.style.left).toBe("44px");
    act(() => bridge.emit({ isFullScreen: false }));
    expect(toggle.style.left).toBe("90px");
    expect(newChat.style.left).toBe("120px");
  });

  test("keeps non-macOS button insets when fullscreen state is reported", () => {
    window.osInfo = { platform: "win32" };
    const bridge = installWindowStateAPI();

    renderSideMenu();

    const toggle = screen.getByLabelText("Close sidebar");
    const newChat = screen.getByLabelText("New chat");
    expect(toggle.style.left).toBe("14px");
    expect(newChat.style.left).toBe("44px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggle.style.left).toBe("14px");
    expect(newChat.style.left).toBe("44px");
  });

  test("hides the Agents entry when both feature flags are disabled", () => {
    renderSideMenu();

    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
  });

  test("shows the Agents entry when only the agents flag is enabled", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });

    renderSideMenu();

    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  test("shows the Agents entry when only the characters flag is enabled", () => {
    writeFeatureFlags({ enable_user_access_to_characters: true });

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
    ["Plugins", null],
    ["Workspaces", null],
    ["Agents", { enable_user_access_to_agents: true }],
  ])(
    "renders %s lazy loading spinner inside a single modal shell",
    async (label, featureFlags) => {
      if (featureFlags) {
        writeFeatureFlags(featureFlags);
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
