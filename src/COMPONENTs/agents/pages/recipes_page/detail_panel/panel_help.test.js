import { act, fireEvent, render, screen } from "@testing-library/react";

import PanelHelp, { PANEL_HELP_OPEN_DELAY } from "./panel_help";

/* Section help waits for the pointer to rest on the ⓘ before it appears;
   passing over it must not flash a paragraph of guidance. */
const shown = () => {
  const bubble = document.querySelector('[role="tooltip"]');
  return Boolean(bubble && bubble.textContent.includes("guidance"));
};

describe("PanelHelp", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("hover opens only after the help delay", () => {
    render(<PanelHelp label="Section"><span>guidance</span></PanelHelp>);
    const trigger = screen.getByRole("button").parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => { jest.advanceTimersByTime(PANEL_HELP_OPEN_DELAY - 100); });
    expect(shown()).toBe(false);
    act(() => { jest.advanceTimersByTime(200); });
    expect(shown()).toBe(true);
  });

  test("a pointer that leaves before the delay never opens it", () => {
    render(<PanelHelp label="Section"><span>guidance</span></PanelHelp>);
    const trigger = screen.getByRole("button").parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => { jest.advanceTimersByTime(PANEL_HELP_OPEN_DELAY / 2); });
    /* The tooltip tracks the pointer on the window, not mouseleave. */
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });
    act(() => { jest.advanceTimersByTime(PANEL_HELP_OPEN_DELAY * 2); });
    expect(shown()).toBe(false);
  });

  test("the delay is longer than an ordinary tooltip's", () => {
    expect(PANEL_HELP_OPEN_DELAY).toBeGreaterThan(80);
  });
});
