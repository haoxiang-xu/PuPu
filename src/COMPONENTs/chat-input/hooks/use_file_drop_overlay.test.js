import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useFileDropOverlay } from "./use_file_drop_overlay";

const HookHarness = ({ onDropFiles = null }) => {
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useFileDropOverlay({
      on_drop_files: onDropFiles,
    });

  return (
    <div
      data-testid="drop-zone"
      data-dragging={isDragging ? "true" : "false"}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div data-testid="inner-child" />
    </div>
  );
};

describe("use_file_drop_overlay", () => {
  test("does not activate for non-file drag data", () => {
    render(<HookHarness onDropFiles={jest.fn()} />);
    const zone = screen.getByTestId("drop-zone");

    fireEvent.dragOver(zone, {
      dataTransfer: {
        types: ["text/plain"],
      },
    });

    expect(zone.getAttribute("data-dragging")).toBe("false");
  });

  test("activates and forwards dropped files", () => {
    const onDropFiles = jest.fn();
    render(<HookHarness onDropFiles={onDropFiles} />);
    const zone = screen.getByTestId("drop-zone");

    const files = [new File(["hello"], "hello.txt", { type: "text/plain" })];

    fireEvent.dragOver(zone, {
      dataTransfer: {
        types: ["Files"],
        dropEffect: "none",
      },
    });
    expect(zone.getAttribute("data-dragging")).toBe("true");

    fireEvent.drop(zone, {
      dataTransfer: {
        files,
      },
    });

    expect(zone.getAttribute("data-dragging")).toBe("false");
    expect(onDropFiles).toHaveBeenCalledWith(files);
  });

  test("drag leave resets when leaving drop zone", () => {
    render(<HookHarness onDropFiles={jest.fn()} />);
    const zone = screen.getByTestId("drop-zone");

    fireEvent.dragOver(zone, {
      dataTransfer: {
        types: ["Files"],
      },
    });
    expect(zone.getAttribute("data-dragging")).toBe("true");

    fireEvent.dragLeave(zone, { relatedTarget: null });
    expect(zone.getAttribute("data-dragging")).toBe("false");
  });
});
