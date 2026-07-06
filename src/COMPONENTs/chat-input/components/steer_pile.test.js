import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SteerPile from "./steer_pile";

// queue order: oldest first, newest last (as items accumulate)
const makeItems = () => [
  { id: "s1", text: "oldest item text", status: "queued" },
  { id: "s2", text: "second item text", status: "relayed" },
  { id: "s3", text: "third item text", status: "queued" },
  { id: "s4", text: "newest item text", status: "queued" },
];

describe("SteerPile", () => {
  test("renders nothing when there are no items", () => {
    const { container } = render(<SteerPile items={[]} onUndo={() => {}} isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("collapsed: newest is the front card and +N counts the oldest hidden items", () => {
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    // Newest item is at the front of the deck, fully readable.
    expect(screen.getByText("newest item text")).toBeInTheDocument();

    // Only the newest 3 are represented; the oldest (s1) is folded into "+N".
    expect(screen.queryByText(/oldest item text/)).not.toBeInTheDocument();
    expect(screen.getByText(/\+1/)).toBeInTheDocument();
  });

  test("onUndo fires with the newest id when the front card's undo is clicked", () => {
    const onUndo = jest.fn();
    render(<SteerPile items={makeItems()} onUndo={onUndo} isDark={false} />);

    const undoButtons = screen.getAllByRole("button", { name: "Undo" });
    fireEvent.click(undoButtons[0]);

    expect(onUndo).toHaveBeenCalledWith("s4");
  });

  test("relayed items show the success label instead of an undo button", () => {
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    expect(screen.getByText("✓ Merged into next turn")).toBeInTheDocument();
    expect(screen.getByText("second item text")).toBeInTheDocument();
  });
});
