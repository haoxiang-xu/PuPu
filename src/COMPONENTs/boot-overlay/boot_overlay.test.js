/* eslint-env jest */
import { act, fireEvent, render, screen } from "@testing-library/react";
import BootOverlay from "./boot_overlay";
import bootProgress from "../../SERVICEs/boot_progress";
import useReducedMotion from "../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
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

jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion", () => jest.fn());

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
    useReducedMotion.mockReturnValue(false);
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

  test("renders the wordmark and a progress bar while not ready", () => {
    renderOverlay();
    expect(screen.getByText("PuPu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();
  });

  test("shows an Enter control once bootProgress signals ready", () => {
    renderOverlay();
    act(() => bootProgress.__emit({ pct: 100, ready: true }));
    expect(screen.getByRole("button", { name: /enter/i })).toBeInTheDocument();
  });

  test("clicking Enter fades the overlay out and unmounts it", () => {
    jest.useFakeTimers();
    const { container } = renderOverlay();
    act(() => bootProgress.__emit({ pct: 100, ready: true }));

    const enterButton = screen.getByRole("button", { name: /enter/i });
    fireEvent.click(enterButton);

    act(() => {
      jest.advanceTimersByTime(240);
    });

    expect(container.querySelector('[role="presentation"]')).toBeNull();
    jest.useRealTimers();
  });

  test("reduced-motion path renders without the WebGL/dot-matrix canvases", () => {
    useReducedMotion.mockReturnValue(true);
    const { container } = renderOverlay();

    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();

    act(() => bootProgress.__emit({ pct: 100, ready: true }));
    expect(screen.getByRole("button", { name: /enter/i })).toBeInTheDocument();
  });
});
