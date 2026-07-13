import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueueAttachSection } from "./queue_pile";

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

describe("QueueAttachSection", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders nothing when there are no items", () => {
    const { container } = render(
      <QueueAttachSection items={[]} onUndo={() => {}} isDark={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("segment shows icon + ×N + only the LATEST message; no panel at rest", () => {
    const { container } = render(
      <QueueAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const section = container.querySelector("[data-queue-attach-section]");
    expect(section).toBeInTheDocument();
    expect(
      section.querySelector('[data-icon="queue_arrow"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("newest item text")).toBeInTheDocument();
    expect(screen.queryByText("oldest item text")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-queue-panel]"),
    ).not.toBeInTheDocument();
    expect(section).toHaveAttribute("data-expanded", "false");
  });

  test("segment has NO resting highlight; it appears on hover", () => {
    const { container } = render(
      <QueueAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const segment = container.querySelector(
      "[data-queue-attach-section] > div",
    );
    expect(segment).toHaveStyle({ backgroundColor: "transparent" });

    fireEvent.mouseEnter(segment);
    expect(segment).toHaveStyle({ backgroundColor: "rgba(0,0,0,0.05)" });

    fireEvent.mouseLeave(segment);
    expect(segment).toHaveStyle({ backgroundColor: "transparent" });
  });

  test("a single item shows no ×N counter", () => {
    const { container } = render(
      <QueueAttachSection
        items={[{ id: "s1", text: "only item", status: "queued" }]}
        onUndo={() => {}}
        isDark={false}
      />,
    );
    expect(container.querySelector("[data-queue-count]")).toBeNull();
    expect(screen.getByText("only item")).toBeInTheDocument();
  });

  test("hover expands after the intent delay: panel lists ALL items + header", () => {
    jest.useFakeTimers();
    const { container } = render(
      <QueueAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const zone = screen.getByRole("group", { name: "Queued messages" });

    // hover-in is delayed (intent) — not expanded immediately
    fireEvent.mouseEnter(zone);
    expect(zone).toHaveAttribute("data-expanded", "false");

    hoverOpen(zone);
    expect(zone).toHaveAttribute("data-expanded", "true");

    const panel = container.querySelector("[data-queue-panel]");
    expect(panel).toBeInTheDocument();
    expect(panel.querySelectorAll("[data-queue-row]")).toHaveLength(4);
    expect(screen.getByText("oldest item text")).toBeInTheDocument();

    // relayed row renders green text and no Undo button
    const relayedRow = panel.querySelector('[data-status="relayed"]');
    expect(relayedRow).toHaveTextContent("second item text");
    expect(relayedRow.querySelector("button")).toBeNull();

    // bottom header: queue chip + QUEUED hint
    const header = panel.querySelector("[data-queue-panel-header]");
    expect(header).toHaveTextContent("queue ×4");
    expect(header).toHaveTextContent("QUEUED · RUNS AFTER THIS TURN");
  });

  test("mouseleave collapses only after the grace period", () => {
    jest.useFakeTimers();
    render(
      <QueueAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const zone = screen.getByRole("group", { name: "Queued messages" });
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
      <QueueAttachSection
        items={makeItems()}
        onUndo={() => {}}
        isDark={false}
      />,
    );

    const zone = screen.getByRole("group", { name: "Queued messages" });

    fireEvent.mouseEnter(zone);
    fireEvent.mouseLeave(zone); // leave well before the expand delay elapses

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(zone).toHaveAttribute("data-expanded", "false");
  });

  test("row Undo is hover-revealed and reports the card id", () => {
    jest.useFakeTimers();
    const onUndo = jest.fn();
    const { container } = render(
      <QueueAttachSection
        items={makeItems()}
        onUndo={onUndo}
        isDark={false}
      />,
    );

    hoverOpen(screen.getByRole("group", { name: "Queued messages" }));

    // 4 rows, of which s2 is relayed → 3 undo buttons (hidden until row hover)
    const undoButtons = screen.getAllByRole("button", { name: "Undo" });
    expect(undoButtons).toHaveLength(3);
    expect(undoButtons[0]).toHaveStyle({
      color: "rgba(20, 110, 220, 0.9)",
      opacity: "0",
    });

    // hovering the last row (newest item) reveals its Undo
    const rows = container.querySelectorAll("[data-queue-row]");
    fireEvent.mouseEnter(rows[rows.length - 1]);
    const newestUndo = rows[rows.length - 1].querySelector("button");
    expect(newestUndo).toHaveStyle({ opacity: "1" });

    fireEvent.click(newestUndo);
    expect(onUndo).toHaveBeenCalledWith("s4");
  });
});
