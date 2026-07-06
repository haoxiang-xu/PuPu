import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SteerPile from "./steer_pile";

const makeItems = () => [
  { id: "s1", text: "front item text", status: "queued" },
  { id: "s2", text: "second item text", status: "relayed" },
  { id: "s3", text: "third item text", status: "queued" },
  { id: "s4", text: "fourth item text (hidden)", status: "queued" },
];

describe("SteerPile", () => {
  test("renders nothing when there are no items", () => {
    const { container } = render(<SteerPile items={[]} onUndo={() => {}} isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("collapsed: front card is fully readable and +N counts hidden items beyond 3", () => {
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    // Front card readable
    expect(screen.getByText("front item text")).toBeInTheDocument();

    // Only the first 3 items are represented; the 4th is hidden and folded
    // into the "+N" badge on the front card's label.
    expect(screen.queryByText(/fourth item text/)).not.toBeInTheDocument();
    expect(screen.getByText(/\+1/)).toBeInTheDocument();
  });

  test("onUndo fires with the correct id when the front card's undo is clicked", () => {
    const onUndo = jest.fn();
    render(<SteerPile items={makeItems()} onUndo={onUndo} isDark={false} />);

    const undoButtons = screen.getAllByRole("button", { name: "撤回" });
    fireEvent.click(undoButtons[0]);

    expect(onUndo).toHaveBeenCalledWith("s1");
  });

  test("relayed items show the success label instead of an undo button", () => {
    render(<SteerPile items={makeItems()} onUndo={() => {}} isDark={false} />);

    expect(screen.getByText("✓ 已并入下一轮")).toBeInTheDocument();
    expect(screen.getByText("second item text")).toBeInTheDocument();
  });
});
