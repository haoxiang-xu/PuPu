/* eslint-env jest */
import { act, fireEvent, render, screen } from "@testing-library/react";
import BootOverlay from "./boot_overlay";
import bootProgress from "../../SERVICEs/boot_progress";
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

  test("shows no Enter button while not ready", () => {
    renderOverlay();
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();
  });

  test("holds loading until the min cycles elapse, then shows Enter on ready", () => {
    jest.useFakeTimers();
    renderOverlay();
    // ready fires early — Enter must NOT appear until the loading animation
    // has run its minimum few cycles.
    act(() => bootProgress.__emit({ pct: 100, ready: true }));
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1800 * 3);
    });
    expect(screen.getByRole("button", { name: /enter/i })).toBeInTheDocument();
    jest.useRealTimers();
  });

  test("clicking Enter fades the overlay out and unmounts it", () => {
    jest.useFakeTimers();
    const { container } = renderOverlay();
    act(() => bootProgress.__emit({ pct: 100, ready: true }));
    act(() => {
      jest.advanceTimersByTime(1800 * 3);
    });

    const enterButton = screen.getByRole("button", { name: /enter/i });
    fireEvent.click(enterButton);

    act(() => {
      jest.advanceTimersByTime(240);
    });

    expect(container.querySelector('[role="presentation"]')).toBeNull();
    jest.useRealTimers();
  });

  test("renders no canvas (cell spinner is DOM, not WebGL)", () => {
    const { container } = renderOverlay();
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
  });
});
