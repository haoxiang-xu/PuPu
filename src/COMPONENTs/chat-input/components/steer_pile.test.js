import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SteerPile from "./steer_pile";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => {
  const React = require("react");
  return function MockIcon({ src, style }) {
    return React.createElement("span", { "data-icon": src, style });
  };
});

// queue order: oldest first, newest last (as items accumulate)
const makeItems = () => [
  { id: "s1", text: "oldest item text", status: "queued" },
  { id: "s2", text: "second item text", status: "relayed" },
  { id: "s3", text: "third item text", status: "queued" },
  { id: "s4", text: "newest item text", status: "queued" },
];

describe("SteerPile", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders nothing when there are no items", () => {
    const { container } = render(<SteerPile items={[]} onUndo={() => {}} isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("collapsed: newest is the front card and +N counts the oldest hidden items", () => {
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    // Newest item is at the front of the deck, fully readable.
    expect(screen.getByText(/newest item text/)).toBeInTheDocument();

    // Only the newest 3 are represented; the oldest (s1) is folded into "+N".
    expect(screen.queryByText(/oldest item text/)).not.toBeInTheDocument();
    expect(screen.getByText(/\+1/)).toBeInTheDocument();
  });

  test("renders each card with a left steer icon, two-line content, and blue builtin undo button", () => {
    const onUndo = jest.fn();
    const { container } = render(<SteerPile items={makeItems()} onUndo={onUndo} isDark={false} />);

    expect(screen.getAllByText(/Queued · runs after this turn/).length).toBeGreaterThan(0);
    expect(screen.getByText("✓ Merged into next turn")).toBeInTheDocument();
    expect(screen.getByText(/newest item text/)).toBeInTheDocument();
    expect(container.querySelector("[data-steer-card]")).toHaveStyle({
      padding: "5px 5px 5px 10px",
    });
    const steerIcon = container.querySelector('[data-icon="steer_arrow"]');
    expect(steerIcon).toHaveStyle({
      width: "18px",
      height: "18px",
    });
    const iconWrap = steerIcon.parentElement;
    expect(iconWrap).toHaveStyle({ marginTop: "0px" });
    expect(iconWrap.parentElement).toHaveStyle({ alignItems: "center" });

    const undoButtons = screen.getAllByRole("button", { name: "Undo" });
    expect(undoButtons[0]).toHaveStyle({
      color: "rgba(20, 110, 220, 0.9)",
      padding: "3px 7px",
      lineHeight: "1",
    });
    fireEvent.click(undoButtons[0]);

    expect(onUndo).toHaveBeenCalledWith("s4");
  });

  test("hover expands after an intent delay, then mouseleave collapses after a grace period", () => {
    jest.useFakeTimers();
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    const pile = screen.getByRole("group", { name: "Queued steer messages" });

    // hover-in is delayed (intent) — not expanded immediately
    fireEvent.mouseEnter(pile);
    expect(pile).toHaveAttribute("data-expanded", "false");

    // after the ~120ms expand delay it opens
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(pile).toHaveAttribute("data-expanded", "true");

    // leaving keeps it open through the collapse grace period, then collapses
    fireEvent.mouseLeave(pile);
    expect(pile).toHaveAttribute("data-expanded", "true");

    act(() => {
      jest.advanceTimersByTime(179);
    });
    expect(pile).toHaveAttribute("data-expanded", "true");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(pile).toHaveAttribute("data-expanded", "false");
  });

  test("a quick graze (leaving before the intent delay) never expands", () => {
    jest.useFakeTimers();
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    const pile = screen.getByRole("group", { name: "Queued steer messages" });

    fireEvent.mouseEnter(pile);
    fireEvent.mouseLeave(pile); // leave well before the expand delay elapses

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(pile).toHaveAttribute("data-expanded", "false");
  });
});
