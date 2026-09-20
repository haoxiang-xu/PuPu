import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import Tooltip from "./tooltip";

/**
 * Every tooltip bubble renders into one SHARED portal root as a DOM sibling of
 * every other one, regardless of how they are nested in the React tree — a
 * Select's own dropdown opened from inside an already-open popover, for
 * instance. A click landing inside the INNER bubble is therefore, in the DOM,
 * outside the OUTER one's own trigger/bubble nodes, which used to close the
 * outer popover out from under whatever the user was still doing inside it.
 */
const NestedTooltips = () => {
  const [outerOpen, setOuterOpen] = useState(true);
  const [innerOpen, setInnerOpen] = useState(true);
  return (
    <Tooltip
      trigger={["click"]}
      open={outerOpen}
      on_open_change={setOuterOpen}
      tooltip_component={
        <div data-testid="outer-bubble">
          <div data-testid="outer-other-content">other row</div>
          <Tooltip
            trigger={["click"]}
            open={innerOpen}
            on_open_change={setInnerOpen}
            tooltip_component={
              <div data-testid="inner-bubble">inner content</div>
            }
          >
            <button type="button" data-testid="inner-trigger">
              inner trigger
            </button>
          </Tooltip>
        </div>
      }
    >
      <button type="button" data-testid="outer-trigger">
        outer trigger
      </button>
    </Tooltip>
  );
};

describe("Tooltip outside-click detection across nested, portaled tooltips", () => {
  test("a click inside a NESTED tooltip's own bubble does not close the outer one", async () => {
    render(<NestedTooltips />);

    expect(await screen.findByTestId("outer-bubble")).toBeInTheDocument();
    expect(await screen.findByTestId("inner-bubble")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("inner-bubble"));

    expect(screen.getByTestId("outer-bubble")).toBeInTheDocument();
    expect(screen.getByTestId("inner-bubble")).toBeInTheDocument();
  });

  test("a click elsewhere in the outer popover (not the nested tooltip) still closes the nested one", async () => {
    render(<NestedTooltips />);

    expect(await screen.findByTestId("inner-bubble")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outer-other-content"));

    expect(screen.queryByTestId("inner-bubble")).not.toBeInTheDocument();
    expect(screen.getByTestId("outer-bubble")).toBeInTheDocument();
  });

  test("a click truly outside every tooltip still closes it", () => {
    render(
      <>
        <div data-testid="page-background" />
        <NestedTooltips />
      </>,
    );

    fireEvent.mouseDown(screen.getByTestId("page-background"));

    expect(screen.queryByTestId("outer-bubble")).not.toBeInTheDocument();
  });
});

describe("Tooltip follow_trigger", () => {
  /* jsdom has no layout: the trigger's rect is scripted, and the bubble's
     position is read back from the portaled tooltip element. */
  const renderFollowing = (props = {}) =>
    render(
      <Tooltip
        trigger={["click"]}
        position="top"
        align="end"
        offset={8}
        show_arrow={false}
        open
        tooltip_component={<div data-testid="follow-bubble">bubble</div>}
        {...props}
      >
        <button type="button" data-testid="follow-trigger">anchor</button>
      </Tooltip>,
    );

  /* the Tooltip measures its own wrapper around the children, not the
     button itself */
  const scriptTrigger = (button, top) => {
    const el = button.parentElement;
    el.getBoundingClientRect = () => ({
      left: 100, right: 132, width: 32, top, bottom: top + 32, height: 32, x: 100, y: top, toJSON: () => {},
    });
  };
  /* the bubble needs a size too, or positioning bails out (a 0×0 bubble
     is one that has not been laid out yet) */
  const scriptBubble = () => {
    /* the content box is the element wrapping tooltip_component */
    const content = screen.getByTestId("follow-bubble").parentElement;
    Object.defineProperty(content, "offsetWidth", { configurable: true, get: () => 200 });
    Object.defineProperty(content, "offsetHeight", { configurable: true, get: () => 100 });
  };

  test("with follow_trigger the bubble tracks an anchor that moves without any scroll or resize", () => {
    jest.useFakeTimers();
    const raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => setTimeout(() => cb(performance.now()), 16));
    const caf = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => clearTimeout(id));
    try {
      renderFollowing({ follow_trigger: true });
      const trigger = screen.getByTestId("follow-trigger");
      scriptTrigger(trigger, 300);
      scriptBubble();
      act(() => { jest.advanceTimersByTime(50); });
      /* visibility:hidden under jsdom, so by selector rather than role */
      const bubble = document.querySelector('[role="tooltip"]');
      const before = bubble.style.top;
      scriptTrigger(trigger, 200);
      act(() => { jest.advanceTimersByTime(50); });
      expect(bubble.style.top).not.toBe(before);
    } finally {
      raf.mockRestore();
      caf.mockRestore();
      jest.useRealTimers();
    }
  });

  test("without follow_trigger a moving anchor leaves the bubble where it was", () => {
    jest.useFakeTimers();
    const raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => setTimeout(() => cb(performance.now()), 16));
    const caf = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => clearTimeout(id));
    try {
      renderFollowing();
      const trigger = screen.getByTestId("follow-trigger");
      scriptTrigger(trigger, 300);
      scriptBubble();
      act(() => { jest.advanceTimersByTime(50); });
      /* visibility:hidden under jsdom, so by selector rather than role */
      const bubble = document.querySelector('[role="tooltip"]');
      const before = bubble.style.top;
      scriptTrigger(trigger, 200);
      act(() => { jest.advanceTimersByTime(50); });
      expect(bubble.style.top).toBe(before);
    } finally {
      raf.mockRestore();
      caf.mockRestore();
      jest.useRealTimers();
    }
  });
});
