import React from "react";
import { render, fireEvent, screen, within } from "@testing-library/react";
import RecipeCanvas from "./recipe_canvas";

jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: () => <div data-testid="flow-editor" />,
}));

const minimalRecipe = {
  name: "x",
  nodes: [
    { id: "start", type: "start", outputs: [], x: 0, y: 0 },
    { id: "end", type: "end", x: 0, y: 0 },
  ],
  edges: [],
};

const baseProps = {
  recipe: minimalRecipe,
  selectedNodeId: null,
  onSelectNode: () => {},
  onRecipeChange: () => {},
  onRecipeChangeSilent: () => {},
  onSave: () => {},
  dirty: false,
  isDark: false,
};

const buttonInside = (titleRegex) =>
  within(screen.getByTitle(titleRegex)).getByRole("button");

describe("RecipeCanvas Undo/Redo buttons", () => {
  test("renders Undo and Redo buttons in the overlay", () => {
    render(
      <RecipeCanvas
        {...baseProps}
        onUndo={() => {}}
        onRedo={() => {}}
        canUndo={false}
        canRedo={false}
      />,
    );
    expect(screen.getByTitle(/Undo/i)).toBeTruthy();
    expect(screen.getByTitle(/Redo/i)).toBeTruthy();
  });

  test("Undo button calls onUndo when canUndo is true", () => {
    const onUndo = jest.fn();
    render(
      <RecipeCanvas
        {...baseProps}
        onUndo={onUndo}
        onRedo={() => {}}
        canUndo={true}
        canRedo={false}
      />,
    );
    fireEvent.click(buttonInside(/Undo/i));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test("Undo button is disabled when canUndo is false", () => {
    const onUndo = jest.fn();
    render(
      <RecipeCanvas
        {...baseProps}
        onUndo={onUndo}
        onRedo={() => {}}
        canUndo={false}
        canRedo={false}
      />,
    );
    const btn = buttonInside(/Undo/i);
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onUndo).not.toHaveBeenCalled();
  });

  test("Redo button calls onRedo when canRedo is true", () => {
    const onRedo = jest.fn();
    render(
      <RecipeCanvas
        {...baseProps}
        onUndo={() => {}}
        onRedo={onRedo}
        canUndo={false}
        canRedo={true}
      />,
    );
    fireEvent.click(buttonInside(/Redo/i));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});

describe("the detail page never stays pinned to a node that is gone", () => {
  const withAgent = {
    ...minimalRecipe,
    nodes: [...minimalRecipe.nodes, { id: "agent_1", type: "agent", x: 0, y: 0 }],
  };

  test("removing the selected node closes the detail page", () => {
    const onSelectNode = jest.fn();
    const props = { ...baseProps, recipe: withAgent, selectedNodeId: "agent_1", onSelectNode };
    const { rerender } = render(<RecipeCanvas {...props} />);
    expect(onSelectNode).not.toHaveBeenCalled();

    /* Whatever removed it — the menu's Delete, the Delete key, an undo — the
     * canvas sees the node list without it. */
    rerender(<RecipeCanvas {...props} recipe={minimalRecipe} />);
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  test("removing a different node leaves the selection alone", () => {
    const onSelectNode = jest.fn();
    const props = { ...baseProps, recipe: withAgent, selectedNodeId: "agent_1", onSelectNode };
    const { rerender } = render(<RecipeCanvas {...props} />);
    rerender(
      <RecipeCanvas
        {...props}
        recipe={{ ...withAgent, nodes: withAgent.nodes.filter((n) => n.id !== "end") }}
      />,
    );
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  test("nothing selected means nothing to close", () => {
    const onSelectNode = jest.fn();
    const props = { ...baseProps, recipe: withAgent, selectedNodeId: null, onSelectNode };
    const { rerender } = render(<RecipeCanvas {...props} />);
    rerender(<RecipeCanvas {...props} recipe={minimalRecipe} />);
    expect(onSelectNode).not.toHaveBeenCalled();
  });
});
