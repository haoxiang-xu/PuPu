import { act, fireEvent, render, screen, within } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { writeFeatureFlags } from "../../SERVICEs/feature_flags";
import { getAgentsSidebarSearch, setAgentsSidebarSearch } from "../../SERVICEs/agents_sidebar_search";

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

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => (
  <span data-testid="icon" />
));

jest.mock("../../BUILTIN_COMPONENTs/explorer/explorer", () => () => (
  <div data-testid="explorer" />
));

const renderSideMenu = (nav = {}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: {},
        onFragment: "side_menu",
        setOnFragment: jest.fn(),
        onThemeMode: "light_mode",
        ...nav,
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
    expect(bridge.actions).toEqual(["get-state"]);
    expect(toggle.style.left).toBe("14px");

    act(() => bridge.emit({ isMaximized: true, isFullScreen: false }));
    expect(toggle.style.left).toBe("90px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggle.style.left).toBe("14px");
    act(() => bridge.emit({ isFullScreen: false }));
    expect(toggle.style.left).toBe("90px");
  });

  test("keeps non-macOS button insets when fullscreen state is reported", () => {
    window.osInfo = { platform: "win32" };
    const bridge = installWindowStateAPI();

    renderSideMenu();

    const toggle = screen.getByLabelText("Close sidebar");
    expect(toggle.style.left).toBe("14px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggle.style.left).toBe("14px");
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

    const title = screen.getByText("Chats", { selector: "[data-testid='side-menu-chats-title'] > div" });
    fireEvent.contextMenu(title, {
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

  test("Agents drills the side menu into the Agents pane instead of opening a modal", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    const setAppMode = jest.fn();

    renderSideMenu({ appMode: "chat", setAppMode });
    fireEvent.click(screen.getByText("Agents"));

    expect(setAppMode).toHaveBeenCalledWith("agents");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("the Agents pane hands its slot over to the agent list", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    const setAgentsSidebarSlot = jest.fn();

    renderSideMenu({ appMode: "agents", setAppMode: jest.fn(), setAgentsSidebarSlot });

    const slot = screen.getByTestId("side-menu-agents-slot");
    expect(setAgentsSidebarSlot).toHaveBeenCalledWith(slot);
    expect(screen.getByTestId("side-menu-panes").style.transform).toBe(
      "translateX(-50%)",
    );
    /* The chat pane is the one slid away and hidden. */
    expect(slot.closest("[aria-hidden]")).toBeNull();
  });

  test("dragging the edge moves the width without a render per move, then commits it once", () => {
    const setSideMenuWidth = jest.fn();
    const setSideMenuResizing = jest.fn();

    const { container } = renderSideMenu({
      sideMenuWidth: 360,
      setSideMenuWidth,
      setSideMenuResizing,
    });
    expect(container.firstChild).toBeTruthy();

    const handle = screen.getByTestId("side-menu-resize-handle");
    /* jsdom has no PointerEvent, so fireEvent.pointer* drops clientX. */
    const pointer = (target, type, clientX) =>
      act(() => {
        target.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 }),
        );
      });
    pointer(handle, "pointerdown", 360);
    expect(setSideMenuResizing).toHaveBeenCalledWith(true);
    pointer(window, "pointermove", 400);
    pointer(window, "pointermove", 2000);
    /* Moves go to the CSS variable, not to app state. */
    expect(setSideMenuWidth).not.toHaveBeenCalled();
    pointer(window, "pointerup", 2000);
    expect(setSideMenuWidth).toHaveBeenCalledTimes(1);
    expect(setSideMenuWidth).toHaveBeenLastCalledWith(480);
    expect(
      document.documentElement.style.getPropertyValue("--pupu-side-menu-width"),
    ).toBe("480px");
    expect(setSideMenuResizing).toHaveBeenLastCalledWith(false);
    document.documentElement.style.removeProperty("--pupu-side-menu-width");
  });

  test("the breadcrumb sits above the search: Home on the chat list", () => {
    renderSideMenu({ appMode: "chat", setAppMode: jest.fn() });
    const crumbs = screen.getByTestId("side-menu-breadcrumb");
    const home = screen.getByTestId("side-menu-crumb-home");
    expect(crumbs).toContainElement(home);
    expect(home).toHaveAttribute("aria-label", "Home");
    expect(home).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("side-menu-crumb-agents")).toBeNull();
    const search = screen.getAllByPlaceholderText("Search...")[0];
    expect(Boolean(crumbs.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  test("in the Agents pane it reads Home › Agents: Home goes back, Agents is where you are", () => {
    const setAppMode = jest.fn();
    writeFeatureFlags({ enable_user_access_to_agents: true });
    renderSideMenu({ appMode: "agents", setAppMode });
    const agents = screen.getByTestId("side-menu-crumb-agents");
    expect(agents).toHaveAttribute("aria-current", "page");
    expect(agents).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(agents);
    expect(setAppMode).not.toHaveBeenCalledWith("chat");
    const home = screen.getByTestId("side-menu-crumb-home");
    expect(home).not.toHaveAttribute("aria-disabled");
    fireEvent.click(home);
    expect(setAppMode).toHaveBeenCalledWith("chat");
  });

  test("the Agents entry drops its › and wears the Home crumb's pointed block instead", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    const rect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 296, height: 30, top: 0, left: 0, right: 296, bottom: 30 });
    const setAppMode = jest.fn();
    renderSideMenu({ appMode: "chat", setAppMode });
    const entry = screen.getByTestId("side-menu-agents-entry");
    const path = within(entry).getByTestId("side-menu-agents-entry-shape").querySelector("path");
    /* pointed: the right edge is reached at mid height */
    expect(path.getAttribute("d")).toContain("Q296 15");
    const shape = within(entry).getByTestId("side-menu-agents-entry-shape");
    /* like a plain button: nothing at rest, shown only under the pointer */
    expect(shape.dataset.shown).toBe("false");
    fireEvent.mouseEnter(entry);
    expect(shape.dataset.shown).toBe("true");
    /* pressed, it pulls in 2px on every side like a Button's block: on a
       30px-high entry that is far more than a 4% scale would give */
    fireEvent.mouseDown(entry);
    expect(shape.style.transform).toBe(`scale(${1 - 4 / 296}, ${1 - 4 / 30})`);
    fireEvent.mouseUp(entry);
    fireEvent.mouseLeave(entry);
    expect(shape.dataset.shown).toBe("false");
    fireEvent.click(within(entry).getByText("Agents"));
    expect(setAppMode).toHaveBeenCalledWith("agents");
    rect.mockRestore();
  });

  test("New chat is the Chats title's action, not a top-bar button", () => {
    renderSideMenu({ appMode: "chat", setAppMode: jest.fn() });
    const title = screen.getByTestId("side-menu-chats-title");
    expect(title).toContainElement(screen.getByLabelText("New chat"));
  });

  test("the breadcrumb's blocks nest: Home is pointed, Agents is notched and squared off", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    renderSideMenu({ appMode: "agents", setAppMode: jest.fn() });
    const home = screen.getByTestId("side-menu-crumb-home");
    const agents = screen.getByTestId("side-menu-crumb-agents");
    expect(home.dataset.notch).toBe("false");
    expect(home.dataset.point).toBe("true");
    expect(agents.dataset.notch).toBe("true");
    expect(agents.dataset.point).toBe("false");
  });

  test("the search field stays put above the sliding panes, and each pane keeps its own query", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    const setAppMode = jest.fn();
    const { rerender } = renderSideMenu({ appMode: "chat", setAppMode });
    const field = screen.getByTestId("side-menu-search");
    const panes = screen.getByTestId("side-menu-panes");
    expect(panes).not.toContainElement(field);
    const input = within(field).getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "draft" } });
    expect(input.value).toBe("draft");

    const withMode = (appMode) => (
      <ConfigContext.Provider
        value={{ theme: {}, onFragment: "side_menu", setOnFragment: jest.fn(), onThemeMode: "light_mode", appMode, setAppMode }}
      >
        <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
          <SideMenu />
        </LocaleContext.Provider>
      </ConfigContext.Provider>
    );
    rerender(withMode("agents"));
    /* the same field, now searching the agent list, which has its own query */
    expect(screen.getByTestId("side-menu-search")).toBe(field);
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "planner" } });
    expect(getAgentsSidebarSearch()).toBe("planner");
    rerender(withMode("chat"));
    expect(input.value).toBe("draft");
    act(() => setAgentsSidebarSearch(""));
  });

  test("losing both flags while in the Agents pane goes back to the chat", () => {
    const setAppMode = jest.fn();

    renderSideMenu({ appMode: "agents", setAppMode });

    expect(setAppMode).toHaveBeenCalledWith("chat");
  });
});
