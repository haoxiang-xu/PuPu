const fs = require("fs");
const path = require("path");

/* The title bar's fade sits directly over the top of the message list, so
   whatever paints it has to move with the rest of the shell. Reading the JS
   `theme` object does not: `theme` changes only when the theme editor
   commits, while --pupu-* change on every preview frame — which is exactly
   how this strip ended up as the one patch of the window that waited for the
   color picker to close.

   jsdom drops any value containing var() from the CSSOM (style.background
   reads back empty), so this cannot be asserted through a render. Same
   constraint, same remedy as the shell scan in container.test.js and the
   armed-reset scan in theme_editor.test.js: scan the source. */
const src = fs.readFileSync(path.join(__dirname, "title_bar.js"), "utf8");

describe("title_bar paints from the live CSS variables", () => {
  test("the top fade reads --pupu-background, with the JS theme only as fallback", () => {
    expect(src).toMatch(
      /const topBarBackground = `var\(--pupu-background, \$\{themeBackground\}\)`/,
    );
    expect(src).toMatch(/linear-gradient\(180deg, \$\{topBarBackground\}/);
  });

  test("the foreground reads --pupu-text, with the JS theme only as fallback", () => {
    expect(src).toMatch(
      /const topBarForeground = `var\(--pupu-text, \$\{themeForeground\}\)`/,
    );
  });

  test("no painted value is taken straight off the theme object", () => {
    /* The two `theme?.` reads that remain are the var() fallbacks and the
       font family, which carries no color. A bare `color: theme?.…` or
       `background: theme?.…` would be the regression this catches. */
    const barePaint = src.match(
      /(?:^|[^-\w])(?:background|backgroundColor|color):\s*(?:`?\$?\{?\s*)?theme\?\./g,
    );
    expect(barePaint).toBeNull();
  });
});

/* ── #256: the bar draws the PRESENTED platform's chrome, live ───────────── */
const React = require("react");
const { act, render } = require("@testing-library/react");
jest.mock("../icon/icon", () => () => null);
const { ConfigContext } = require("../../CONTAINERs/config/context");
const TitleBar = require("./title_bar").default;
const {
  writePlatformOverride,
} = require("../../SERVICEs/platform_presentation");
const {
  resetSettingsRepositoryForTests,
} = require("../../SERVICEs/settings_repository");

const installWindowStateAPI = (initialState = { isFullScreen: false }) => {
  const listeners = new Set();
  let currentState = initialState;
  const emit = (state) => {
    currentState = state;
    listeners.forEach((listener) => listener(state));
  };
  const actions = [];
  window.windowStateAPI = {
    windowStateEventHandler: (action) => {
      actions.push(action);
      if (action === "get-state") emit(currentState);
    },
    windowStateEventListener: (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return {
    actions,
    emit,
  };
};

describe("title_bar follows the presentation platform (#256)", () => {
  const originalWindowStateAPI = window.windowStateAPI;
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    window.runtime = { isElectron: true, platform: "darwin" };
    window.osInfo = { platform: "darwin" };
    installWindowStateAPI();
  });
  afterEach(() => {
    delete window.runtime;
    delete window.osInfo;
    window.windowStateAPI = originalWindowStateAPI;
  });
  const mount = () =>
    render(
      <ConfigContext.Provider
        value={{ theme: {}, onFragment: "main", setOnFragment: () => {}, onThemeMode: "dark_mode" }}
      >
        <TitleBar />
      </ConfigContext.Provider>,
    );
  /* icons resolve asynchronously in jsdom; count the buttons instead: the
     side-menu toggle is always first, the Windows cluster adds three */
  const controls = (container) => container.querySelectorAll("button").length - 1;
  const toggleLeft = (container) => container.querySelector("button").style.left;

  test("AC-256-3: a darwin host presenting win32 draws the Windows cluster and Windows offsets; back to darwin, they go", () => {
    const bridge = installWindowStateAPI();
    const { container } = mount();
    expect(controls(container)).toBe(0);
    expect(toggleLeft(container)).toBe("90px");
    act(() => {
      writePlatformOverride("win32");
    });
    expect(controls(container)).toBe(3);
    expect(toggleLeft(container)).toBe("14px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggleLeft(container)).toBe("14px");
    act(() => bridge.emit({ isFullScreen: false }));
    act(() => {
      writePlatformOverride(null);
    });
    expect(controls(container)).toBe(0);
    expect(toggleLeft(container)).toBe("90px");
  });

  test("moves only the sidebar toggle during native fullscreen and restores it after exit", () => {
    const bridge = installWindowStateAPI({ isFullScreen: true });
    const { container } = mount();
    const toggle = container.querySelector("button");
    const wordmark = () =>
      Array.from(container.querySelectorAll("div")).find(
        (node) => node.style.left === "125px",
      );

    expect(bridge.actions).toEqual(["get-state"]);
    expect(toggle.style.left).toBe("14px");
    expect(wordmark()).toBeTruthy();

    act(() => bridge.emit({ isMaximized: true, isFullScreen: false }));
    expect(toggle.style.left).toBe("90px");
    expect(wordmark()).toBeTruthy();
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggle.style.left).toBe("14px");
    expect(wordmark()).toBeTruthy();
    act(() => bridge.emit({ isFullScreen: false }));
    expect(toggle.style.left).toBe("90px");
    expect(wordmark()).toBeTruthy();
  });

  test("a win32 host presenting darwin hides its own cluster and takes the traffic-light offsets", () => {
    window.osInfo = { platform: "win32" };
    window.runtime = { isElectron: true, platform: "win32" };
    const bridge = installWindowStateAPI();
    const { container } = mount();
    expect(controls(container)).toBe(3);
    act(() => {
      writePlatformOverride("darwin");
    });
    expect(controls(container)).toBe(0);
    expect(toggleLeft(container)).toBe("90px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(toggleLeft(container)).toBe("14px");
    act(() => bridge.emit({ isFullScreen: false }));
    expect(toggleLeft(container)).toBe("90px");
  });
});

describe("title_bar draws Linux controls the GNOME way (#256)", () => {
  const originalWindowStateAPI = window.windowStateAPI;
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    window.runtime = { isElectron: true, platform: "linux" };
    window.osInfo = { platform: "linux" };
    installWindowStateAPI();
  });
  afterEach(() => {
    delete window.runtime;
    delete window.osInfo;
    window.windowStateAPI = originalWindowStateAPI;
  });
  const mount = () =>
    render(
      <ConfigContext.Provider
        value={{ theme: {}, onFragment: "main", setOnFragment: () => {}, onThemeMode: "dark_mode" }}
      >
        <TitleBar />
      </ConfigContext.Provider>,
    );

  test("three round 24px buttons, minimize · maximize · close, in a cluster with breathing room; Windows keeps its flat 40×30 tiles", () => {
    const bridge = installWindowStateAPI();
    const { container } = mount();
    expect(container.querySelector("button").style.left).toBe("14px");
    act(() => bridge.emit({ isFullScreen: true }));
    expect(container.querySelector("button").style.left).toBe("14px");
    const buttons = Array.from(container.querySelectorAll("button")).slice(1);
    expect(buttons).toHaveLength(3);
    buttons.forEach((b) => {
      expect(b.style.width).toBe("24px");
      expect(b.style.height).toBe("24px");
      expect(b.style.borderRadius).toBe("999px");
    });
    expect(buttons[0].parentElement.style.gap).toBe("8px");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Minimize", "Maximize", "Close"]);
    /* the same host presenting win32: the flat tiles */
    act(() => {
      writePlatformOverride("win32");
    });
    const tiles = Array.from(container.querySelectorAll("button")).slice(1);
    expect(tiles).toHaveLength(3);
    tiles.forEach((b) => {
      expect(b.style.width).toBe("40px");
      expect(b.style.height).toBe("30px");
    });
  });
});
