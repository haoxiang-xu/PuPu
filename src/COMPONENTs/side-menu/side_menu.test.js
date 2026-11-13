import { act, fireEvent, render, screen, within } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { writeFeatureFlags } from "../../SERVICEs/feature_flags";
import { getAgentsSidebarSearch, setAgentsSidebarSearch } from "../../SERVICEs/agents_sidebar_search";
import { DRILL_TRAIL_RELEASE_MS, clearAgentsDrillTrail, resetAgentsDrillTrail, setAgentsDrillTrail } from "../../SERVICEs/agents_drill_trail";

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
    resetAgentsDrillTrail();
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

  test("Agents sidebar drag updates its visible width without mutating the shared root style", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    const root = document.documentElement;
    root.style.setProperty("--pupu-side-menu-width", "320px");
    const setSideMenuWidth = jest.fn();
    renderSideMenu({ appMode: "agents", setSideMenuWidth });
    const frames = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    const pointer = (target, type, clientX) =>
      fireEvent(target, new MouseEvent(type, { bubbles: true, clientX, button: 0 }));

    try {
      pointer(screen.getByTestId("side-menu-resize-handle"), "pointerdown", 320);
      frames.mockClear();
      const initialStyle = root.getAttribute("style");
      pointer(window, "pointermove", 350);
      pointer(window, "pointermove", 380);
      expect(frames).toHaveBeenCalledTimes(1);
      act(() => frames.mock.calls[0][0](0));
      expect(root.getAttribute("style")).toBe(initialStyle);
      const liveWidth = Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .map((rule) => rule.style?.getPropertyValue("--pupu-agents-sidebar-drag-width"))
        .find(Boolean);
      expect(liveWidth).toBe("380px");
      expect(setSideMenuWidth).not.toHaveBeenCalled();
      pointer(window, "pointerup", 380);
      expect(setSideMenuWidth).toHaveBeenCalledWith(380);
      expect(root.style.getPropertyValue("--pupu-side-menu-width")).toBe("380px");
    } finally {
      frames.mockRestore();
      root.style.removeProperty("--pupu-side-menu-width");
    }
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

  test("an open Agent takes the Agents crumb's place; drilled in, the graph left behind leads back", async () => {
    /* Lets a crumb that left finish sliding out. */
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    writeFeatureFlags({ enable_user_access_to_agents: true });
    renderSideMenu({ appMode: "agents", setAppMode: jest.fn() });
    const owner = {};
    const navigate = jest.fn();
    /* Selected, nothing drilled: one grey segment, its icon and its name. */
    act(() => setAgentsDrillTrail(owner, [{ key: "drill-0", label: "Default", depth: null, presentation: null }], navigate));
    await settle();
    expect(screen.queryByTestId("side-menu-crumb-agents")).toBeNull();
    const selected = screen.getByTestId("side-menu-crumb-drill-0");
    expect(selected).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("side-menu-crumb-drill-0-label")).toHaveTextContent("Default");
    expect(screen.getByTestId("side-menu-crumb-drill-0-avatar")).toBeInTheDocument();
    expect(screen.queryByTestId("side-menu-crumb-drill-0-shape")).toBeNull();
    /* Drilled into a subagent: Default › Summarizer, and Default goes back. */
    act(() => setAgentsDrillTrail(owner, [
      { key: "drill-0", label: "Default", depth: 0, presentation: null, ariaLabel: "Back to Default" },
      { key: "drill-1", label: "Summarizer", depth: null, presentation: null },
    ], navigate));
    await settle();
    expect(screen.getByTestId("side-menu-crumb-drill-1")).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Back to Default" }));
    expect(navigate).toHaveBeenCalledWith(0);
    /* Nothing open: Agents again. */
    act(() => clearAgentsDrillTrail(owner));
    await act(() => new Promise((resolve) => setTimeout(resolve, DRILL_TRAIL_RELEASE_MS)));
    await settle();
    expect(screen.getByTestId("side-menu-crumb-agents")).toBeInTheDocument();
  });

  test("the Agents entry uses the standard button highlight and slides its arrow in from the right", () => {
    writeFeatureFlags({ enable_user_access_to_agents: true });
    const setAppMode = jest.fn();
    renderSideMenu({ appMode: "chat", setAppMode });
    const entry = screen.getByTestId("side-menu-agents-entry");
    const button = within(entry).getByRole("button", { name: "Agents" });
    // Decorative layers have no accessible role to query.
    // eslint-disable-next-line testing-library/no-node-access
    const highlight = button.firstElementChild;
    // eslint-disable-next-line testing-library/no-node-access
    const arrow = button.lastElementChild;
    expect(screen.queryByTestId("side-menu-agents-entry-shape")).toBeNull();
    expect(button).toHaveStyle({ overflow: "hidden" });
    expect(arrow).toHaveStyle({ opacity: "0", transform: "translate(24px, -50%)" });
    expect(highlight).toHaveStyle({ opacity: "0" });
    fireEvent.mouseEnter(button);
    expect(arrow).toHaveStyle({ opacity: "1", transform: "translate(0px, -50%)" });
    expect(highlight).toHaveStyle({ opacity: "1" });
    expect(highlight.style.backgroundColor).not.toBe("transparent");
    fireEvent.mouseLeave(button);
    expect(arrow).toHaveStyle({ opacity: "0", transform: "translate(24px, -50%)" });
    expect(highlight).toHaveStyle({ opacity: "0" });
    fireEvent.click(button);
    expect(setAppMode).toHaveBeenCalledWith("agents");
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
