import { fireEvent, screen } from "@testing-library/react";

/* The real editor opens a node on release, after ruling out a drag. Send the
 * complete pointer sequence; click also serves lightweight drawing probes. */

export function pressCanvasNode(nodeOrId) {
  const element =
    typeof nodeOrId === "string" ? screen.getByTestId(`skeleton-node-${nodeOrId}`) : nodeOrId;
  fireEvent.mouseDown(element, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseUp(window, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.click(element);
}

export function openAddNode() {
  fireEvent.doubleClick(screen.getByTestId("skeleton-canvas"));
}

export function openRunMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open the run menu" }));
}
