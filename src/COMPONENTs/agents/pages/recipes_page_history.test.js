import React from "react";
import { render, fireEvent, act, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
      getRecipe: jest.fn(),
      saveRecipe: jest.fn(),
    },
  },
}));

const mockRecipe = {
  name: "test",
  nodes: [
    { id: "start", type: "start", outputs: [], x: 0, y: 0 },
    { id: "end", type: "end", x: 0, y: 0 },
  ],
  edges: [],
};

const { api } = require("../../../SERVICEs/api");

beforeEach(() => {
  api.unchain.listRecipes.mockReset();
  api.unchain.getRecipe.mockReset();
  api.unchain.saveRecipe.mockReset();
  api.unchain.listRecipes.mockResolvedValue({ recipes: [mockRecipe] });
  api.unchain.getRecipe.mockResolvedValue(mockRecipe);
  api.unchain.saveRecipe.mockResolvedValue({});
});

jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: () => <div data-testid="flow-editor" />,
}));

jest.mock("../../side-menu/side_menu_utils", () => ({
  getRuntimePlatform: () => "darwin",
}));

jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
    onWindowStateChange: () => () => {},
  },
}));

const buttonInside = (container, titleRegex) => {
  const wrap = container.querySelector(`[title*="${titleRegex}"]`);
  return wrap ? within(wrap).getByRole("button") : null;
};

describe("RecipesPage keyboard undo/redo", () => {
  test("Cmd+Z on document.body is a no-op when history is empty", async () => {
    const { container } = render(
      <RecipesPage
        isDark={false}
        selectedNodeId={null}
        onSelectNode={() => {}}
        fullscreen={false}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="flow-editor"]')).toBeTruthy();
    });
    const undoBtn = buttonInside(container, "Undo");
    expect(undoBtn).toBeTruthy();
    expect(undoBtn.disabled).toBe(true);
    act(() => {
      fireEvent.keyDown(document.body, {
        key: "z",
        metaKey: true,
        shiftKey: false,
      });
    });
    expect(undoBtn.disabled).toBe(true);
  });

  test("keydown is ignored when focus is in TEXTAREA", async () => {
    const { container } = render(
      <RecipesPage
        isDark={false}
        selectedNodeId={null}
        onSelectNode={() => {}}
        fullscreen={false}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="flow-editor"]')).toBeTruthy();
    });
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    expect(document.activeElement).toBe(ta);
    act(() => {
      fireEvent.keyDown(ta, {
        key: "z",
        metaKey: true,
        shiftKey: true,
      });
    });
    const redoBtn = buttonInside(container, "Redo");
    expect(redoBtn).toBeTruthy();
    expect(redoBtn.disabled).toBe(true);
    document.body.removeChild(ta);
  });
});
