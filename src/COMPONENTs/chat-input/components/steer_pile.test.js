import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SteerAttachSection } from "./steer_pile";

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

const hoverOpen = (zone) => {
  fireEvent.mouseEnter(zone);
  act(() => {
    jest.advanceTimersByTime(120);
  });
};

describe("SteerAttachSection", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders nothing when there are no items", () => {
    const { container } = render(
      <SteerAttachSection items={[]} onUndo={() => {}} isDark={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("segment shows icon + ×N + only the LATEST message; no fan at rest", () => {
    const { container } = render(
      <SteerAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const section = container.querySelector("[data-steer-attach-section]");
    expect(section).toBeInTheDocument();
    expect(
      section.querySelector('[data-icon="steer_arrow"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("newest item text")).toBeInTheDocument();
    expect(screen.queryByText("oldest item text")).not.toBeInTheDocument();
    expect(container.querySelector("[data-steer-fan]")).not.toBeInTheDocument();
    expect(section).toHaveAttribute("data-expanded", "false");
  });

  test("a single item shows no ×N counter", () => {
    const { container } = render(
      <SteerAttachSection
        items={[{ id: "s1", text: "only item", status: "queued" }]}
        onUndo={() => {}}
        isDark={false}
      />,
    );
    expect(container.querySelector("[data-steer-count]")).toBeNull();
    expect(screen.getByText("only item")).toBeInTheDocument();
  });

  test("hover expands after the intent delay: fan shows ALL items", () => {
    jest.useFakeTimers();
    const { container } = render(
      <SteerAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const zone = screen.getByRole("group", { name: "Queued steer messages" });

    // hover-in is delayed (intent) — not expanded immediately
    fireEvent.mouseEnter(zone);
    expect(zone).toHaveAttribute("data-expanded", "false");

    hoverOpen(zone);
    expect(zone).toHaveAttribute("data-expanded", "true");

    const fan = container.querySelector("[data-steer-fan]");
    expect(fan).toBeInTheDocument();
    expect(fan.querySelectorAll("[data-steer-card]")).toHaveLength(4);
    expect(screen.getByText("oldest item text")).toBeInTheDocument();
    // relayed items render green ✓ text and no Undo
    expect(screen.getByText("✓ second item text")).toBeInTheDocument();
    const relayedCard = container.querySelector('[data-status="relayed"]');
    expect(relayedCard.querySelector("button")).toBeNull();
  });

  test("mouseleave collapses only after the grace period", () => {
    jest.useFakeTimers();
    render(
      <SteerAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const zone = screen.getByRole("group", { name: "Queued steer messages" });
    hoverOpen(zone);
    expect(zone).toHaveAttribute("data-expanded", "true");

    fireEvent.mouseLeave(zone);
    expect(zone).toHaveAttribute("data-expanded", "true");

    act(() => {
      jest.advanceTimersByTime(179);
    });
    expect(zone).toHaveAttribute("data-expanded", "true");

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(zone).toHaveAttribute("data-expanded", "false");
  });

  test("a quick graze (leaving before the intent delay) never expands", () => {
    jest.useFakeTimers();
    render(
      <SteerAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const zone = screen.getByRole("group", { name: "Queued steer messages" });

    fireEvent.mouseEnter(zone);
    fireEvent.mouseLeave(zone); // leave well before the expand delay elapses

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(zone).toHaveAttribute("data-expanded", "false");
  });

  test("fan cards: blue builtin Undo reports the card id", () => {
    jest.useFakeTimers();
    const onUndo = jest.fn();
    render(
      <SteerAttachSection
        items={makeItems()}
        onUndo={onUndo}
        isDark={false}
      />,
    );

    hoverOpen(screen.getByRole("group", { name: "Queued steer messages" }));

    // 4 cards, of which s2 is relayed → 3 undo buttons
    const undoButtons = screen.getAllByRole("button", { name: "Undo" });
    expect(undoButtons).toHaveLength(3);
    expect(undoButtons[0]).toHaveStyle({
      color: "rgba(20, 110, 220, 0.9)",
      padding: "3px 7px",
      lineHeight: "1",
    });

    // newest is the bottom card of the fan
    fireEvent.click(undoButtons[undoButtons.length - 1]);
    expect(onUndo).toHaveBeenCalledWith("s4");
  });
});
