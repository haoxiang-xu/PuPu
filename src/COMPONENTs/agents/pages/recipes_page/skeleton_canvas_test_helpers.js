import { fireEvent, screen } from "@testing-library/react";

/* Test-only controls for the delivered dev canvas. Its selectable node is a
 * click target; the later frozen shell's mouse-down handler is not on dev. */

export function pressCanvasNode(nodeOrId) {
  const element =
    typeof nodeOrId === "string" ? screen.getByTestId(`skeleton-node-${nodeOrId}`) : nodeOrId;
  fireEvent.click(element);
}

export function openAddNode() {
  fireEvent.doubleClick(screen.getByTestId("skeleton-canvas"));
}

export function openRunMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open the run menu" }));
}
