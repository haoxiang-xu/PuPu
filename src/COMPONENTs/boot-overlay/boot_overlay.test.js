/* eslint-env jest */
import { act, fireEvent, render, screen } from "@testing-library/react";
import BootOverlay from "./boot_overlay";
import bootProgress from "../../SERVICEs/boot_progress";
import * as bootReadiness from "../../SERVICEs/boot_readiness";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* NOTE: this project's jest config runs with `resetMocks: true`, which
   strips any implementation set at jest.fn(impl) creation time before the
   very first test runs. So the mocks below are created bare and get their
   real implementation (re-)installed via __reset(), called from
   beforeEach — the standard workaround for resetMocks, same pattern used
   elsewhere in this codebase (e.g. icon.test.js, use_optimistic_update.test.js). */
jest.mock("../../SERVICEs/boot_progress", () => {
  const listeners = new Set();
  const state = { pct: 20, ready: false };
  const api = {
    getState: jest.fn(),
    subscribe: jest.fn(),
    takeOver: jest.fn(),
    set: jest.fn(),
    release: jest.fn(),
    signalReady: jest.fn(),
  };
  api.__emit = (next) => {
    Object.assign(state, next);
    listeners.forEach((cb) => cb({ ...state }));
  };
  api.__reset = () => {
    listeners.clear();
    state.pct = 20;
    state.ready = false;
    api.getState.mockImplementation(() => ({ ...state }));
    api.subscribe.mockImplementation((cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    });
  };
  return { __esModule: true, default: api };
});

/* boot_readiness owns the bridge subscription and the backend gate; it has its
   own suite (SERVICEs/boot_readiness.test.js). Here it is a driveable stub so
   these tests are about what the overlay RENDERS. */
jest.mock("../../SERVICEs/boot_readiness", () => {
  const listeners = new Set();
  const initial = {
    ready: false,
    available: true,
    phase: "starting_runtime",
    runtime: { ready: false, status: "starting" },
    mcp: { ready: false },
    failure: null,
    waitedMs: 0,
    showStatus: false,
    slow: false,
    retrying: false,
  };
  let state = { ...initial };
  const mod = {
    __esModule: true,
    start: jest.fn(),
    retry: jest.fn(),
    subscribe: jest.fn(),
    getState: jest.fn(),
  };
  mod.__emit = (next) => {
    state = { ...state, ...next };
    listeners.forEach((cb) => cb({ ...state }));
  };
  mod.__reset = () => {
    listeners.clear();
    state = { ...initial };
    mod.getState.mockImplementation(() => ({ ...state }));
    mod.subscribe.mockImplementation((cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    });
  };
  return mod;
});

const configValue = {
  theme: { semantic: { accent: "#4C8BF5", text: "#222222" } },
  onThemeMode: "light_mode",
};

const renderOverlay = () =>
  render(
    <ConfigContext.Provider value={configValue}>
      <BootOverlay />
    </ConfigContext.Provider>,
  );

