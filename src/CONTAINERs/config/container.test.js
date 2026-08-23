import { useContext } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfigContainer from "./container";
import { ConfigContext, EnvironmentContext } from "./context";
import { themeBridge } from "../../SERVICEs/bridges/theme_bridge";
import { SEMANTIC_TOKEN_KEYS } from "../../BUILTIN_COMPONENTs/theme/semantic_tokens";

let mockSetWindowSize;
jest.mock("../../BUILTIN_COMPONENTs/mini_react/mini_use", () => {
  const React = require("react");
  return {
    useSystemTheme: () => "light_mode",
    useWindowSize: () => {
      const [size, setSize] = React.useState({ width: 1440, height: 900 });
      mockSetWindowSize = setSize;
      return size;
    },
    useWebBrowser: () => "Chrome",
    useDeviceType: () => "desktop",
    detectWebBrowser: () => "Chrome",
    detectDeviceType: () => "desktop",
  };
});

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

let legacyEnvironmentRenderCount = 0;
let latestLegacyConfig = null;

const LegacyEnvironmentProbe = () => {
  const config = useContext(ConfigContext);
  legacyEnvironmentRenderCount += 1;
  latestLegacyConfig = config;
  return <div data-testid="legacy-window-width">{config.window_size.width}</div>;
};

const GranularEnvironmentProbe = () => {
  const environment = useContext(EnvironmentContext);
  return (
    <div data-testid="granular-window-width">
      {environment.window_size.width}
    </div>
  );
};

describe("ConfigContainer side menu persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    legacyEnvironmentRenderCount = 0;
    latestLegacyConfig = null;
  });

  test("isolates resize renders and keeps the legacy startup snapshot stable", async () => {
    render(
      <ConfigContainer>
        <LegacyEnvironmentProbe />
        <GranularEnvironmentProbe />
      </ConfigContainer>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-window-width")).toHaveTextContent(
        String(window.innerWidth),
      );
      expect(screen.getByTestId("granular-window-width")).toHaveTextContent("1440");
    });
    const legacyRendersBeforeResize = legacyEnvironmentRenderCount;
    const legacyWindowSize = latestLegacyConfig.window_size;

    act(() => {
      window.innerWidth = 1200;
      window.innerHeight = 800;
      mockSetWindowSize({ width: 1200, height: 800 });
    });

    expect(screen.getByTestId("granular-window-width")).toHaveTextContent("1200");
    expect(legacyEnvironmentRenderCount).toBe(legacyRendersBeforeResize);
    expect(latestLegacyConfig.window_size).toBe(legacyWindowSize);
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

  test("does not rewrite unchanged settings during initial effects", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        appearance: { theme_mode: "light_mode", locale: "en" },
        ui: { side_menu_open: false },
      }),
    );
    const setItem = jest.spyOn(Storage.prototype, "setItem");

    try {
      render(
        <ConfigContainer>
          <FragmentProbe />
        </ConfigContainer>,
      );

      /* Boot always (re)writes the boot-loading-gate's palette cache
         (a different key, "pupu_boot_palette" — see persistBootPalette)
         regardless of whether settings changed; that write is scoped out
         here so this assertion keeps testing its original intent: the
         persisted "settings" blob itself is not needlessly rewritten. */
      const settingsWrites = setItem.mock.calls.filter(
        ([key]) => key === "settings",
      );
      expect(settingsWrites).toHaveLength(0);
    } finally {
      setItem.mockRestore();
    }
  });

  test("persists side menu state into settings.ui.side_menu_open", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    try {
      render(
        <ConfigContainer>
          <FragmentProbe />
        </ConfigContainer>,
      );

      const settingsWriteCount = () =>
        setItem.mock.calls.filter(([key]) => key === "settings").length;

      fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

      await waitFor(() => {
        const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
        expect(root?.ui?.side_menu_open).toBe(true);
      });
      /* Settings now persist per namespace (settings repository, plan §4.4):
         the first save commits the two changed sections ("appearance" seeded
         for the first time + "ui") as two writes. The redundancy guard this
         test locks is below: the second toggle changes only "ui", so exactly
         one more write happens — "appearance" is not rewritten unchanged. */
      expect(settingsWriteCount()).toBe(2);

      fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

      await waitFor(() => {
        const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
        expect(root?.ui?.side_menu_open).toBe(false);
      });
      expect(settingsWriteCount()).toBe(3);
    } finally {
      setItem.mockRestore();
    }
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

/* Was a hand-copied duplicate of the token list, which then had to be
   edited in lockstep every time the taxonomy grew. Read the real one —
   this assertion is about the container injecting the whole palette, not
   about any particular arity. */
const SEMANTIC_KEYS = SEMANTIC_TOKEN_KEYS;

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

  test("injects theme.semantic with the full default palette", async () => {
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
        "#abcdef",
      );
      expect(themeBridge.setBackgroundColor).toHaveBeenLastCalledWith(
        expect.objectContaining({ backgroundColor: "#abcdef" }),
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
        expect.objectContaining({ backgroundColor: "#ffffff" }),
      );
    });
  });
});

describe("ConfigContainer boot-loading-gate integration", () => {
  const BOOT_OVERLAY_HTML =
    '<div id="boot-overlay"><div class="boot-progress-track">' +
    '<div id="boot-progress-bar"></div></div></div>';

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    // Simulate the static S1 shell markup (public/index.html) already
    // present as a sibling of #root before React ever mounts.
    document.body.insertAdjacentHTML("afterbegin", BOOT_OVERLAY_HTML);
  });

  afterEach(() => {
    // RTL's auto-cleanup unmounts the React tree it rendered but does not
    // know about this hand-inserted sibling markup.
    document.getElementById("boot-overlay")?.remove();
  });

  test("persists the resolved palette to pupu_boot_palette on boot", async () => {
    render(
      <ConfigContainer>
        <div />
      </ConfigContainer>,
    );

    await waitFor(() => {
      const raw = window.localStorage.getItem("pupu_boot_palette");
      expect(raw).not.toBeNull();
    });
    const cached = JSON.parse(window.localStorage.getItem("pupu_boot_palette"));
    expect(cached).toEqual({
      background: "#ffffff",
      text: "#222222",
      textMuted: "#8c8c8c",
      accent: "#65c466",
    });
  });

  test("re-persists the boot palette cache when a custom accent is committed", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: { enable_theme_color_customization: true },
        appearance: {
          theme: { preset: "default", custom: { light_mode: { accent: "#abcdef" } } },
        },
      }),
    );

    render(
      <ConfigContainer>
        <div />
      </ConfigContainer>,
    );

    await waitFor(() => {
      const cached = JSON.parse(
        window.localStorage.getItem("pupu_boot_palette") || "{}",
      );
      expect(cached.accent).toBe("#abcdef");
    });
  });

  test("advances the real #boot-progress-bar to 55% once theme boot completes (S2 milestone)", async () => {
    render(
      <ConfigContainer>
        <div />
      </ConfigContainer>,
    );

    await waitFor(() => {
      const bar = document.getElementById("boot-progress-bar");
      expect(bar.style.width).toBe("55%");
    });
    // The overlay itself is untouched beyond the bar width — release() is
    // chat.js's job (S3), not the container's.
    expect(document.getElementById("boot-overlay")).not.toBeNull();
  });
});

/* jsdom's CSSOM drops any value containing var() — `style.background` comes
   back as the empty string — so the shell's paint cannot be asserted through
   the DOM. Same situation, same remedy as the armed-reset affordance in
   theme_editor.test.js: scan the source.

   What this protects: the shell must carry ONE background declaration whose
   fallback lives inside the var(). A literal `backgroundColor` written next
   to a `background: var(...)` shorthand writes the same CSSOM slot, and the
   literal wins — pinning the shell to the JS `theme` object. `theme` only
   moves when the theme editor commits, while --pupu-background moves on every
   preview frame, so that collision is what made the area behind the message
   list wait for the color picker to close (measured live: with the literal
   present, setting --pupu-background left the shell at its old value; with it
   removed, the shell followed immediately). */
describe("container.js shell paints from --pupu-background alone", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "container.js"),
    "utf8",
  );
  const shellStyle = src.slice(
    src.indexOf("<ConfigContext.Provider value={configValue}>"),
  );

  test("the shell background is one var() declaration carrying its own fallback", () => {
    expect(shellStyle).toMatch(
      /background: `var\(--pupu-background, \$\{[\s\S]*?\}\)`/,
    );
  });

  test("no literal backgroundColor competes with it on the shell element", () => {
    const styleBlock = shellStyle.slice(0, shellStyle.indexOf("</div>"));
    expect(styleBlock).not.toMatch(/^\s*backgroundColor:/m);
  });
});