describe("BootOverlay", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    bootProgress.__reset();
    bootReadiness.__reset();
    // jsdom logs a "not implemented" notice for canvas 2d/webgl2 contexts
    // (it returns null gracefully — see dot_matrix.test.js /
    // shader_blob_background.test.js for the dedicated behavior coverage).
    // Silence it here so this file's output stays about BootOverlay itself.
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("takes over the static overlay on mount", () => {
    renderOverlay();
    expect(bootProgress.takeOver).toHaveBeenCalledTimes(1);
  });

  test("is not clickable while not ready (presentation, no start prompt)", () => {
    renderOverlay();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).toBeNull();
    expect(screen.getByText(/click anywhere to start/i)).toHaveStyle({
      opacity: "0",
    });
  });

  test("becomes a clickable start control once bootProgress signals ready", () => {
    renderOverlay();
    act(() => bootProgress.__emit({ pct: 100, ready: true }));
    expect(
      screen.getByRole("button", { name: /click anywhere to start/i }),
    ).toBeInTheDocument();
  });

  test("clicking anywhere fades the overlay out and unmounts it", () => {
    jest.useFakeTimers();
    const { container } = renderOverlay();
    act(() => bootProgress.__emit({ pct: 100, ready: true }));

    fireEvent.click(
      screen.getByRole("button", { name: /click anywhere to start/i }),
    );

    act(() => {
      jest.advanceTimersByTime(240);
    });

    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('[role="presentation"]')).toBeNull();
    jest.useRealTimers();
  });

  test("starts backend readiness observation on mount", () => {
    renderOverlay();
    expect(bootReadiness.start).toHaveBeenCalled();
  });

  test("renders a real progress bar driven by bootProgress pct", () => {
    // The whole point of the gate: without this the 80->88->96->100 advance is
    // invisible once takeOver() removes the static shell, and the only
    // "indicator" left is an ambient blob that expresses no progress at all.
    const { container } = renderOverlay();

    const track = screen.getByRole("progressbar", { name: /startup progress/i });
    expect(track).toHaveAttribute("aria-valuenow", "20");
    expect(container.querySelector("[data-boot-bar]")).toHaveStyle({
      width: "20%",
    });

    act(() => bootProgress.__emit({ pct: 88 }));

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "88",
    );
    expect(container.querySelector("[data-boot-bar]")).toHaveStyle({
      width: "88%",
    });
  });

  test("stays silent for the first few seconds, then explains what it is waiting for", () => {
    renderOverlay();
    // Status text is rendered but transparent until the quiet delay elapses,
    // and the live region is EMPTY so nothing is announced early.
    expect(screen.queryByText(/starting local services/i)).toBeNull();

    act(() => bootReadiness.__emit({ showStatus: true }));

    expect(screen.getByText(/starting local services/i)).toHaveStyle({
      opacity: "0.75",
    });
  });

  test("switches the status line once the sidecar is up and only MCP is pending", () => {
    renderOverlay();
    act(() =>
      bootReadiness.__emit({
        showStatus: true,
        phase: "starting_mcp",
        runtime: { ready: true, status: "ready" },
      }),
    );

    // "Plugins", not "tools" — the product renamed toolkits some time ago.
    expect(screen.getByText(/preparing your plugins/i)).toBeInTheDocument();
  });

  test("admits it is slow at the third stage", () => {
    renderOverlay();
    act(() => bootReadiness.__emit({ showStatus: true, slow: true }));

    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
  });

  test("renders the backend failure and a retry control, without opening the gate", () => {
    renderOverlay();
    act(() =>
      bootReadiness.__emit({
        showStatus: true,
        failure: { code: "unchain_runtime_not_found" },
      }),
    );

    // Copy comes from the locale file keyed by the code, never from the wire.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /missing part of its installation/i,
    );
    // The overlay is NOT clickable-to-enter: the gate is still shut.
    expect(
      screen.queryByRole("button", { name: /click anywhere to start/i }),
    ).toBeNull();
  });

  test("an unknown failure code falls back to generic copy, never a raw identifier", () => {
    renderOverlay();
    act(() =>
      bootReadiness.__emit({ failure: { code: "something_new_from_main" } }),
    );

    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveTextContent("something_new_from_main");
    expect(alert).toHaveTextContent(/aren't ready yet/i);
  });

  test("retry asks the readiness service to restart the backend", () => {
    renderOverlay();
    act(() =>
      bootReadiness.__emit({
        showStatus: true,
        failure: { code: "unchain_runtime_failed" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(bootReadiness.retry).toHaveBeenCalledTimes(1);
  });

  test("the retry button keeps its own accessible name — no aria-label override", () => {
    // An aria-label that does not contain the visible label violates WCAG 2.5.3
    // and means a screen reader never hears the label change to "Retrying".
    renderOverlay();
    act(() =>
      bootReadiness.__emit({ failure: { code: "unchain_runtime_failed" } }),
    );

    const button = screen.getByRole("button", { name: /try again/i });
    expect(button).not.toHaveAttribute("aria-label");
  });

  test("while retrying the button stays focusable and announceable, not disabled", () => {
    // `disabled` drops keyboard focus to <body> mid-interaction and removes the
    // control from the a11y tree entirely. The busy state is conveyed by the
    // label change inside the live region — NOT by aria-busy, which inside a
    // role="alert" subtree means "do not announce yet" and would suppress the
    // very announcement it was meant to produce.
    renderOverlay();
    act(() =>
      bootReadiness.__emit({
        failure: { code: "unchain_runtime_failed" },
        retrying: true,
      }),
    );

    const button = screen.getByRole("button", { name: /retrying/i });
    expect(button).not.toBeDisabled();
    expect(screen.getByRole("alert")).toContainElement(button);
    expect(button.closest("[aria-busy]")).toBeNull();

    // Re-entrancy is guarded in the handler instead.
    fireEvent.click(button);
    expect(bootReadiness.retry).not.toHaveBeenCalled();
  });

  test("focuses the retry control when the failure card appears", () => {
    renderOverlay();
    act(() =>
      bootReadiness.__emit({ failure: { code: "unchain_runtime_failed" } }),
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /try again/i }),
    );
  });

  test("the failure card cross-fades out if the backend recovers on its own", () => {
    renderOverlay();
    act(() =>
      bootReadiness.__emit({
        failure: { code: "unchain_runtime_failed" },
      }),
    );
    expect(screen.getByRole("alert")).toHaveStyle({ opacity: "1" });

    act(() => bootReadiness.__emit({ failure: null, ready: true }));
    act(() => bootProgress.__emit({ pct: 100, ready: true }));

    // Stays mounted and transitions, matching its sibling layers' 240ms
    // language rather than snapping out of existence.
    expect(screen.getByRole("alert")).toHaveStyle({ opacity: "0" });
    expect(
      screen.getByRole("button", { name: /click anywhere to start/i }),
    ).toBeInTheDocument();
  });

  describe("modal barrier", () => {
    test("REGRESSION: Tab cannot reach the app underneath while the gate is shut", () => {
      // The overlay stops the mouse but not the keyboard. Focus used to walk
      // into the chat composer hidden behind it, and everything typed was
      // silently persisted into a draft the user could not see.
      const { container } = renderOverlay();
      const composer = document.createElement("input");
      document.body.appendChild(composer);

      composer.focus();

      expect(document.activeElement).not.toBe(composer);
      expect(document.activeElement).toBe(
        container.querySelector('[role="presentation"]'),
      );
      composer.remove();
    });

    test("REGRESSION: Escape cannot reach a window-level listener underneath", () => {
      // BUILTIN Modal binds Escape on WINDOW, so on first run one Escape used
      // to silently dismiss an InitSetupModal the user had never seen. Neither
      // a focus trap nor `inert` can stop a window listener — only capture can.
      const underneath = jest.fn();
      window.addEventListener("keydown", underneath);
      renderOverlay();

      fireEvent.keyDown(document.body, { key: "Escape" });

      expect(underneath).not.toHaveBeenCalled();
      window.removeEventListener("keydown", underneath);
    });

    test("keys other than Escape still reach the overlay's own controls", () => {
      const underneath = jest.fn();
      window.addEventListener("keydown", underneath);
      renderOverlay();
      act(() =>
        bootReadiness.__emit({ failure: { code: "unchain_runtime_failed" } }),
      );

      const button = screen.getByRole("button", { name: /try again/i });
      fireEvent.keyDown(button, { key: "Enter" });

      // Swallowing every key would also kill the Retry button's activation.
      expect(underneath).toHaveBeenCalled();
      window.removeEventListener("keydown", underneath);
    });

    test("focuses itself once ready so Enter/Space works without hunting for it", () => {
      const { container } = renderOverlay();
      act(() => bootProgress.__emit({ pct: 100, ready: true }));

      expect(document.activeElement).toBe(
        container.querySelector('[role="button"]'),
      );
    });

    test("releases the focus trap once the user commits to entering", () => {
      // During the exit fade the app underneath is the rightful owner of focus.
      jest.useFakeTimers();
      renderOverlay();
      act(() => bootProgress.__emit({ pct: 100, ready: true }));
      fireEvent.click(
        screen.getByRole("button", { name: /click anywhere to start/i }),
      );

      const composer = document.createElement("input");
      document.body.appendChild(composer);
      composer.focus();

      expect(document.activeElement).toBe(composer);
      composer.remove();
      act(() => {
        jest.advanceTimersByTime(240);
      });
      jest.useRealTimers();
    });

    test("keeps taking input through the exit fade", () => {
      // pointerEvents:"none" during the fade let the second click of a
      // double-click punch through to whatever was underneath — on first run,
      // the middle of InitSetupModal.
      jest.useFakeTimers();
      const { container } = renderOverlay();
      act(() => bootProgress.__emit({ pct: 100, ready: true }));

      fireEvent.click(
        screen.getByRole("button", { name: /click anywhere to start/i }),
      );

      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(container.querySelector('[role="button"]')).toHaveStyle({
        pointerEvents: "auto",
      });

      act(() => {
        jest.advanceTimersByTime(240);
      });
      expect(container.querySelector('[role="button"]')).toBeNull();
      jest.useRealTimers();
    });
  });
});
